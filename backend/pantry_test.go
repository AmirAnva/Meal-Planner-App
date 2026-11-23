package main

// Validation and persistence coverage for pantry inventory operations.
import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func TestPantryAPILifecycleAndPersistence(t *testing.T) {
	handler, databasePath := newTestAPI(t)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/pantry", nil))
	if response.Code != http.StatusOK || strings.TrimSpace(response.Body.String()) != "[]" {
		t.Fatalf("initial GET pantry = (%d, %s), want (200, [])", response.Code, response.Body.String())
	}

	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/pantry", strings.NewReader(`{"ingredient":"  Olive Oil  ","quantity":1.5,"unit":"l"}`)))
	if response.Code != http.StatusCreated {
		t.Fatalf("POST pantry status = %d, want %d: %s", response.Code, http.StatusCreated, response.Body.String())
	}
	var created PantryItem
	if err := json.Unmarshal(response.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode created pantry item: %v", err)
	}
	if created.IngredientID < 1 || created.Ingredient.Name != "Olive Oil" || created.Quantity != 1.5 || created.Unit == nil || *created.Unit != "l" {
		t.Fatalf("created pantry item = %+v, want trimmed Olive Oil with quantity 1.5 l", created)
	}

	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/pantry", strings.NewReader(`{"ingredient":"olive oil","quantity":1,"unit":"l"}`)))
	if response.Code != http.StatusOK {
		t.Fatalf("same-unit duplicate POST status = %d, want %d: %s", response.Code, http.StatusOK, response.Body.String())
	}
	var accumulated PantryItem
	if err := json.Unmarshal(response.Body.Bytes(), &accumulated); err != nil {
		t.Fatalf("decode accumulated pantry item: %v", err)
	}
	if accumulated.IngredientID != created.IngredientID || accumulated.Quantity != 2.5 || accumulated.Unit == nil || *accumulated.Unit != "l" {
		t.Fatalf("accumulated pantry item = %+v, want the original item at 2.5 l", accumulated)
	}
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/pantry", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("GET pantry status = %d, want %d: %s", response.Code, http.StatusOK, response.Body.String())
	}
	var pantryItemsAfterDuplicate []PantryItem
	if err := json.Unmarshal(response.Body.Bytes(), &pantryItemsAfterDuplicate); err != nil {
		t.Fatalf("decode pantry after same-unit duplicate: %v", err)
	}
	if len(pantryItemsAfterDuplicate) != 1 || pantryItemsAfterDuplicate[0].Quantity != 2.5 {
		t.Fatalf("pantry after same-unit duplicate = %+v, want one item at 2.5 l", pantryItemsAfterDuplicate)
	}

	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/pantry", strings.NewReader(`{"ingredient":"olive oil","quantity":250,"unit":"ml"}`)))
	if response.Code != http.StatusConflict {
		t.Fatalf("different-unit duplicate POST status = %d, want %d: %s", response.Code, http.StatusConflict, response.Body.String())
	}
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/pantry", nil))
	var pantryAfterUnitConflict []PantryItem
	if err := json.Unmarshal(response.Body.Bytes(), &pantryAfterUnitConflict); err != nil {
		t.Fatalf("decode pantry after different-unit duplicate: %v", err)
	}
	if response.Code != http.StatusOK || len(pantryAfterUnitConflict) != 1 || pantryAfterUnitConflict[0].Quantity != 2.5 {
		t.Fatalf("pantry after different-unit duplicate = (%d, %+v), want original item unchanged at 2.5 l", response.Code, pantryAfterUnitConflict)
	}

	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPut, "/api/pantry/1", strings.NewReader(`{"quantity":750,"unit":"ml"}`)))
	if response.Code != http.StatusOK {
		t.Fatalf("PUT pantry status = %d, want %d: %s", response.Code, http.StatusOK, response.Body.String())
	}
	if err := json.Unmarshal(response.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode updated pantry item: %v", err)
	}
	if created.Ingredient.Name != "Olive Oil" || created.Quantity != 750 || created.Unit == nil || *created.Unit != "ml" {
		t.Fatalf("updated pantry item = %+v, want Olive Oil with quantity 750 ml", created)
	}

	reloaded, err := OpenSQLiteRepository(databasePath)
	if err != nil {
		t.Fatalf("reopen pantry database: %v", err)
	}
	defer reloaded.Close()
	items, err := reloaded.ListPantryItems()
	if err != nil {
		t.Fatalf("list persisted pantry items: %v", err)
	}
	if len(items) != 1 ||
		items[0].IngredientID != created.IngredientID ||
		items[0].Ingredient.Name != created.Ingredient.Name ||
		items[0].Quantity != created.Quantity ||
		items[0].Unit == nil || created.Unit == nil || *items[0].Unit != *created.Unit {
		t.Fatalf("persisted pantry items = %+v, want [%+v]", items, created)
	}
}

