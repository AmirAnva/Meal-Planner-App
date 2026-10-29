package main

// Valerie Pompa: exercises SQLite persistence in place of the former JSON
// recipe book round-trip test.

import (
	"errors"
	"path/filepath"
	"reflect"
	"testing"
)

func newTestRepository(t *testing.T) *SQLiteRepository {
	t.Helper()
	repository, err := OpenSQLiteRepository(filepath.Join(t.TempDir(), "meal-planner.db"))
	if err != nil {
		t.Fatalf("open SQLite repository: %v", err)
	}
	t.Cleanup(func() { _ = repository.Close() })
	return repository
}

func TestRecipeValidation(t *testing.T) {
	if err := (Recipe{Name: " \t "}).Validate(); !errors.Is(err, ErrRecipeNameRequired) {
		t.Fatalf("Validate() error = %v, want required name", err)
	}
	if err := (Recipe{Name: "Soup"}).Validate(); err != nil {
		t.Fatalf("Validate() error = %v", err)
	}
}

func TestRecipeStorageLifecycleAndSearch(t *testing.T) {
	repository := newTestRepository(t)
	want := Recipe{Name: "Garden Soup", Ingredients: []string{"carrot", "beans"}, Instructions: []string{"Simmer with thyme"}}
	created, err := repository.CreateRecipe(want)
	if err != nil {
		t.Fatalf("CreateRecipe(): %v", err)
	}
	if created.ID < 1 {
		t.Fatalf("created ID = %d, want positive ID", created.ID)
	}

	for _, term := range []string{"garden", "carrot", "thyme"} {
		got, err := repository.SearchRecipes(term)
		if err != nil {
			t.Fatalf("SearchRecipes(%q): %v", term, err)
		}
		if len(got) != 1 || got[0].ID != created.ID {
			t.Errorf("SearchRecipes(%q) = %+v, want created recipe", term, got)
		}
	}
	got, err := repository.GetRecipe(created.ID)
	if err != nil {
		t.Fatalf("GetRecipe(): %v", err)
	}
	if !reflect.DeepEqual(got, created) {
		t.Fatalf("GetRecipe() = %+v, want %+v", got, created)
	}

	created.Name = "Roasted Garden Soup"
	created.Instructions = []string{"Roast", "Simmer"}
	updated, err := repository.UpdateRecipe(created)
	if err != nil {
		t.Fatalf("UpdateRecipe(): %v", err)
	}
	if updated.Name != created.Name || len(updated.Instructions) != 2 {
		t.Fatalf("UpdateRecipe() = %+v", updated)
	}
	list, err := repository.ListRecipes()
	if err != nil || len(list) != 1 {
		t.Fatalf("ListRecipes() = %v, %v; want one recipe", list, err)
	}
	if err := repository.DeleteRecipe(created.ID); err != nil {
		t.Fatalf("DeleteRecipe(): %v", err)
	}
	if _, err := repository.GetRecipe(created.ID); !errors.Is(err, ErrRecipeNotFound) {
		t.Fatalf("GetRecipe after delete error = %v", err)
	}
}

func TestDayMealAssignmentAndForeignKeys(t *testing.T) {
	repository := newTestRepository(t)
	recipe, err := repository.CreateRecipe(Recipe{Name: "Pancakes", Ingredients: []string{"flour"}, Instructions: []string{"Mix"}})
	if err != nil {
		t.Fatal(err)
	}
	day, err := repository.GetOrCreateDay("2026-10-29")
	if err != nil {
		t.Fatalf("GetOrCreateDay(): %v", err)
	}
	dayAgain, err := repository.GetOrCreateDay("2026-10-29")
	if err != nil || dayAgain.ID != day.ID {
		t.Fatalf("duplicate day lookup = %+v, %v", dayAgain, err)
	}

	meal, err := repository.AssignMeal(day.ID, recipe.ID, Breakfast)
	if err != nil {
		t.Fatalf("AssignMeal(): %v", err)
	}
	if meal.Recipe.Name != "Pancakes" {
		t.Fatalf("meal recipe = %+v", meal.Recipe)
	}
	secondRecipe, err := repository.CreateRecipe(Recipe{Name: "Waffles"})
	if err != nil {
		t.Fatal(err)
	}
	meal, err = repository.AssignMeal(day.ID, secondRecipe.ID, Breakfast)
	if err != nil || meal.RecipeID != secondRecipe.ID {
		t.Fatalf("meal upsert = %+v, %v", meal, err)
	}
	meals, err := repository.ListMeals(day.ID)
	if err != nil || len(meals) != 1 || meals[0].Recipe.Name != "Waffles" {
		t.Fatalf("ListMeals() = %+v, %v", meals, err)
	}
	if err := repository.RemoveMeal(day.ID, Breakfast); err != nil {
		t.Fatalf("RemoveMeal(): %v", err)
	}
	if _, err := repository.GetMeal(day.ID, Breakfast); !errors.Is(err, ErrMealNotFound) {
		t.Fatalf("GetMeal after removal error = %v", err)
	}
	if _, err := repository.AssignMeal(day.ID, 99999, Lunch); err == nil {
		t.Fatal("AssignMeal with unknown recipe succeeded, want foreign key error")
	}
	if _, err := repository.AssignMeal(day.ID, recipe.ID, MealType("snack")); err == nil {
		t.Fatal("AssignMeal with unsupported meal type succeeded")
	}
}
