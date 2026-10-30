package main

import (
	"errors"
	"strings"
)

var ErrRecipeNameRequired = errors.New("recipe name is required")

// Recipe is the application model for a saved recipe. Persistence is handled
// by SQLiteRepository, keeping SQL concerns out of the model.
type Recipe struct {
	ID           int      `json:"id"`
	Name         string   `json:"name"`
	Ingredients  []string `json:"ingredients"`
	Instructions []string `json:"instructions"`
}

func (r Recipe) Validate() error {
	if strings.TrimSpace(r.Name) == "" {
		return ErrRecipeNameRequired
	}
	return nil
}

// Day groups meal assignments for one calendar date.
type Day struct {
	ID    int    `json:"id"`
	Date  string `json:"date"`
	Meals []Meal `json:"meals,omitempty"`
}

func (d Day) Validate() error {
	if strings.TrimSpace(d.Date) == "" {
		return errors.New("day date is required")
	}
	return nil
}

// MealType is one of the supported daily meal slots.
type MealType string

const (
	Breakfast MealType = "breakfast"
	Lunch     MealType = "lunch"
	Dinner    MealType = "dinner"
)

func (t MealType) Valid() bool { return t == Breakfast || t == Lunch || t == Dinner }

// Meal assigns one recipe to one meal slot on a day.
type Meal struct {
	ID       int      `json:"id"`
	DayID    int      `json:"day_id"`
	RecipeID int      `json:"recipe_id"`
	MealType MealType `json:"meal_type"`
	Recipe   Recipe   `json:"recipe"`
}

func (m Meal) Validate() error {
	if !m.MealType.Valid() {
		return errors.New("meal type must be breakfast, lunch, or dinner")
	}
	return nil
}
