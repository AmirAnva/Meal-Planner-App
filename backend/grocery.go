package main

import (
	"database/sql"
	"errors"
	"math"
	"sort"
	"strings"
)

var (
	ErrInvalidGroceryItem          = errors.New("invalid grocery item")
	ErrIncompleteRecipeIngredients = errors.New("selected recipe has ingredients without quantity or unit")
)

type GroceryRequirement struct {
	Ingredient       Ingredient `json:"ingredient"`
	RequiredQuantity float64    `json:"required_quantity"`
	Unit             string     `json:"unit"`
	PantryQuantity   float64    `json:"pantry_quantity"`
	MissingQuantity  float64    `json:"missing_quantity"`
	Status           string     `json:"status"`
}

func (r *SQLiteRepository) GetGroceryItem(id int) (GroceryItem, error) {
	var item GroceryItem
	var ingredientID sql.NullInt64
	var name, unit sql.NullString
	var quantity sql.NullFloat64
	var purchased int
	err := r.db.QueryRow(`SELECT grocery_item_id, ingredient_id, name, quantity, unit, purchased FROM grocery_items WHERE grocery_item_id=?`, id).Scan(&item.ID, &ingredientID, &name, &quantity, &unit, &purchased)
	if err != nil {
		return GroceryItem{}, err
	}
	if ingredientID.Valid {
		value := int(ingredientID.Int64)
		item.IngredientID = &value
	}
	if name.Valid {
		item.Name = &name.String
	}
	if quantity.Valid {
		item.Quantity = &quantity.Float64
	}
	if unit.Valid {
		item.Unit = &unit.String
	}
	item.Purchased = purchased != 0
	return item, nil
}

type unitInfo struct {
	family string
	factor float64
}

var units = map[string]unitInfo{
	"g": {"mass", 1}, "gram": {"mass", 1}, "grams": {"mass", 1}, "kg": {"mass", 1000}, "kilogram": {"mass", 1000}, "kilograms": {"mass", 1000},
	"mg": {"mass", .001}, "oz": {"mass", 28.349523125}, "ounce": {"mass", 28.349523125}, "ounces": {"mass", 28.349523125}, "lb": {"mass", 453.59237}, "lbs": {"mass", 453.59237}, "pound": {"mass", 453.59237}, "pounds": {"mass", 453.59237},
	"ml": {"volume", 1}, "milliliter": {"volume", 1}, "milliliters": {"volume", 1}, "l": {"volume", 1000}, "liter": {"volume", 1000}, "liters": {"volume", 1000},
	"tsp": {"volume", 4.92892159375}, "teaspoon": {"volume", 4.92892159375}, "teaspoons": {"volume", 4.92892159375}, "tbsp": {"volume", 14.78676478125}, "tablespoon": {"volume", 14.78676478125}, "tablespoons": {"volume", 14.78676478125}, "cup": {"volume", 236.5882365}, "cups": {"volume", 236.5882365},
	"each": {"count", 1}, "ea": {"count", 1}, "piece": {"count", 1}, "pieces": {"count", 1}, "whole": {"count", 1},
}

func unitConversion(from, to string) (float64, bool) {
	a, b := strings.ToLower(strings.TrimSpace(from)), strings.ToLower(strings.TrimSpace(to))
	if a == b {
		return 1, true
	}
	ua, oka := units[a]
	ub, okb := units[b]
	if oka && okb && ua.family == ub.family {
		return ua.factor / ub.factor, true
	}
	return 0, false
}

func (r *SQLiteRepository) GenerateGroceryRequirements(recipeIDs []int) ([]GroceryRequirement, error) {
	if len(recipeIDs) == 0 {
		return nil, ErrInvalidGroceryItem
	}
	unique := make([]int, 0, len(recipeIDs))
	seen := map[int]bool{}
	for _, id := range recipeIDs {
		if id < 1 {
			return nil, ErrInvalidGroceryItem
		}
		if seen[id] {
			continue
		}
		if _, err := r.GetRecipe(id); err != nil {
			return nil, err
		}
		seen[id] = true
		unique = append(unique, id)
	}
	grouped := map[int][]*GroceryRequirement{}
	for _, id := range unique {
		items, err := r.ListRecipeIngredients(id)
		if err != nil {
			return nil, err
		}
		for _, item := range items {
			if item.Quantity == nil || item.Unit == nil || *item.Quantity <= 0 {
				return nil, ErrIncompleteRecipeIngredients
			}
			var current *GroceryRequirement
			var factor float64
			for _, candidate := range grouped[item.IngredientID] {
				if converted, ok := unitConversion(*item.Unit, candidate.Unit); ok {
					current, factor = candidate, converted
					break
				}
			}
			if current == nil {
				grouped[item.IngredientID] = append(grouped[item.IngredientID], &GroceryRequirement{Ingredient: item.Ingredient, RequiredQuantity: *item.Quantity, Unit: *item.Unit})
			} else {
				current.RequiredQuantity += *item.Quantity * factor
			}
		}
	}
	pantry, err := r.ListPantryItems()
	if err != nil {
		return nil, err
	}
	for _, item := range pantry {
		if item.Unit == nil {
			continue
		}
		for _, req := range grouped[item.IngredientID] {
			if factor, ok := unitConversion(*item.Unit, req.Unit); ok {
				req.PantryQuantity += item.Quantity * factor
				break
			}
		}
	}
	result := []GroceryRequirement{}
	for _, requirements := range grouped {
		for _, req := range requirements {
			req.MissingQuantity = math.Max(req.RequiredQuantity-req.PantryQuantity, 0)
			if req.MissingQuantity <= 1e-9 {
				req.MissingQuantity = 0
				req.Status = "available"
			} else if req.PantryQuantity > 0 {
				req.Status = "insufficient"
			} else {
				req.Status = "missing"
			}
			result = append(result, *req)
		}
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].Ingredient.Name == result[j].Ingredient.Name {
			return result[i].Unit < result[j].Unit
		}
		return strings.ToLower(result[i].Ingredient.Name) < strings.ToLower(result[j].Ingredient.Name)
	})
	return result, nil
}

func (r *SQLiteRepository) AddMissingRequirements(items []GroceryRequirement) ([]GroceryItem, error) {
	added := []GroceryItem{}
	for _, req := range items {
		if req.MissingQuantity <= 0 {
			continue
		}
		ingredientID, quantity, unit, name := req.Ingredient.ID, req.MissingQuantity, req.Unit, req.Ingredient.Name
		item, err := r.CreateGroceryItem(GroceryItem{IngredientID: &ingredientID, Name: &name, Quantity: &quantity, Unit: &unit})
		if err != nil {
			return nil, err
		}
		added = append(added, item)
	}
	return added, nil
}
