package main

import (
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
)

var ErrRecipeNameRequired = errors.New("name is required")

// Recipe is the application model for a saved recipe. Persistence is handled
// by SQLiteRepository, keeping SQL concerns out of the model.
type Recipe struct {
	Category              string                  `json:"category,omitempty"`
	Tags                  string                  `json:"tags,omitempty"`
	Dietary               string                  `json:"dietary,omitempty"`
	ID                    int                     `json:"id"`
	Name                  string                  `json:"name"`
	Ingredients           []string                `json:"ingredients"`
	Instructions          []string                `json:"instructions"`
	StructuredIngredients []RecipeIngredientInput `json:"structured_ingredients,omitempty"`
}

// Ingredient is a reusable ingredient identity shared across recipes, pantry,
// and grocery items.
type Ingredient struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}
type RecipeIngredient struct {
	RecipeID     int        `json:"recipe_id"`
	IngredientID int        `json:"ingredient_id"`
	Ingredient   Ingredient `json:"ingredient,omitempty"`
	Quantity     *float64   `json:"quantity"`
	Unit         *string    `json:"unit"`
}

func (v RecipeIngredient) Validate() error {
	if v.RecipeID <= 0 {
		return errors.New("recipe id must be positive")
	}
	if v.IngredientID <= 0 {
		return errors.New("ingredient id must be positive")
	}
	if v.Quantity != nil && (math.IsNaN(*v.Quantity) || math.IsInf(*v.Quantity, 0) || *v.Quantity < 0) {
		return errors.New("recipe ingredient quantity must be a finite non-negative number")
	}
	if v.Unit != nil && strings.TrimSpace(*v.Unit) == "" {
		return errors.New("recipe ingredient unit must not be empty")
	}
	return nil
}

type GroceryItem struct {
	ID           int      `json:"id"`
	IngredientID *int     `json:"ingredient_id"`
	Name         *string  `json:"name"`
	Quantity     *float64 `json:"quantity"`
	Unit         *string  `json:"unit"`
	Purchased    bool     `json:"purchased"`
}
type PantryItem struct {
	IngredientID int        `json:"ingredient_id"`
	Ingredient   Ingredient `json:"ingredient,omitempty"`
	Quantity     float64    `json:"quantity"`
	Unit         *string    `json:"unit"`
}

type RecipeIngredientInput struct {
	Name     string  `json:"name"`
	Quantity float64 `json:"quantity"`
	Unit     string  `json:"unit"`
}

func (r *Recipe) prepareStructuredIngredients() {
	if r.StructuredIngredients == nil {
		return
	}
	r.Ingredients = []string{}
	for _, i := range r.StructuredIngredients {
		r.Ingredients = append(r.Ingredients, strconv.FormatFloat(i.Quantity, 'f', -1, 64)+" "+strings.TrimSpace(i.Unit)+" "+strings.TrimSpace(i.Name))
	}
}
func (r Recipe) Validate() error {
	if len(r.Category) > 100 || len(r.Tags) > 500 || len(r.Dietary) > 500 {
		return errors.New("recipe labels are too long")
	}
	if strings.TrimSpace(r.Name) == "" {
		return ErrRecipeNameRequired
	}
	if r.StructuredIngredients != nil {
		if len(r.StructuredIngredients) == 0 {
			return fmt.Errorf("at least one ingredient is required")
		}
		seen := map[string]bool{}
		for _, i := range r.StructuredIngredients {
			name := strings.ToLower(strings.TrimSpace(i.Name))
			if name == "" || len(i.Name) > 120 || strings.TrimSpace(i.Unit) == "" || len(i.Unit) > 30 || i.Quantity <= 0 || math.IsNaN(i.Quantity) || math.IsInf(i.Quantity, 0) || seen[name] {
				return fmt.Errorf("invalid or duplicate ingredient")
			}
			seen[name] = true
		}
		valid := false
		for _, step := range r.Instructions {
			if strings.TrimSpace(step) != "" {
				valid = true
			}
		}
		if !valid {
			return fmt.Errorf("instructions are required")
		}
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

// calendar is the API response containing meal assignments for each day.
type calendar struct {
	Days []Day `json:"days"`
}
