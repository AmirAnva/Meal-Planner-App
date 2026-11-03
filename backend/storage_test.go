package main

import (
	"errors"
	"testing"
)

func TestOpenSQLiteRepositoryRejectsEmptyPath(t *testing.T) {
	if _, err := OpenSQLiteRepository(""); err == nil {
		t.Fatal("OpenSQLiteRepository(\"\") succeeded, want an error")
	}
}

func TestRecipeRepositoryNormalizesDefaultsAndName(t *testing.T) {
	repository := newTestRepository(t)
	created, err := repository.CreateRecipe(Recipe{Name: "  Egg Bowl  "})
	if err != nil {
		t.Fatalf("CreateRecipe(): %v", err)
	}
	if created.Name != "  Egg Bowl  " {
		t.Fatalf("created name = %q, want input preserved in returned value", created.Name)
	}
	if created.Ingredients == nil || created.Instructions == nil || created.Tags == nil {
		t.Fatalf("created defaults = %+v, want non-nil slices", created)
	}

	stored, err := repository.GetRecipe(created.ID)
	if err != nil {
		t.Fatalf("GetRecipe(): %v", err)
	}
	if stored.Name != "Egg Bowl" {
		t.Fatalf("stored name = %q, want trimmed name", stored.Name)
	}
	if len(stored.Ingredients) != 0 || len(stored.Instructions) != 0 || len(stored.Tags) != 0 {
		t.Fatalf("stored defaults = %+v, want empty slices", stored)
	}
}

func TestRecipeRepositoryEmptySearchReturnsEmptySlice(t *testing.T) {
	repository := newTestRepository(t)
	for _, query := range []string{"", "   "} {
		results, err := repository.SearchRecipes(query)
		if err != nil {
			t.Fatalf("SearchRecipes(%q): %v", query, err)
		}
		if results == nil || len(results) != 0 {
			t.Fatalf("SearchRecipes(%q) = %v, want non-nil empty slice", query, results)
		}
	}
}

func TestRecipeRepositoryDoesNotReturnMisspelledSearchMatches(t *testing.T) {
	repository := newTestRepository(t)
	exact, err := repository.CreateRecipe(Recipe{Name: "French Toast"})
	if err != nil {
		t.Fatalf("CreateRecipe(exact): %v", err)
	}
	misspelled, err := repository.CreateRecipe(Recipe{Name: "Taost"})
	if err != nil {
		t.Fatalf("CreateRecipe(misspelled): %v", err)
	}

	results, err := repository.SearchRecipes("toast")
	if err != nil {
		t.Fatalf("SearchRecipes(): %v", err)
	}
	if len(results) != 1 || results[0].ID != exact.ID {
		t.Fatalf("SearchRecipes(toast) = %+v, want only recipe %d; excluded recipe = %d", results, exact.ID, misspelled.ID)
	}
}

func TestDayRepositoryLookupAndValidation(t *testing.T) {
	repository := newTestRepository(t)
	if _, err := repository.GetOrCreateDay(""); err == nil {
		t.Fatal("GetOrCreateDay(\"\") succeeded, want validation error")
	}
	if _, err := repository.GetDay("2026-11-03"); !errors.Is(err, ErrDayNotFound) {
		t.Fatalf("GetDay() error = %v, want ErrDayNotFound", err)
	}

	created, err := repository.GetOrCreateDay("2026-11-03")
	if err != nil {
		t.Fatalf("GetOrCreateDay(): %v", err)
	}
	found, err := repository.GetDay(created.Date)
	if err != nil {
		t.Fatalf("GetDay() after create: %v", err)
	}
	if found.ID != created.ID || found.Date != created.Date {
		t.Fatalf("found day = %+v, want %+v", found, created)
	}
}

func TestMealRepositoryListsInMealOrderAndMissingErrors(t *testing.T) {
	repository := newTestRepository(t)
	recipes := make([]Recipe, 3)
	for i, name := range []string{"Breakfast", "Lunch", "Dinner"} {
		var err error
		recipes[i], err = repository.CreateRecipe(Recipe{Name: name})
		if err != nil {
			t.Fatalf("CreateRecipe(%q): %v", name, err)
		}
	}
	day, err := repository.GetOrCreateDay("2026-11-04")
	if err != nil {
		t.Fatalf("GetOrCreateDay(): %v", err)
	}

	if _, err := repository.GetMeal(day.ID, Breakfast); !errors.Is(err, ErrMealNotFound) {
		t.Fatalf("GetMeal() missing error = %v, want ErrMealNotFound", err)
	}
	if err := repository.RemoveMeal(day.ID, Dinner); !errors.Is(err, ErrMealNotFound) {
		t.Fatalf("RemoveMeal() missing error = %v, want ErrMealNotFound", err)
	}

	assignments := []struct {
		mealType MealType
		recipe   Recipe
	}{
		{Dinner, recipes[2]},
		{Breakfast, recipes[0]},
		{Lunch, recipes[1]},
	}
	for _, assignment := range assignments {
		if _, err := repository.AssignMeal(day.ID, assignment.recipe.ID, assignment.mealType); err != nil {
			t.Fatalf("AssignMeal(%s): %v", assignment.mealType, err)
		}
	}
	meals, err := repository.ListMeals(day.ID)
	if err != nil {
		t.Fatalf("ListMeals(): %v", err)
	}
	if len(meals) != 3 {
		t.Fatalf("ListMeals() returned %d meals, want 3", len(meals))
	}
	wantOrder := []MealType{Breakfast, Lunch, Dinner}
	for i, meal := range meals {
		if meal.MealType != wantOrder[i] || meal.Recipe.Name != stringMealName(wantOrder[i]) {
			t.Fatalf("meal[%d] = %+v, want %s", i, meal, wantOrder[i])
		}
	}
}

func stringMealName(mealType MealType) string {
	switch mealType {
	case Breakfast:
		return "Breakfast"
	case Lunch:
		return "Lunch"
	default:
		return "Dinner"
	}
}
