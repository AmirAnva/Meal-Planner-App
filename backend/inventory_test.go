package main

import (
	"database/sql"
	"errors"
	"math"
	"path/filepath"
	"testing"
)

// Chelsea Zhuang
func TestRecipeIngredientValidation(t *testing.T) {
	valid := RecipeIngredient{RecipeID: 1, IngredientID: 2}
	if err := valid.Validate(); err != nil {
		t.Fatalf("valid association: %v", err)
	}
	negative := -1.0
	for _, item := range []RecipeIngredient{
		{RecipeID: 0, IngredientID: 2},
		{RecipeID: 1, IngredientID: 0},
		{RecipeID: 1, IngredientID: 2, Quantity: &negative},
		{RecipeID: 1, IngredientID: 2, Quantity: floatPointer(math.NaN())},
		{RecipeID: 1, IngredientID: 2, Unit: stringPointer("  ")},
	} {
		if err := item.Validate(); err == nil {
			t.Errorf("Validate(%+v) succeeded", item)
		}
	}
}

// Chelsea Zhuang
func TestRecipeIngredientPersistenceAndLegacyJSONSync(t *testing.T) {
	repo := newTestRepository(t)
	recipe, err := repo.CreateRecipe(Recipe{Name: "Soup"})
	if err != nil {
		t.Fatal(err)
	}
	ingredient, err := repo.CreateIngredient(Ingredient{Name: "Carrot"})
	if err != nil {
		t.Fatal(err)
	}
	quantity := 2.0
	unit := "cups"
	if err := repo.SetRecipeIngredients(recipe.ID, []RecipeIngredient{{RecipeID: recipe.ID, IngredientID: ingredient.ID, Quantity: &quantity, Unit: &unit}}); err != nil {
		t.Fatal(err)
	}
	items, err := repo.ListRecipeIngredients(recipe.ID)
	if err != nil || len(items) != 1 || items[0].Quantity == nil || *items[0].Quantity != quantity || items[0].Unit == nil || *items[0].Unit != unit {
		t.Fatalf("ListRecipeIngredients() = %+v, %v", items, err)
	}
	got, err := repo.GetRecipe(recipe.ID)
	if err != nil || len(got.Ingredients) != 1 || got.Ingredients[0] != "2 cups Carrot" {
		t.Fatalf("GetRecipe() = %+v, %v", got, err)
	}
	if err := repo.SetRecipeIngredients(recipe.ID, nil); err != nil {
		t.Fatal(err)
	}
	got, err = repo.GetRecipe(recipe.ID)
	if err != nil || len(got.Ingredients) != 0 {
		t.Fatalf("recipe JSON after clearing associations = %+v, %v", got, err)
	}
}

// Chelsea Zhuang
func TestLegacyIngredientMigrationRunsOnce(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`CREATE TABLE recipes(recipe_id INTEGER PRIMARY KEY, name TEXT NOT NULL, ingredients TEXT NOT NULL, instructions TEXT NOT NULL); INSERT INTO recipes VALUES(1,'Legacy','["beans"]','[]')`); err != nil {
		t.Fatal(err)
	}
	if err = db.Close(); err != nil {
		t.Fatal(err)
	}
	repo, err := OpenSQLiteRepository(path)
	if err != nil {
		t.Fatal(err)
	}
	var ingredientID int
	if err = repo.db.QueryRow(`SELECT ingredient_id FROM ingredients WHERE name='beans'`).Scan(&ingredientID); err != nil {
		t.Fatal(err)
	}
	if _, err = repo.db.Exec(`DELETE FROM recipe_ingredients WHERE recipe_id=1 AND ingredient_id=?`, ingredientID); err != nil {
		t.Fatal(err)
	}
	if err = repo.Close(); err != nil {
		t.Fatal(err)
	}
	repo, err = OpenSQLiteRepository(path)
	if err != nil {
		t.Fatal(err)
	}
	defer repo.Close()
	var count int
	if err = repo.db.QueryRow(`SELECT COUNT(*) FROM recipe_ingredients WHERE recipe_id=1 AND ingredient_id=?`, ingredientID).Scan(&count); err != nil || count != 0 {
		t.Fatalf("association count after reopen = %d, %v; want 0", count, err)
	}
}

// Chelsea Zhuang
func TestPantryAndGroceryValidationAndMissingDeletes(t *testing.T) {
	repo := newTestRepository(t)
	ingredient, err := repo.CreateIngredient(Ingredient{Name: "Rice"})
	if err != nil {
		t.Fatal(err)
	}
	if err := repo.PutPantryItem(PantryItem{IngredientID: ingredient.ID, Quantity: 3}); err != nil {
		t.Fatal(err)
	}
	if err := repo.PutPantryItem(PantryItem{IngredientID: ingredient.ID, Quantity: math.Inf(1)}); err == nil {
		t.Fatal("infinite pantry quantity was accepted")
	}
	if _, err := repo.CreateGroceryItem(GroceryItem{}); err == nil {
		t.Fatal("empty grocery item was accepted")
	}
	name := "Rice"
	item, err := repo.CreateGroceryItem(GroceryItem{Name: &name})
	if err != nil {
		t.Fatal(err)
	}
	item.Purchased = true
	updated, err := repo.UpdateGroceryItem(item)
	if err != nil || !updated.Purchased {
		t.Fatalf("UpdateGroceryItem() = %+v, %v", updated, err)
	}
	if err := repo.DeleteGroceryItem(item.ID + 999); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("missing grocery delete error = %v", err)
	}
	if err := repo.DeletePantryItem(ingredient.ID + 999); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("missing pantry delete error = %v", err)
	}
}

// Chelsea Zhuang
func floatPointer(v float64) *float64 { return &v }

// Chelsea Zhuang
func stringPointer(v string) *string { return &v }
