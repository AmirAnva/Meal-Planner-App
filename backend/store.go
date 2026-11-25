package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

var (
	ErrRecipeNotFound  = errors.New("recipe not found")
	ErrDayNotFound     = errors.New("day not found")
	ErrMealNotFound    = errors.New("meal not found")
	ErrAccountNotFound = errors.New("account not found")
	ErrAccountExists   = errors.New("account already exists")
	ErrSessionNotFound = errors.New("session not found")
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
  instructions TEXT NOT NULL DEFAULT '[]'
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
);
CREATE TABLE IF NOT EXISTS ingredients (
 ingredient_id INTEGER PRIMARY KEY,
 name TEXT NOT NULL UNIQUE COLLATE NOCASE
);
CREATE TABLE IF NOT EXISTS recipe_ingredients (
 recipe_id INTEGER NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
 ingredient_id INTEGER NOT NULL REFERENCES ingredients(ingredient_id),
 quantity REAL,
 unit TEXT,
 PRIMARY KEY (recipe_id, ingredient_id)
);
CREATE TABLE IF NOT EXISTS grocery_items (
 grocery_item_id INTEGER PRIMARY KEY,
 ingredient_id INTEGER REFERENCES ingredients(ingredient_id),
 name TEXT,
 quantity REAL,
 unit TEXT,
 purchased INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS pantry_items (
 ingredient_id INTEGER PRIMARY KEY REFERENCES ingredients(ingredient_id),
 quantity REAL NOT NULL DEFAULT 0,
 unit TEXT
);
CREATE TABLE IF NOT EXISTS accounts (
  account_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  dietary_preferences TEXT NOT NULL DEFAULT '[]',
  dietary_restrictions TEXT NOT NULL DEFAULT '[]',
  typical_servings INTEGER NOT NULL CHECK (typical_servings BETWEEN 1 AND 20)
);
CREATE TABLE IF NOT EXISTS account_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY);`)
	if err != nil {
		return err
	}
	var migrated int
	if err := db.QueryRow(`SELECT COUNT(*) FROM schema_migrations WHERE version=1`).Scan(&migrated); err != nil {
		return err
	}
	if migrated != 0 {
		return nil
	}
	// Legacy recipe JSON is imported once. After this migration, recipe_ingredients
	// is authoritative and recipes.ingredients is maintained as a compatibility view.
	rows, err := db.Query(`SELECT recipe_id, ingredients FROM recipes`)
	if err != nil {
		return err
	}
	type legacyRecipe struct {
		id    int
		names []string
	}
	var legacy []legacyRecipe
	for rows.Next() {
		var item legacyRecipe
		var raw string
		if err := rows.Scan(&item.id, &raw); err != nil {
			rows.Close()
			return err
		}
		if err := json.Unmarshal([]byte(raw), &item.names); err != nil {
			rows.Close()
			return fmt.Errorf("decode legacy recipe ingredients: %w", err)
		}
		legacy = append(legacy, item)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	if err := rows.Close(); err != nil {
		return err
	}
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, recipe := range legacy {
		for _, name := range recipe.names {
			name = strings.TrimSpace(name)
			if name == "" {
				continue
			}
			if _, err := tx.Exec(`INSERT INTO ingredients(name) VALUES (?) ON CONFLICT(name) DO NOTHING`, name); err != nil {
				return err
			}
			if _, err := tx.Exec(`INSERT OR IGNORE INTO recipe_ingredients(recipe_id, ingredient_id) SELECT ?, ingredient_id FROM ingredients WHERE name=?`, recipe.id, name); err != nil {
				return err
			}
		}
	}
	if _, err := tx.Exec(`INSERT INTO schema_migrations(version) VALUES(1)`); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *SQLiteRepository) Close() error { return r.db.Close() }

func (r *SQLiteRepository) CreateAccount(account Account, passwordHash string) (Account, error) {
	preferences, err := json.Marshal(account.DietaryPreferences)
	if err != nil {
		return Account{}, err
	}
	restrictions, err := json.Marshal(account.DietaryRestrictions)
	if err != nil {
		return Account{}, err
	}
	result, err := r.db.Exec(`INSERT INTO accounts(name, password_hash, dietary_preferences, dietary_restrictions, typical_servings) VALUES (?, ?, ?, ?, ?)`,
		account.Name, passwordHash, string(preferences), string(restrictions), account.TypicalServings)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique constraint failed: accounts.name") {
			return Account{}, ErrAccountExists
		}
		return Account{}, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return Account{}, err
	}
	account.ID = id
	return account, nil
}

func (r *SQLiteRepository) GetAccount(id int64) (Account, error) {
	account, _, err := scanAccount(r.db.QueryRow(`SELECT account_id, name, dietary_preferences, dietary_restrictions, typical_servings, password_hash FROM accounts WHERE account_id=?`, id))
	return account, err
}

func (r *SQLiteRepository) GetAccountByName(name string) (Account, string, error) {
	account, passwordHash, err := scanAccount(r.db.QueryRow(`SELECT account_id, name, dietary_preferences, dietary_restrictions, typical_servings, password_hash FROM accounts WHERE name=? COLLATE NOCASE`, name))
	return account, passwordHash, err
}

func (r *SQLiteRepository) UpdateAccount(account Account, passwordHash string) (Account, error) {
	preferences, err := json.Marshal(account.DietaryPreferences)
	if err != nil {
		return Account{}, err
	}
	restrictions, err := json.Marshal(account.DietaryRestrictions)
	if err != nil {
		return Account{}, err
	}
	tx, err := r.db.Begin()
	if err != nil {
		return Account{}, err
	}
	defer tx.Rollback()

	var duplicate int64
	err = tx.QueryRow(`SELECT account_id FROM accounts WHERE name=? COLLATE NOCASE AND account_id<>?`, account.Name, account.ID).Scan(&duplicate)
	if err == nil {
		return Account{}, ErrAccountExists
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return Account{}, err
	}

	query := `UPDATE accounts SET name=?, dietary_preferences=?, dietary_restrictions=?, typical_servings=?`
	args := []any{account.Name, string(preferences), string(restrictions), account.TypicalServings}
	if passwordHash != "" {
		query += `, password_hash=?`
		args = append(args, passwordHash)
	}
	query += ` WHERE account_id=?`
	args = append(args, account.ID)
	result, err := tx.Exec(query, args...)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique constraint failed: accounts.name") {
			return Account{}, ErrAccountExists
		}
		return Account{}, err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return Account{}, err
	}
	if count == 0 {
		return Account{}, ErrAccountNotFound
	}
	if err := tx.Commit(); err != nil {
		return Account{}, err
	}
	return account, nil
}

func (r *SQLiteRepository) CreateAccountSession(accountID int64, tokenHash string, expiresAt int64) error {
	if _, err := r.db.Exec(`DELETE FROM account_sessions WHERE expires_at<=?`, time.Now().Unix()); err != nil {
		return err
	}
	_, err := r.db.Exec(`INSERT INTO account_sessions(token_hash, account_id, expires_at) VALUES (?, ?, ?)`, tokenHash, accountID, expiresAt)
	return err
}

func (r *SQLiteRepository) GetAccountIDBySession(tokenHash string) (int64, error) {
	var accountID int64
	err := r.db.QueryRow(`SELECT account_id FROM account_sessions WHERE token_hash=? AND expires_at>?`, tokenHash, time.Now().Unix()).Scan(&accountID)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, ErrSessionNotFound
	}
	return accountID, err
}

func (r *SQLiteRepository) DeleteAccountSession(tokenHash string) error {
	_, err := r.db.Exec(`DELETE FROM account_sessions WHERE token_hash=?`, tokenHash)
	return err
}

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
	ingredients, err := json.Marshal(recipe.Ingredients)
	if err != nil {
		return Recipe{}, err
	}
	instructions, err := json.Marshal(recipe.Instructions)
	if err != nil {
		return Recipe{}, err
	}
	tx, err := r.db.Begin()
	if err != nil {
		return Recipe{}, err
	}
	defer tx.Rollback()
	result, err := tx.Exec(`INSERT INTO recipes(name, ingredients, instructions) VALUES (?, ?, ?)`, strings.TrimSpace(recipe.Name), string(ingredients), string(instructions))
	if err != nil {
		return Recipe{}, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return Recipe{}, err
	}
	recipe.ID = int(id)
	if err = syncRecipeIngredientsTx(tx, recipe.ID, recipe.Ingredients); err != nil {
		return Recipe{}, err
	}
	return recipe, tx.Commit()
}

func (r *SQLiteRepository) ListRecipes() ([]Recipe, error) {
	rows, err := r.db.Query(`SELECT recipe_id, name, ingredients, instructions FROM recipes ORDER BY recipe_id`)
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
	recipe, err := scanRecipe(r.db.QueryRow(`SELECT recipe_id, name, ingredients, instructions FROM recipes WHERE recipe_id = ?`, id))
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
	ingredients, err := json.Marshal(recipe.Ingredients)
	if err != nil {
		return Recipe{}, err
	}
	instructions, err := json.Marshal(recipe.Instructions)
	if err != nil {
		return Recipe{}, err
	}
	tx, err := r.db.Begin()
	if err != nil {
		return Recipe{}, err
	}
	defer tx.Rollback()
	result, err := tx.Exec(`UPDATE recipes SET name=?, ingredients=?, instructions=? WHERE recipe_id=?`, strings.TrimSpace(recipe.Name), string(ingredients), string(instructions), recipe.ID)
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
	if err := syncRecipeIngredientsTx(tx, recipe.ID, recipe.Ingredients); err != nil {
		return Recipe{}, err
	}
	recipe.Name = strings.TrimSpace(recipe.Name)
	return recipe, tx.Commit()
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

// SearchRecipes matches a case-insensitive keyword across the name,
// ingredients, and instructions fields.
func (r *SQLiteRepository) SearchRecipes(query string) ([]Recipe, error) {
	keywords := strings.Fields(strings.ToLower(query))
	if len(keywords) == 0 {
		return []Recipe{}, nil
	}
	conditions := make([]string, len(keywords))
	args := make([]any, len(keywords))
	for i, keyword := range keywords {
		conditions[i] = `lower(name || ' ' || ingredients || ' ' || instructions) LIKE ?`
		args[i] = "%" + keyword + "%"
	}
	querySQL := `SELECT recipe_id, name, ingredients, instructions FROM recipes WHERE ` + strings.Join(conditions, " OR ") + ` ORDER BY recipe_id`
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
	var ingredients, instructions string
	if err := row.Scan(&recipe.ID, &recipe.Name, &ingredients, &instructions); err != nil {
		return Recipe{}, err
	}
	if err := json.Unmarshal([]byte(ingredients), &recipe.Ingredients); err != nil {
		return Recipe{}, fmt.Errorf("decode ingredients: %w", err)
	}
	if err := json.Unmarshal([]byte(instructions), &recipe.Instructions); err != nil {
		return Recipe{}, fmt.Errorf("decode instructions: %w", err)
	}
	return recipe, nil
}

func scanAccount(row scanner) (Account, string, error) {
	var account Account
	var preferences, restrictions, passwordHash string
	if err := row.Scan(&account.ID, &account.Name, &preferences, &restrictions, &account.TypicalServings, &passwordHash); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Account{}, "", ErrAccountNotFound
		}
		return Account{}, "", err
	}
	if err := json.Unmarshal([]byte(preferences), &account.DietaryPreferences); err != nil {
		return Account{}, "", fmt.Errorf("decode account dietary preferences: %w", err)
	}
	if err := json.Unmarshal([]byte(restrictions), &account.DietaryRestrictions); err != nil {
		return Account{}, "", fmt.Errorf("decode account dietary restrictions: %w", err)
	}
	return account, passwordHash, nil
}
