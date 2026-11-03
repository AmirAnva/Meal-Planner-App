package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	_ "modernc.org/sqlite"
)

var (
	ErrRecipeNotFound = errors.New("recipe not found")
	ErrDayNotFound    = errors.New("day not found")
	ErrMealNotFound   = errors.New("meal not found")
)

// SQLiteRepository owns the database connection and all SQL persistence.
type SQLiteRepository struct{ db *sql.DB }

func OpenSQLiteRepository(path string) (*SQLiteRepository, error) {
	if path == "" {
		return nil, errors.New("database path is required")
	}
	if path != ":memory:" {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return nil, err
		}
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if _, err = db.Exec(`PRAGMA foreign_keys = ON`); err == nil {
		err = createSchema(db)
	}
	if err == nil {
		var enabled int
		err = db.QueryRow(`PRAGMA foreign_keys`).Scan(&enabled)
		if err == nil && enabled != 1 {
			err = errors.New("SQLite foreign keys are disabled")
		}
	}
	if err != nil {
		db.Close()
		return nil, err
	}
	return &SQLiteRepository{db: db}, nil
}

func createSchema(db *sql.DB) error {
	_, err := db.Exec(`
CREATE TABLE IF NOT EXISTS recipes (
  recipe_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  ingredients TEXT NOT NULL DEFAULT '[]',
  instructions TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS days (
  day_id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS meals (
  meal_id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_id INTEGER NOT NULL REFERENCES days(day_id) ON DELETE CASCADE,
  recipe_id INTEGER NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner')),
  UNIQUE(day_id, meal_type)
);`)
	if err != nil {
		return err
	}
	var tagsColumn int
	err = db.QueryRow(`SELECT COUNT(*) FROM pragma_table_info('recipes') WHERE name = 'tags'`).Scan(&tagsColumn)
	if err != nil {
		return err
	}
	if tagsColumn == 0 {
		_, err = db.Exec(`ALTER TABLE recipes ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'`)
	}
	return err
}

func (r *SQLiteRepository) Close() error { return r.db.Close() }

func (r *SQLiteRepository) CreateRecipe(recipe Recipe) (Recipe, error) {
	if err := recipe.Validate(); err != nil {
		return Recipe{}, err
	}
	if recipe.Ingredients == nil {
		recipe.Ingredients = []string{}
	}
	if recipe.Instructions == nil {
		recipe.Instructions = []string{}
	}
	recipe.Tags = normalizeTags(recipe.Tags)
	ingredients, err := json.Marshal(recipe.Ingredients)
	if err != nil {
		return Recipe{}, err
	}
	instructions, err := json.Marshal(recipe.Instructions)
	if err != nil {
		return Recipe{}, err
	}
	tags, err := json.Marshal(recipe.Tags)
	if err != nil {
		return Recipe{}, err
	}
	result, err := r.db.Exec(`INSERT INTO recipes(name, ingredients, instructions, tags) VALUES (?, ?, ?, ?)`, strings.TrimSpace(recipe.Name), string(ingredients), string(instructions), string(tags))
	if err != nil {
		return Recipe{}, err
	}
	id, err := result.LastInsertId()
	recipe.ID = int(id)
	return recipe, err
}

func (r *SQLiteRepository) ListRecipes() ([]Recipe, error) {
	rows, err := r.db.Query(`SELECT recipe_id, name, ingredients, instructions, tags FROM recipes ORDER BY recipe_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []Recipe{}
	for rows.Next() {
		recipe, err := scanRecipe(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, recipe)
	}
	return result, rows.Err()
}

func (r *SQLiteRepository) GetRecipe(id int) (Recipe, error) {
	recipe, err := scanRecipe(r.db.QueryRow(`SELECT recipe_id, name, ingredients, instructions, tags FROM recipes WHERE recipe_id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return Recipe{}, ErrRecipeNotFound
	}
	return recipe, err
}

func (r *SQLiteRepository) UpdateRecipe(recipe Recipe) (Recipe, error) {
	if err := recipe.Validate(); err != nil {
		return Recipe{}, err
	}
	if recipe.Ingredients == nil {
		recipe.Ingredients = []string{}
	}
	if recipe.Instructions == nil {
		recipe.Instructions = []string{}
	}
	recipe.Tags = normalizeTags(recipe.Tags)
	ingredients, err := json.Marshal(recipe.Ingredients)
	if err != nil {
		return Recipe{}, err
	}
	instructions, err := json.Marshal(recipe.Instructions)
	if err != nil {
		return Recipe{}, err
	}
	tags, err := json.Marshal(recipe.Tags)
	if err != nil {
		return Recipe{}, err
	}
	result, err := r.db.Exec(`UPDATE recipes SET name=?, ingredients=?, instructions=?, tags=? WHERE recipe_id=?`, strings.TrimSpace(recipe.Name), string(ingredients), string(instructions), string(tags), recipe.ID)
	if err != nil {
		return Recipe{}, err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return Recipe{}, err
	}
	if count == 0 {
		return Recipe{}, ErrRecipeNotFound
	}
	recipe.Name = strings.TrimSpace(recipe.Name)
	return recipe, nil
}

func (r *SQLiteRepository) DeleteRecipe(id int) error {
	result, err := r.db.Exec(`DELETE FROM recipes WHERE recipe_id=?`, id)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return ErrRecipeNotFound
	}
	return nil
}