func TestPantryAPIValidatesAndRemovesItems(t *testing.T) {
	handler, _ := newTestAPI(t)
	tests := []struct {
		name string
		body string
		want int
	}{
		{name: "missing ingredient", body: `{}`, want: http.StatusBadRequest},
		{name: "blank ingredient", body: `{"ingredient":"  "}`, want: http.StatusBadRequest},
		{name: "missing quantity", body: `{"ingredient":"Rice"}`, want: http.StatusBadRequest},
		{name: "non-positive quantity", body: `{"ingredient":"Rice","quantity":0,"unit":"g"}`, want: http.StatusBadRequest},
		{name: "unsupported unit", body: `{"ingredient":"Rice","quantity":1,"unit":"bucket"}`, want: http.StatusBadRequest},
		{name: "malformed JSON", body: `{"ingredient":`, want: http.StatusBadRequest},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/pantry", strings.NewReader(test.body)))
			if response.Code != test.want {
				t.Fatalf("POST pantry status = %d, want %d: %s", response.Code, test.want, response.Body.String())
			}
		})
	}

	createResponse := httptest.NewRecorder()
	handler.ServeHTTP(createResponse, httptest.NewRequest(http.MethodPost, "/api/pantry", strings.NewReader(`{"ingredient":"Tomatoes","quantity":3,"unit":"piece"}`)))
	var item PantryItem
	if err := json.Unmarshal(createResponse.Body.Bytes(), &item); err != nil {
		t.Fatalf("decode created pantry item: %v", err)
	}
	deleteResponse := httptest.NewRecorder()
	handler.ServeHTTP(deleteResponse, httptest.NewRequest(http.MethodDelete, "/api/pantry/"+strconv.Itoa(item.IngredientID), nil))
	if deleteResponse.Code != http.StatusNoContent {
		t.Fatalf("DELETE pantry item status = %d, want %d", deleteResponse.Code, http.StatusNoContent)
	}
	deleteResponse = httptest.NewRecorder()
	handler.ServeHTTP(deleteResponse, httptest.NewRequest(http.MethodDelete, "/api/pantry/"+strconv.Itoa(item.IngredientID), nil))
	if deleteResponse.Code != http.StatusNotFound {
		t.Fatalf("DELETE missing pantry item status = %d, want %d", deleteResponse.Code, http.StatusNotFound)
	}
}

func TestNormalizedPantryRoutes(t *testing.T) {
	handler, _ := newTestAPI(t)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/pantry-items", strings.NewReader(`{"ingredient":"Rice","quantity":2,"unit":"cup"}`)))
	if response.Code != http.StatusCreated {
		t.Fatalf("POST normalized pantry status = %d, want 201: %s", response.Code, response.Body.String())
	}

	var item PantryItem
	if err := json.Unmarshal(response.Body.Bytes(), &item); err != nil {
		t.Fatal(err)
	}
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPut, "/api/pantry-items/"+strconv.Itoa(item.IngredientID), strings.NewReader(`{"quantity":3,"unit":"cup"}`)))
	if response.Code != http.StatusOK {
		t.Fatalf("PUT normalized pantry status = %d, want 200: %s", response.Code, response.Body.String())
	}
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodDelete, "/api/pantry-items/"+strconv.Itoa(item.IngredientID), nil))
	if response.Code != http.StatusNoContent {
		t.Fatalf("DELETE normalized pantry status = %d, want 204: %s", response.Code, response.Body.String())
	}
}

func TestPantrySchemaMigrationPreservesExistingItems(t *testing.T) {
	databasePath := filepath.Join(t.TempDir(), "legacy.db")
	legacyDB, err := sql.Open("sqlite", databasePath)
	if err != nil {
		t.Fatalf("open legacy database: %v", err)
	}

	if _, err := legacyDB.Exec(`CREATE TABLE pantry_items (
		pantry_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
		ingredient TEXT NOT NULL COLLATE NOCASE UNIQUE
	); INSERT INTO pantry_items(ingredient) VALUES ('Flour')`); err != nil {
		legacyDB.Close()
		t.Fatalf("create legacy pantry table: %v", err)
	}
	if err := legacyDB.Close(); err != nil {
		t.Fatalf("close legacy database: %v", err)
	}

	repository, err := OpenSQLiteRepository(databasePath)
	if err != nil {
		t.Fatalf("open migrated database: %v", err)
	}
	defer repository.Close()
	items, err := repository.ListPantryItems()
	if err != nil {
		t.Fatalf("list migrated pantry items: %v", err)
	}
	want := PantryItem{IngredientID: 1, Ingredient: Ingredient{ID: 1, Name: "Flour"}}
	if len(items) != 1 || items[0] != want {
		t.Fatalf("migrated pantry items = %+v, want [%+v]", items, want)
	}
}

