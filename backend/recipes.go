package main

import (
	"errors"
	"math"
	"strings"
)

var (
	ErrRecipeNameRequired       = errors.New("recipe name is required")
	ErrPantryIngredientRequired = errors.New("pantry ingredient is required")
	ErrPantryQuantityInvalid    = errors.New("pantry quantity or unit is invalid")
)

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

// PantryItem is an ingredient saved in the user's pantry.
type PantryItem struct {
	ID         int     `json:"id"`
	Ingredient string  `json:"ingredient"`
	Quantity   float64 `json:"quantity"`
	Unit       string  `json:"unit"`
}

func (item PantryItem) Validate() error {
	if strings.TrimSpace(item.Ingredient) == "" {
		return ErrPantryIngredientRequired
	}
	return (PantryQuantity{Quantity: item.Quantity, Unit: item.Unit}).Validate()
}

type PantryQuantity struct {
	Quantity float64 `json:"quantity"`
	Unit     string  `json:"unit"`
}

func (quantity PantryQuantity) Validate() error {
	if quantity.Quantity <= 0 || math.IsNaN(quantity.Quantity) || math.IsInf(quantity.Quantity, 0) {
		return ErrPantryQuantityInvalid
	}
	switch quantity.Unit {
	case "g", "kg", "oz", "lb", "ml", "l", "tsp", "tbsp", "cup", "fl oz", "piece",
		"clove", "can", "bunch", "pinch", "dash", "package", "head", "slice", "stalk", "sprig", "handful":
		return nil
	default:
		return ErrPantryQuantityInvalid
	}
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
