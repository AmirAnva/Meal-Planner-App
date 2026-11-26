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
	PantryComparable bool       `json:"pantry_comparable"`
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
	occurrences := map[int]int{}
	orderedIDs := make([]int, 0, len(recipeIDs))
	for _, id := range recipeIDs {
		if id < 1 {
			return nil, ErrInvalidGroceryItem
		}
		if occurrences[id] == 0 {
			if _, err := r.GetRecipe(id); err != nil {
				return nil, err
			}
			orderedIDs = append(orderedIDs, id)
		}
		occurrences[id]++
	}
	grouped := map[int][]*GroceryRequirement{}
	for _, id := range orderedIDs {
		items, err := r.ListRecipeIngredients(id)
		if err != nil {
			return nil, err
		}
		for _, item := range items {
			if item.Quantity == nil || item.Unit == nil || *item.Quantity <= 0 || math.IsNaN(*item.Quantity) || math.IsInf(*item.Quantity, 0) || strings.TrimSpace(*item.Unit) == "" {
				return nil, ErrIncompleteRecipeIngredients
			}
			requiredQuantity := *item.Quantity * float64(occurrences[id])
			var current *GroceryRequirement
			var factor float64
			for _, candidate := range grouped[item.IngredientID] {
				if converted, ok := unitConversion(*item.Unit, candidate.Unit); ok {
					current, factor = candidate, converted
					break
				}
			}
			if current == nil {
				grouped[item.IngredientID] = append(grouped[item.IngredientID], &GroceryRequirement{Ingredient: item.Ingredient, RequiredQuantity: requiredQuantity, Unit: strings.TrimSpace(*item.Unit), PantryComparable: true})
			} else {
				current.RequiredQuantity += requiredQuantity * factor
			}
		}
	}
	pantry, err := r.ListPantryItems()
	if err != nil {
		return nil, err
	}
	for _, item := range pantry {
		requirements := grouped[item.IngredientID]
		if len(requirements) == 0 {
			continue
		}
		for _, req := range requirements {
			if item.Unit != nil {
				if factor, ok := unitConversion(*item.Unit, req.Unit); ok {
					req.PantryQuantity = item.Quantity * factor
					continue
				}
			}
			req.PantryComparable = false
			req.Status = "incomparable"
		}
	}
	result := []GroceryRequirement{}
	for _, requirements := range grouped {
		for _, req := range requirements {
			if !req.PantryComparable {
				req.MissingQuantity = 0
				result = append(result, *req)
				continue
			}
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
	tx, err := r.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	added := make([]GroceryItem, 0, len(items))
	for _, req := range items {
		if req.MissingQuantity <= 0 || req.Status == "incomparable" {
			continue
		}
		ingredientID, quantity, unit, name := req.Ingredient.ID, req.MissingQuantity, req.Unit, req.Ingredient.Name
		item, err := upsertUnpurchasedGroceryItemTx(tx, GroceryItem{IngredientID: &ingredientID, Name: &name, Quantity: &quantity, Unit: &unit})
		if err != nil {
			return nil, err
		}
		added = append(added, item)
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return added, nil
}

func upsertUnpurchasedGroceryItemTx(tx *sql.Tx, item GroceryItem) (GroceryItem, error) {
	validated, err := normalizeGroceryItem(item)
	if err != nil {
		return GroceryItem{}, err
	}
	if validated.Purchased {
		return createGroceryItemTx(tx, validated)
	}

	nameKey := ""
	if validated.Name != nil {
		nameKey = strings.TrimSpace(*validated.Name)
	}

	var rows *sql.Rows
	if validated.IngredientID != nil {
		rows, err = tx.Query(
			`SELECT grocery_item_id, ingredient_id, name, quantity, unit, purchased
			 FROM grocery_items
			 WHERE purchased = 0 AND (ingredient_id = ? OR (ingredient_id IS NULL AND ? != '' AND lower(trim(name)) = lower(?)))
			 ORDER BY grocery_item_id`,
			*validated.IngredientID, nameKey, nameKey,
		)
	} else {
		rows, err = tx.Query(
			`SELECT grocery_item_id, ingredient_id, name, quantity, unit, purchased
			 FROM grocery_items
			 WHERE purchased = 0 AND lower(trim(name)) = lower(?)
			 ORDER BY grocery_item_id`,
			nameKey,
		)
	}
	if err != nil {
		return GroceryItem{}, err
	}

	var candidates []GroceryItem
	for rows.Next() {
		var cand GroceryItem
		var iid sql.NullInt64
		var cname, cunit sql.NullString
		var cqty sql.NullFloat64
		var cpurchased int
		if err := rows.Scan(&cand.ID, &iid, &cname, &cqty, &cunit, &cpurchased); err != nil {
			rows.Close()
			return GroceryItem{}, err
		}
		if iid.Valid {
			v := int(iid.Int64)
			cand.IngredientID = &v
		}
		if cname.Valid {
			cand.Name = &cname.String
		}
		if cqty.Valid {
			cand.Quantity = &cqty.Float64
		}
		if cunit.Valid {
			cand.Unit = &cunit.String
		}
		cand.Purchased = cpurchased != 0
		candidates = append(candidates, cand)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return GroceryItem{}, err
	}
	rows.Close()

	for _, cand := range candidates {
		compatible := false
		factor := 1.0

		switch {
		case cand.Quantity == nil && cand.Unit == nil:
			compatible = true
		case validated.Quantity == nil && validated.Unit == nil:
			compatible = true
		case cand.Unit == nil && validated.Unit == nil:
			compatible = true
		case cand.Unit != nil && validated.Unit != nil:
			if converted, ok := unitConversion(*validated.Unit, *cand.Unit); ok {
				compatible = true
				factor = converted
			}
		}

		if !compatible {
			continue
		}

		merged := cand
		if merged.IngredientID == nil && validated.IngredientID != nil {
			merged.IngredientID = validated.IngredientID
		}
		if merged.Name == nil && validated.Name != nil {
			merged.Name = validated.Name
		}
		if merged.Unit == nil && validated.Unit != nil {
			merged.Unit = validated.Unit
		}
		if cand.Quantity != nil && validated.Quantity != nil {
			sum := *cand.Quantity + (*validated.Quantity)*factor
			merged.Quantity = &sum
		} else if validated.Quantity != nil {
			q := *validated.Quantity
			merged.Quantity = &q
		}

		if _, err := tx.Exec(
			`UPDATE grocery_items SET ingredient_id=?, name=?, quantity=?, unit=? WHERE grocery_item_id=?`,
			merged.IngredientID, merged.Name, merged.Quantity, merged.Unit, merged.ID,
		); err != nil {
			return GroceryItem{}, err
		}
		return merged, nil
	}

	return createGroceryItemTx(tx, validated)
}

func createGroceryItemTx(tx *sql.Tx, item GroceryItem) (GroceryItem, error) {
	validated, err := normalizeGroceryItem(item)
	if err != nil {
		return GroceryItem{}, err
	}
	result, err := tx.Exec(`INSERT INTO grocery_items(ingredient_id,name,quantity,unit,purchased) VALUES(?,?,?,?,?)`, validated.IngredientID, validated.Name, validated.Quantity, validated.Unit, validated.Purchased)
	if err != nil {
		return GroceryItem{}, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return GroceryItem{}, err
	}
	validated.ID = int(id)
	return validated, nil
}
