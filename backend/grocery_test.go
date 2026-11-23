package main

import (
	"errors"
	"math"
	"testing"
)

func createRecipeWithIngredient(t *testing.T, repo *SQLiteRepository, recipeName, ingredientName string, quantity *float64, unit *string) (Recipe, Ingredient) {
	t.Helper()
	recipe, err := repo.CreateRecipe(Recipe{Name: recipeName})
	if err != nil {
		t.Fatal(err)
	}
	ingredient, err := repo.CreateIngredient(Ingredient{Name: ingredientName})
	if err != nil {
		t.Fatal(err)
	}
	if err := repo.SetRecipeIngredients(recipe.ID, []RecipeIngredient{{RecipeID: recipe.ID, IngredientID: ingredient.ID, Quantity: quantity, Unit: unit}}); err != nil {
		t.Fatal(err)
	}
	return recipe, ingredient
}

func requirementFor(t *testing.T, requirements []GroceryRequirement, ingredientID int) GroceryRequirement {
	t.Helper()
	for _, requirement := range requirements {
		if requirement.Ingredient.ID == ingredientID {
			return requirement
		}
	}
	t.Fatalf("requirement for ingredient %d not found in %+v", ingredientID, requirements)
	return GroceryRequirement{}
}

func TestGenerateGroceryRequirementsAggregatesAndCountsRepeatedRecipes(t *testing.T) {
	repo := newTestRepository(t)
	qtyA, unitA := 2.0, "cups"
	first, flour := createRecipeWithIngredient(t, repo, "Bread", "Flour", &qtyA, &unitA)
	qtyB, unitB := 250.0, "ml"
	second, err := repo.CreateRecipe(Recipe{Name: "Pancakes"})
	if err != nil {
		t.Fatal(err)
	}
	if err := repo.SetRecipeIngredients(second.ID, []RecipeIngredient{{RecipeID: second.ID, IngredientID: flour.ID, Quantity: &qtyB, Unit: &unitB}}); err != nil {
		t.Fatal(err)
	}

	requirements, err := repo.GenerateGroceryRequirements([]int{first.ID, second.ID, first.ID})
	if err != nil {
		t.Fatal(err)
	}
	got := requirementFor(t, requirements, flour.ID)
	want := 4 + 250.0/236.5882365
	if math.Abs(got.RequiredQuantity-want) > 1e-9 || got.Unit != "cups" {
		t.Fatalf("aggregated requirement = %+v, want %.10f cups", got, want)
	}
	if got.Status != "missing" || got.MissingQuantity != got.RequiredQuantity {
		t.Fatalf("requirement without pantry stock = %+v, want missing", got)
	}
}

func TestGenerateGroceryRequirementsReportsPantryShortageAcrossUnits(t *testing.T) {
	repo := newTestRepository(t)
	quantity, unit := 1.0, "kg"
	recipe, rice := createRecipeWithIngredient(t, repo, "Rice Bowl", "Rice", &quantity, &unit)
	grams, gramUnit := 300.0, "g"
	if err := repo.PutPantryItem(PantryItem{IngredientID: rice.ID, Quantity: grams, Unit: &gramUnit}); err != nil {
		t.Fatal(err)
	}

	requirements, err := repo.GenerateGroceryRequirements([]int{recipe.ID})
	if err != nil {
		t.Fatal(err)
	}
	got := requirementFor(t, requirements, rice.ID)
	if got.Status != "insufficient" || !got.PantryComparable || math.Abs(got.PantryQuantity-.3) > 1e-9 || math.Abs(got.MissingQuantity-.7) > 1e-9 {
		t.Fatalf("pantry shortage = %+v, want 0.3 kg available and 0.7 kg missing", got)
	}
}

func TestGenerateGroceryRequirementsDistinguishesIncompatiblePantryUnits(t *testing.T) {
	repo := newTestRepository(t)
	quantity, unit := 2.0, "cups"
	recipe, beans := createRecipeWithIngredient(t, repo, "Bean Stew", "Beans", &quantity, &unit)
	stock, stockUnit := 300.0, "g"
	if err := repo.PutPantryItem(PantryItem{IngredientID: beans.ID, Quantity: stock, Unit: &stockUnit}); err != nil {
		t.Fatal(err)
	}

	requirements, err := repo.GenerateGroceryRequirements([]int{recipe.ID})
	if err != nil {
		t.Fatal(err)
	}
	got := requirementFor(t, requirements, beans.ID)
	if got.Status != "incomparable" || got.PantryComparable || got.MissingQuantity != 0 {
		t.Fatalf("incompatible pantry comparison = %+v, want incomparable and unknown missing quantity", got)
	}
	added, err := repo.AddMissingRequirements(requirements)
	if err != nil || len(added) != 0 {
		t.Fatalf("AddMissingRequirements for incomparable pantry = %+v, %v; want no automatic addition", added, err)
	}
}

func TestGenerateGroceryRequirementsRejectsIncompleteQuantities(t *testing.T) {
	repo := newTestRepository(t)
	unit := "g"
	recipe, _ := createRecipeWithIngredient(t, repo, "Soup", "Salt", nil, &unit)
	if _, err := repo.GenerateGroceryRequirements([]int{recipe.ID}); !errors.Is(err, ErrIncompleteRecipeIngredients) {
		t.Fatalf("GenerateGroceryRequirements error = %v, want incomplete ingredient error", err)
	}
}

func TestAddMissingRequirementsRollsBackAllWritesOnFailure(t *testing.T) {
	repo := newTestRepository(t)
	valid, err := repo.CreateIngredient(Ingredient{Name: "Oats"})
	if err != nil {
		t.Fatal(err)
	}
	validRequirement := GroceryRequirement{Ingredient: valid, RequiredQuantity: 2, Unit: "cups", MissingQuantity: 2, Status: "missing"}
	missingIngredient := Ingredient{ID: 99999, Name: "Invalid"}
	invalidRequirement := GroceryRequirement{Ingredient: missingIngredient, RequiredQuantity: 1, Unit: "g", MissingQuantity: 1, Status: "missing"}
	if _, err := repo.AddMissingRequirements([]GroceryRequirement{validRequirement, invalidRequirement}); err == nil {
		t.Fatal("AddMissingRequirements succeeded with a nonexistent ingredient")
	}
	items, err := repo.ListGroceryItems()
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 0 {
		t.Fatalf("grocery items after failed transaction = %+v, want no writes", items)
	}

	badQuantity := GroceryRequirement{Ingredient: valid, RequiredQuantity: math.NaN(), Unit: "cups", MissingQuantity: math.NaN(), Status: "missing"}
	if _, err := repo.AddMissingRequirements([]GroceryRequirement{validRequirement, badQuantity}); err == nil {
		t.Fatal("AddMissingRequirements accepted a NaN quantity")
	}
	items, err = repo.ListGroceryItems()
	if err != nil || len(items) != 0 {
		t.Fatalf("grocery items after validation failure = %+v, %v; want no writes", items, err)
	}
}