func TestPantrySchemaMigrationPreservesQuantityAndUnit(t *testing.T) {
	databasePath := filepath.Join(t.TempDir(), "legacy-with-quantity.db")
	legacyDB, err := sql.Open("sqlite", databasePath)
	if err != nil {
		t.Fatalf("open legacy database: %v", err)
	}
	if _, err := legacyDB.Exec(`CREATE TABLE pantry_items (
		pantry_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
		ingredient TEXT NOT NULL COLLATE NOCASE UNIQUE,
		quantity REAL NOT NULL DEFAULT 0,
		unit TEXT NOT NULL DEFAULT ''
	); INSERT INTO pantry_items(ingredient, quantity, unit) VALUES ('Olive oil', 1.5, 'l')`); err != nil {
		legacyDB.Close()
		t.Fatalf("create legacy pantry table: %v", err)
	}
	if err := legacyDB.Close(); err != nil {
		t.Fatalf("close legacy database: %v", err)
	}

	repository, err := OpenSQLiteRepository(databasePath)
	if err != nil {
		t.Fatalf("open migrated database: %v", err)
	}
	defer repository.Close()
	items, err := repository.ListPantryItems()
	if err != nil {
		t.Fatalf("list migrated pantry items: %v", err)
	}
	if len(items) != 1 || items[0].Ingredient.Name != "Olive oil" ||
		items[0].Quantity != 1.5 || items[0].Unit == nil || *items[0].Unit != "l" {
		t.Fatalf("migrated pantry items = %+v, want Olive oil at 1.5 l", items)
	}
}

func TestMealNewNormalizedDatabaseOpensWithoutLosingInventory(t *testing.T) {
	databasePath := filepath.Join(t.TempDir(), "normalized.db")
	database, err := sql.Open("sqlite", databasePath)
	if err != nil {
		t.Fatalf("open normalized database: %v", err)
	}
	_, err = database.Exec(`
CREATE TABLE recipes (
  recipe_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  ingredients TEXT NOT NULL DEFAULT '[]',
  instructions TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE ingredients (
  ingredient_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);
CREATE TABLE recipe_ingredients (
  recipe_id INTEGER NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(ingredient_id) ON DELETE CASCADE,
  quantity REAL,
  unit TEXT,
  PRIMARY KEY (recipe_id, ingredient_id)
);
CREATE TABLE pantry_items (
  ingredient_id INTEGER PRIMARY KEY REFERENCES ingredients(ingredient_id) ON DELETE CASCADE,
  quantity REAL NOT NULL DEFAULT 0,
  unit TEXT
);
CREATE TABLE grocery_items (
  grocery_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
  ingredient_id INTEGER REFERENCES ingredients(ingredient_id) ON DELETE SET NULL,
  name TEXT,
  quantity REAL,
  unit TEXT,
  purchased INTEGER NOT NULL DEFAULT 0
);
INSERT INTO recipes(name, ingredients, instructions) VALUES ('Bread', '["flour"]', '[]');
INSERT INTO ingredients(name) VALUES ('flour');
INSERT INTO recipe_ingredients(recipe_id, ingredient_id, quantity, unit) VALUES (1, 1, 2, 'cup');
INSERT INTO pantry_items(ingredient_id, quantity, unit) VALUES (1, 3, 'cup');
INSERT INTO grocery_items(ingredient_id, name, quantity, unit) VALUES (1, 'flour', 1, 'cup');`)
	if err != nil {
		database.Close()
		t.Fatalf("create normalized schema: %v", err)
	}
	if err := database.Close(); err != nil {
		t.Fatalf("close normalized database: %v", err)
	}

	repository, err := OpenSQLiteRepository(databasePath)
	if err != nil {
		t.Fatalf("open normalized database with meal9 repository: %v", err)
	}
	defer repository.Close()
	pantry, err := repository.ListPantryItems()
	if err != nil || len(pantry) != 1 || pantry[0].Ingredient.Name != "flour" || pantry[0].Quantity != 3 {
		t.Fatalf("pantry after merge = %+v, %v; want flour at 3 cups", pantry, err)
	}
	recipeIngredients, err := repository.ListRecipeIngredients(1)
	if err != nil || len(recipeIngredients) != 1 || recipeIngredients[0].Quantity == nil ||
		*recipeIngredients[0].Quantity != 2 || recipeIngredients[0].Unit == nil || *recipeIngredients[0].Unit != "cup" {
		t.Fatalf("recipe ingredients after merge = %+v, %v; want flour at 2 cups", recipeIngredients, err)
	}
	groceryItems, err := repository.ListGroceryItems()
	if err != nil || len(groceryItems) != 1 || groceryItems[0].Quantity == nil || *groceryItems[0].Quantity != 1 {
		t.Fatalf("grocery list after merge = %+v, %v; want flour at 1 cup", groceryItems, err)
	}
}

func TestPantryQuantityAcceptsCommonCookingUnits(t *testing.T) {
	for _, unit := range []string{"g", "cup", "fl oz", "piece", "clove", "pinch", "handful"} {
		if err := (PantryQuantity{Quantity: 1, Unit: unit}).Validate(); err != nil {
			t.Errorf("PantryQuantity unit %q validation error = %v", unit, err)
		}
	}
}
