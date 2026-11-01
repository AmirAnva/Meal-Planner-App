// Test functions in calendar.go
package main

import (
	"reflect"
	"testing"
)

func TestNewCalendar(t *testing.T) {
	want := calendar{
		Days: []day{{
			Breakfast: meal{Recipes: []recipe{}},
			Lunch:     meal{Recipes: []recipe{}},
			Dinner:    meal{Recipes: []recipe{}},
		}},
	}
	got := newCalendar()
	if !reflect.DeepEqual(got, want) {
		t.Errorf("newCalendar() = %v, want %v", got, want)
	}
}

func TestAddRecipeToMeal(t *testing.T) {
	c := newCalendar()
	recipe := recipe{"name": "Pasta", "ingredients": []string{"noodles", "sauce"}}
	c.addRecipeToMeal(0, Breakfast, recipe)
	if len(c.Days[0].Breakfast.Recipes) != 1 || !reflect.DeepEqual(c.Days[0].Breakfast.Recipes[0], recipe) {
		t.Errorf("addRecipeToMeal() failed, got %v", c.Days[0].Breakfast.Recipes)
	}
}

func TestRemoveRecipeFromMeal(t *testing.T) {
	c := newCalendar()
	recipe := recipe{"name": "Pasta", "ingredients": []string{"noodles", "sauce"}}
	c.addRecipeToMeal(0, Breakfast, recipe)
	c.removeRecipeFromMeal(0, Breakfast, 0)
	if len(c.Days[0].Breakfast.Recipes) != 0 {
		t.Errorf("removeRecipeFromMeal() failed, got %v", c.Days[0].Breakfast.Recipes)
	}

	// Test removing a recipe that doesn't exist
	c.removeRecipeFromMeal(0, Breakfast, 0)
	if len(c.Days[0].Breakfast.Recipes) != 0 {
		t.Errorf("removeRecipeFromMeal() failed, got %v", c.Days[0].Breakfast.Recipes)
	}
}

