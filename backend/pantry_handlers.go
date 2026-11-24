package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
)

func (api *API) deleteIngredient(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id < 1 {
		writeError(w, http.StatusBadRequest, "ingredient id must be a positive integer")
		return
	}
	if err := api.store.DeleteIngredient(id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "ingredient not found")
			return
		}
		if errors.Is(err, ErrIngredientInUse) {
			writeError(w, http.StatusConflict, "ingredient is still used by a recipe, pantry item, or grocery item")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not remove ingredient")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (api *API) addPantryItem(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Ingredient string  `json:"ingredient"`
		Quantity   float64 `json:"quantity"`
		Unit       string  `json:"unit"`
	}
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid pantry item JSON")
		return
	}
	input.Ingredient = strings.TrimSpace(input.Ingredient)
	input.Unit = strings.TrimSpace(input.Unit)
	if input.Ingredient == "" {
		writeError(w, http.StatusBadRequest, "ingredient is required")
		return
	}
	if err := (PantryQuantity{Quantity: input.Quantity, Unit: input.Unit}).Validate(); err != nil {
		writeError(w, http.StatusBadRequest, "quantity must be positive and use a supported unit")
		return
	}

	ingredient, err := api.store.GetIngredientByName(input.Ingredient)
	if errors.Is(err, sql.ErrNoRows) {
		ingredient, err = api.store.CreateIngredient(Ingredient{Name: input.Ingredient})
		if err != nil {
			ingredient, err = api.store.GetIngredientByName(input.Ingredient)
		}
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not save pantry item")
		return
	}

	item := PantryItem{
		IngredientID: ingredient.ID,
		Ingredient:   ingredient,
		Quantity:     input.Quantity,
		Unit:         &input.Unit,
	}
	item, created, err := api.store.AddPantryItem(item)
	if errors.Is(err, ErrPantryUnitMismatch) {
		writeError(w, http.StatusConflict, "ingredient is already in the pantry with a different unit")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not save pantry item")
		return
	}
	item.Ingredient = ingredient
	if created {
		writeJSON(w, http.StatusCreated, item)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (api *API) updatePantryItem(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id < 1 {
		writeError(w, http.StatusBadRequest, "pantry item id must be a positive integer")
		return
	}
	var quantity PantryQuantity
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&quantity); err != nil {
		writeError(w, http.StatusBadRequest, "invalid pantry quantity JSON")
		return
	}
	quantity.Unit = strings.TrimSpace(quantity.Unit)
	if err := quantity.Validate(); err != nil {
		writeError(w, http.StatusBadRequest, "quantity must be positive and use a supported unit")
		return
	}

	items, err := api.store.ListPantryItems()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not update pantry item")
		return
	}
	var item PantryItem
	for _, candidate := range items {
		if candidate.IngredientID == id {
			item = candidate
			break
		}
	}
	if item.IngredientID == 0 {
		writeError(w, http.StatusNotFound, "pantry item not found")
		return
	}
	item.Quantity = quantity.Quantity
	item.Unit = &quantity.Unit
	if err := api.store.PutPantryItem(item); err != nil {
		writeError(w, http.StatusInternalServerError, "could not update pantry item")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (api *API) deletePantryItem(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id < 1 {
		writeError(w, http.StatusBadRequest, "pantry item id must be a positive integer")
		return
	}
	if err := api.store.DeletePantryItem(id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "pantry item not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not remove pantry item")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
