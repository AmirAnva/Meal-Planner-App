// Test functions in calendar.go
package main

import (
	"reflect"
	"testing"
)

func TestNewCalendar(t *testing.T) {
	want := calendar{
		Days: []Day{{
			Meals: []Meal{
				{MealType: Breakfast},
				{MealType: Lunch},
				{MealType: Dinner},
			},
		}},
	}
	got := newCalendar()
	if !reflect.DeepEqual(got, want) {
		t.Errorf("newCalendar() = %v, want %v", got, want)
	}
}

func TestAddRecipeToMeal(t *testing.T) {
	c := newCalendar()
	recipe := Recipe{Name: "Pasta", Ingredients: []string{"noodles", "sauce"}}
	c.addRecipeToMeal(0, Breakfast, recipe)
	recipes := c.getRecipesForMeal(0, Breakfast)
	if len(recipes) != 1 || !reflect.DeepEqual(recipes[0], recipe) {
		t.Errorf("addRecipeToMeal() failed, got %v", recipes)
	}
}

func TestRemoveRecipeFromMeal(t *testing.T) {
	c := newCalendar()
	recipe := Recipe{Name: "Pasta", Ingredients: []string{"noodles", "sauce"}}
	c.addRecipeToMeal(0, Breakfast, recipe)
	c.removeRecipeFromMeal(0, Breakfast, 0)
	if recipes := c.getRecipesForMeal(0, Breakfast); len(recipes) != 0 {
		t.Errorf("removeRecipeFromMeal() failed, got %v", recipes)
	}

	// Test removing a recipe that doesn't exist
	c.removeRecipeFromMeal(0, Breakfast, 0)
	if recipes := c.getRecipesForMeal(0, Breakfast); len(recipes) != 0 {
		t.Errorf("removeRecipeFromMeal() failed, got %v", recipes)
	}
}
