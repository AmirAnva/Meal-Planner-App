package main

// SQLite persistence and schema migrations, kept separate from HTTP and domain validation.
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
	ErrRecipeNotFound     = errors.New("recipe not found")
	ErrPantryItemNotFound = errors.New("pantry item not found")
	ErrPantryItemExists   = errors.New("pantry item already exists")
	ErrDayNotFound        = errors.New("day not found")
	ErrMealNotFound       = errors.New("meal not found")
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
	// Legacy columns are tolerated so databases created by earlier app versions
	// can be upgraded in place without losing recipes or pantry data.
	_, err := db.Exec(`
CREATE TABLE IF NOT EXISTS recipes (
  recipe_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  ingredients TEXT NOT NULL DEFAULT '[]',
  instructions TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS pantry_items (
  pantry_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
  ingredient TEXT NOT NULL COLLATE NOCASE UNIQUE,
  quantity REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS ingredients (
  ingredient_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  recipe_id INTEGER NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(ingredient_id) ON DELETE CASCADE,
  quantity REAL,
  unit TEXT,
  PRIMARY KEY (recipe_id, ingredient_id)
);
CREATE TABLE IF NOT EXISTS grocery_items (
  grocery_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
  ingredient_id INTEGER REFERENCES ingredients(ingredient_id) ON DELETE SET NULL,
  name TEXT,
  quantity REAL,
  unit TEXT,
  purchased INTEGER NOT NULL DEFAULT 0
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
	if err := migratePantryQuantityColumns(db); err != nil {
		return err
	}
	return migrateNormalizedInventory(db)
}

func migrateNormalizedInventory(db *sql.DB) error {
	// Import legacy []string ingredient data once, then keep normalized
	// recipe_ingredients associations authoritative for future writes.
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	rows, err := tx.Query(`SELECT recipe_id, ingredients FROM recipes`)
	if err != nil {
		return err
	}
	type legacyRecipe struct {
		id         int
		ingredient []string
	}
	var recipes []legacyRecipe
	for rows.Next() {
		var item legacyRecipe
		var raw string
		if err := rows.Scan(&item.id, &raw); err != nil {
			rows.Close()
			return err
		}
		if err := json.Unmarshal([]byte(raw), &item.ingredient); err != nil {
			rows.Close()
			return fmt.Errorf("decode legacy recipe ingredients: %w", err)
		}
		recipes = append(recipes, item)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()

	for _, recipe := range recipes {
		for _, name := range recipe.ingredient {
			name = strings.TrimSpace(name)
			if name == "" {
				continue
			}
			if _, err := tx.Exec(`INSERT INTO ingredients(name) VALUES (?) ON CONFLICT(name) DO NOTHING`, name); err != nil {
				return err
			}
			if _, err := tx.Exec(`INSERT INTO recipe_ingredients(recipe_id, ingredient_id) SELECT ?, ingredient_id FROM ingredients WHERE name=? ON CONFLICT(recipe_id, ingredient_id) DO NOTHING`, recipe.id, name); err != nil {
				return err
			}
		}
	}

	pantryRows, err := tx.Query(`SELECT ingredient FROM pantry_items`)
	if err != nil {
		return err
	}
	var pantryNames []string
	for pantryRows.Next() {
		var name string
		if err := pantryRows.Scan(&name); err != nil {
			pantryRows.Close()
			return err
		}
		pantryNames = append(pantryNames, name)
	}
	if err := pantryRows.Err(); err != nil {
		pantryRows.Close()
		return err
	}
	pantryRows.Close()
	for _, name := range pantryNames {
		name = strings.TrimSpace(name)
		if name != "" {
			if _, err := tx.Exec(`INSERT INTO ingredients(name) VALUES (?) ON CONFLICT(name) DO NOTHING`, name); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

func migratePantryQuantityColumns(db *sql.DB) error {
	rows, err := db.Query(`PRAGMA table_info(pantry_items)`)
	if err != nil {
		return err
	}
	columns := make(map[string]bool)
	for rows.Next() {
		var cid, notNull, primaryKey int
		var name, columnType string
		var defaultValue sql.NullString
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &primaryKey); err != nil {
			rows.Close()
			return err
		}
		columns[name] = true
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if !columns["quantity"] {
		if _, err := db.Exec(`ALTER TABLE pantry_items ADD COLUMN quantity REAL NOT NULL DEFAULT 0`); err != nil {
			return err
		}
	}
	if !columns["unit"] {
		if _, err := db.Exec(`ALTER TABLE pantry_items ADD COLUMN unit TEXT NOT NULL DEFAULT ''`); err != nil {
			return err
		}
	}
	return nil
}

func (r *SQLiteRepository) Close() error { return r.db.Close() }

func (r *SQLiteRepository) syncRecipeIngredients(recipe Recipe) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM recipe_ingredients WHERE recipe_id=?`, recipe.ID); err != nil {
		return err
	}
	for _, name := range recipe.Ingredients {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		if _, err := tx.Exec(`INSERT INTO ingredients(name) VALUES (?) ON CONFLICT(name) DO NOTHING`, name); err != nil {
			return err
		}
		if _, err := tx.Exec(`INSERT INTO recipe_ingredients(recipe_id, ingredient_id) SELECT ?, ingredient_id FROM ingredients WHERE name=? ON CONFLICT(recipe_id, ingredient_id) DO NOTHING`, recipe.ID, name); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (r *SQLiteRepository) ListIngredients() ([]Ingredient, error) {
	rows, err := r.db.Query(`SELECT ingredient_id, name FROM ingredients ORDER BY name COLLATE NOCASE`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Ingredient{}
	for rows.Next() {
		var item Ingredient
		if err := rows.Scan(&item.ID, &item.Name); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *SQLiteRepository) CreateIngredient(item Ingredient) (Ingredient, error) {
	item.Name = strings.TrimSpace(item.Name)
	if item.Name == "" {
		return Ingredient{}, errors.New("ingredient name is required")
	}
	err := r.db.QueryRow(`INSERT INTO ingredients(name) VALUES (?) RETURNING ingredient_id, name`, item.Name).Scan(&item.ID, &item.Name)
	return item, err
}

func (r *SQLiteRepository) DeleteIngredient(id int) error {
	result, err := r.db.Exec(`DELETE FROM ingredients WHERE ingredient_id=?`, id)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *SQLiteRepository) ListGroceryItems() ([]GroceryItem, error) {
	rows, err := r.db.Query(`SELECT grocery_item_id, ingredient_id, name, quantity, unit, purchased FROM grocery_items ORDER BY grocery_item_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []GroceryItem{}
	for rows.Next() {
		var item GroceryItem
		var ingredientID sql.NullInt64
		var name, unit sql.NullString
		var quantity sql.NullFloat64
		var purchased int
		if err := rows.Scan(&item.ID, &ingredientID, &name, &quantity, &unit, &purchased); err != nil {
			return nil, err
		}
		if ingredientID.Valid {
			value := int(ingredientID.Int64)
			item.IngredientID = &value
		}
		if name.Valid {
			value := name.String
			item.Name = &value
		}
		if quantity.Valid {
			value := quantity.Float64
			item.Quantity = &value
		}
		if unit.Valid {
			value := unit.String
			item.Unit = &value
		}
		item.Purchased = purchased != 0
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *SQLiteRepository) CreateGroceryItem(item GroceryItem) (GroceryItem, error) {
	result, err := r.db.Exec(`INSERT INTO grocery_items(ingredient_id, name, quantity, unit, purchased) VALUES (?, ?, ?, ?, ?)`,
		item.IngredientID, item.Name, item.Quantity, item.Unit, item.Purchased)
	if err != nil {
		return GroceryItem{}, err
	}
	id, err := result.LastInsertId()
	if err == nil {
		item.ID = int(id)
	}
	return item, err
}

func (r *SQLiteRepository) DeleteGroceryItem(id int) error {
	result, err := r.db.Exec(`DELETE FROM grocery_items WHERE grocery_item_id=?`, id)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *SQLiteRepository) ListPantryItems() ([]PantryItem, error) {
	rows, err := r.db.Query(`SELECT pantry_item_id, ingredient, quantity, unit FROM pantry_items ORDER BY ingredient COLLATE NOCASE, pantry_item_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []PantryItem{}
	for rows.Next() {
		var item PantryItem
		if err := rows.Scan(&item.ID, &item.Ingredient, &item.Quantity, &item.Unit); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *SQLiteRepository) AddPantryItem(item PantryItem) (PantryItem, error) {
	if err := item.Validate(); err != nil {
		return PantryItem{}, err
	}
	item.Ingredient = strings.TrimSpace(item.Ingredient)
	tx, err := r.db.Begin()
	if err != nil {
		return PantryItem{}, err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`INSERT INTO ingredients(name) VALUES (?) ON CONFLICT(name) DO NOTHING`, item.Ingredient); err != nil {
		return PantryItem{}, err
	}
	result, err := tx.Exec(`INSERT INTO pantry_items(ingredient, quantity, unit) VALUES (?, ?, ?) ON CONFLICT(ingredient) DO NOTHING`, item.Ingredient, item.Quantity, item.Unit)
	if err != nil {
		return PantryItem{}, err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return PantryItem{}, err
	}
	if count == 0 {
		return PantryItem{}, ErrPantryItemExists
	}
	id, err := result.LastInsertId()
	if err != nil {
		return PantryItem{}, err
	}
	item.ID = int(id)
	if err := tx.Commit(); err != nil {
		return PantryItem{}, err
	}
	return item, nil
}

func (r *SQLiteRepository) UpdatePantryItem(id int, quantity PantryQuantity) (PantryItem, error) {
	if err := quantity.Validate(); err != nil {
		return PantryItem{}, err
	}
	result, err := r.db.Exec(`UPDATE pantry_items SET quantity = ?, unit = ? WHERE pantry_item_id = ?`, quantity.Quantity, quantity.Unit, id)
	if err != nil {
		return PantryItem{}, err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return PantryItem{}, err
	}
	if count == 0 {
		return PantryItem{}, ErrPantryItemNotFound
	}
	item := PantryItem{ID: id, Quantity: quantity.Quantity, Unit: quantity.Unit}
	err = r.db.QueryRow(`SELECT ingredient FROM pantry_items WHERE pantry_item_id = ?`, id).Scan(&item.Ingredient)
	return item, err
}

func (r *SQLiteRepository) DeletePantryItem(id int) error {
	result, err := r.db.Exec(`DELETE FROM pantry_items WHERE pantry_item_id = ?`, id)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return ErrPantryItemNotFound
	}
	return nil
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
	result, err := r.db.Exec(`INSERT INTO recipes(name, ingredients, instructions) VALUES (?, ?, ?)`, strings.TrimSpace(recipe.Name), string(ingredients), string(instructions))
	if err != nil {
		return Recipe{}, err
	}
	id, err := result.LastInsertId()
	recipe.ID = int(id)
	if err := r.syncRecipeIngredients(recipe); err != nil {
		return Recipe{}, err
	}
	return recipe, err
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
	result, err := r.db.Exec(`UPDATE recipes SET name=?, ingredients=?, instructions=? WHERE recipe_id=?`, strings.TrimSpace(recipe.Name), string(ingredients), string(instructions), recipe.ID)
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
	if err := r.syncRecipeIngredients(recipe); err != nil {
		return Recipe{}, err
	}
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

// scanRecipe supports both database rows and a single-row query result.
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