// SearchRecipes matches case-insensitive keywords across recipe names,
// ingredients, and tags.
func (r *SQLiteRepository) SearchRecipes(query string) ([]Recipe, error) {
	keywords := strings.Fields(strings.ToLower(query))
	if len(keywords) == 0 {
		return []Recipe{}, nil
	}
	conditions := make([]string, len(keywords))
	args := make([]any, len(keywords))
	for i, keyword := range keywords {
		conditions[i] = `lower(name || ' ' || ingredients || ' ' || tags) LIKE ?`
		args[i] = "%" + keyword + "%"
	}
	querySQL := `SELECT recipe_id, name, ingredients, instructions, tags FROM recipes WHERE ` + strings.Join(conditions, " OR ") + ` ORDER BY recipe_id`
	rows, err := r.db.Query(querySQL, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []Recipe{}
	for rows.Next() {
		recipe, err := scanRecipe(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, recipe)
	}
	return result, rows.Err()
}

func (r *SQLiteRepository) GetOrCreateDay(date string) (Day, error) {
	if err := (Day{Date: date}).Validate(); err != nil {
		return Day{}, err
	}
	_, err := r.db.Exec(`INSERT INTO days(date) VALUES (?) ON CONFLICT(date) DO NOTHING`, date)
	if err != nil {
		return Day{}, err
	}
	var day Day
	err = r.db.QueryRow(`SELECT day_id, date FROM days WHERE date=?`, date).Scan(&day.ID, &day.Date)
	return day, err
}

func (r *SQLiteRepository) GetDay(date string) (Day, error) {
	var day Day
	err := r.db.QueryRow(`SELECT day_id, date FROM days WHERE date=?`, date).Scan(&day.ID, &day.Date)
	if errors.Is(err, sql.ErrNoRows) {
		return Day{}, ErrDayNotFound
	}
	return day, err
}

func (r *SQLiteRepository) AssignMeal(dayID, recipeID int, mealType MealType) (Meal, error) {
	meal := Meal{DayID: dayID, RecipeID: recipeID, MealType: mealType}
	if err := meal.Validate(); err != nil {
		return Meal{}, err
	}
	if _, err := r.GetRecipe(recipeID); err != nil {
		return Meal{}, err
	}
	_, err := r.db.Exec(`INSERT INTO meals(day_id, recipe_id, meal_type) VALUES (?, ?, ?) ON CONFLICT(day_id, meal_type) DO UPDATE SET recipe_id=excluded.recipe_id`, dayID, recipeID, string(mealType))
	if err != nil {
		return Meal{}, err
	}
	return r.GetMeal(dayID, mealType)
}

func (r *SQLiteRepository) GetMeal(dayID int, mealType MealType) (Meal, error) {
	var meal Meal
	err := r.db.QueryRow(`SELECT meal_id, day_id, recipe_id, meal_type FROM meals WHERE day_id=? AND meal_type=?`, dayID, string(mealType)).Scan(&meal.ID, &meal.DayID, &meal.RecipeID, &meal.MealType)
	if errors.Is(err, sql.ErrNoRows) {
		return Meal{}, ErrMealNotFound
	}
	if err != nil {
		return Meal{}, err
	}
	meal.Recipe, err = r.GetRecipe(meal.RecipeID)
	return meal, err
}

func (r *SQLiteRepository) ListMeals(dayID int) ([]Meal, error) {
	rows, err := r.db.Query(`SELECT meal_id, day_id, recipe_id, meal_type FROM meals WHERE day_id=? ORDER BY CASE meal_type WHEN 'breakfast' THEN 1 WHEN 'lunch' THEN 2 ELSE 3 END`, dayID)
	if err != nil {
		return nil, err
	}
	result := []Meal{}
	for rows.Next() {
		var meal Meal
		if err := rows.Scan(&meal.ID, &meal.DayID, &meal.RecipeID, &meal.MealType); err != nil {
			rows.Close()
			return nil, err
		}
		result = append(result, meal)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	for i := range result {
		result[i].Recipe, err = r.GetRecipe(result[i].RecipeID)
		if err != nil {
			return nil, err
		}
	}
	return result, nil
}

func (r *SQLiteRepository) RemoveMeal(dayID int, mealType MealType) error {
	result, err := r.db.Exec(`DELETE FROM meals WHERE day_id=? AND meal_type=?`, dayID, string(mealType))
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return ErrMealNotFound
	}
	return nil
}

type scanner interface{ Scan(...any) error }

func scanRecipe(row scanner) (Recipe, error) {
	var recipe Recipe
	var ingredients, instructions, tags string
	if err := row.Scan(&recipe.ID, &recipe.Name, &ingredients, &instructions, &tags); err != nil {
		return Recipe{}, err
	}
	if err := json.Unmarshal([]byte(ingredients), &recipe.Ingredients); err != nil {
		return Recipe{}, fmt.Errorf("decode ingredients: %w", err)
	}
	if err := json.Unmarshal([]byte(instructions), &recipe.Instructions); err != nil {
		return Recipe{}, fmt.Errorf("decode instructions: %w", err)
	}
	if err := json.Unmarshal([]byte(tags), &recipe.Tags); err != nil {
		return Recipe{}, fmt.Errorf("decode tags: %w", err)
	}
	return recipe, nil
}

func normalizeTags(tags []string) []string {
	result := make([]string, 0, len(tags))
	seen := make(map[string]struct{}, len(tags))
	for _, tag := range tags {
		tag = strings.TrimSpace(tag)
		if tag == "" {
			continue
		}
		key := strings.ToLower(tag)
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, tag)
	}
	return result
}
