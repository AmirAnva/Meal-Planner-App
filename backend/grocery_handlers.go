package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
)

func decodeRequest(r *http.Request, value any) error {
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	return decoder.Decode(value)
}

func (api *API) listIngredients(w http.ResponseWriter, _ *http.Request) {
	items, err := api.store.ListIngredients()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load ingredients")
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (api *API) createIngredient(w http.ResponseWriter, r *http.Request) {
	var item Ingredient
	if decodeRequest(r, &item) != nil {
		writeError(w, http.StatusBadRequest, "invalid ingredient JSON")
		return
	}
	created, err := api.store.CreateIngredient(item)
	if err != nil {
		writeError(w, http.StatusBadRequest, "name is required or ingredient already exists")
		return
	}
	w.Header().Set("Location", "/api/ingredients/"+strconv.Itoa(created.ID))
	writeJSON(w, http.StatusCreated, created)
}

func (api *API) setRecipeIngredients(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id < 1 {
		writeError(w, http.StatusBadRequest, "recipe id must be a positive integer")
		return
	}
	var input struct {
		Ingredients []RecipeIngredient `json:"ingredients"`
	}
	if decodeRequest(r, &input) != nil || input.Ingredients == nil {
		writeError(w, http.StatusBadRequest, "ingredients must be an array")
		return
	}
	for i := range input.Ingredients {
		if input.Ingredients[i].RecipeID == 0 {
			input.Ingredients[i].RecipeID = id
		}
		if input.Ingredients[i].RecipeID != id {
			writeError(w, http.StatusBadRequest, "recipe_id must match the URL")
			return
		}
		if _, err := api.store.GetIngredient(input.Ingredients[i].IngredientID); err != nil {
			writeError(w, http.StatusBadRequest, "ingredient not found")
			return
		}
	}
	if err := api.store.SetRecipeIngredients(id, input.Ingredients); err != nil {
		if errors.Is(err, ErrRecipeNotFound) {
			writeError(w, http.StatusNotFound, "recipe not found")
			return
		}
		writeError(w, http.StatusBadRequest, "invalid recipe ingredient associations")
		return
	}
	items, err := api.store.ListRecipeIngredients(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load recipe ingredients")
		return
	}
	writeJSON(w, http.StatusOK, map[string][]RecipeIngredient{"ingredients": items})
}

func (api *API) listPantryItems(w http.ResponseWriter, _ *http.Request) {
	items, err := api.store.ListPantryItems()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load pantry")
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (api *API) savePantryItem(w http.ResponseWriter, r *http.Request) {
	var item PantryItem
	if decodeRequest(r, &item) != nil {
		writeError(w, http.StatusBadRequest, "invalid pantry item JSON")
		return
	}
	if _, err := api.store.GetIngredient(item.IngredientID); err != nil {
		writeError(w, http.StatusNotFound, "ingredient not found")
		return
	}
	if err := api.store.PutPantryItem(item); err != nil {
		writeError(w, http.StatusBadRequest, "invalid pantry item")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (api *API) listGroceryItems(w http.ResponseWriter, _ *http.Request) {
	items, err := api.store.ListGroceryItems()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load grocery list")
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (api *API) createGroceryItem(w http.ResponseWriter, r *http.Request) {
	var item GroceryItem
	if decodeRequest(r, &item) != nil {
		writeError(w, http.StatusBadRequest, "invalid grocery item JSON")
		return
	}
	if item.IngredientID != nil {
		if _, err := api.store.GetIngredient(*item.IngredientID); err != nil {
			writeError(w, http.StatusBadRequest, "ingredient not found")
			return
		}
	}
	created, err := api.store.CreateGroceryItem(item)
	if err != nil {
		writeError(w, http.StatusBadRequest, "grocery item needs an ingredient or name and valid values")
		return
	}
	w.Header().Set("Location", "/api/grocery-list/"+strconv.Itoa(created.ID))
	writeJSON(w, http.StatusCreated, created)
}

func (api *API) updateGroceryItem(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id < 1 {
		writeError(w, http.StatusBadRequest, "grocery item id must be a positive integer")
		return
	}
	if _, err := api.store.GetGroceryItem(id); errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "grocery item not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load grocery item")
		return
	}
	var item GroceryItem
	if decodeRequest(r, &item) != nil {
		writeError(w, http.StatusBadRequest, "invalid grocery item JSON")
		return
	}
	item.ID = id
	if item.IngredientID != nil {
		if _, err := api.store.GetIngredient(*item.IngredientID); err != nil {
			writeError(w, http.StatusBadRequest, "ingredient not found")
			return
		}
	}
	updated, err := api.store.UpdateGroceryItem(item)
	if err != nil {
		writeError(w, http.StatusBadRequest, "grocery item needs an ingredient or name and valid values")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (api *API) deleteGroceryItem(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id < 1 {
		writeError(w, http.StatusBadRequest, "grocery item id must be a positive integer")
		return
	}
	if err := api.store.DeleteGroceryItem(id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "grocery item not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not delete grocery item")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (api *API) generateGroceryList(w http.ResponseWriter, r *http.Request) {
	var input struct {
		RecipeIDs []int `json:"recipe_ids"`
		AddToList bool  `json:"add_to_list"`
	}
	if decodeRequest(r, &input) != nil {
		writeError(w, http.StatusBadRequest, "invalid grocery generation JSON")
		return
	}
	items, err := api.store.GenerateGroceryRequirements(input.RecipeIDs)
	if errors.Is(err, ErrInvalidGroceryItem) {
		writeError(w, http.StatusBadRequest, "recipe_ids must contain at least one positive recipe id")
		return
	}
	if errors.Is(err, ErrRecipeNotFound) {
		writeError(w, http.StatusNotFound, "recipe not found")
		return
	}
	if errors.Is(err, ErrIncompleteRecipeIngredients) {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not generate grocery requirements")
		return
	}
	response := struct {
		Requirements []GroceryRequirement `json:"requirements"`
		Added        []GroceryItem        `json:"added"`
	}{Requirements: items, Added: []GroceryItem{}}
	if input.AddToList {
		response.Added, err = api.store.AddMissingRequirements(items)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not add requirements to grocery list")
			return
		}
	}
	writeJSON(w, http.StatusOK, response)
}

func (api *API) getRecipeIngredients(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id < 1 {
		writeError(w, http.StatusBadRequest, "invalid recipe id")
		return
	}
	if _, err := api.store.GetRecipe(id); err != nil {
		if errors.Is(err, ErrRecipeNotFound) {
			writeError(w, http.StatusNotFound, "recipe not found")
		} else {
			writeError(w, http.StatusInternalServerError, "could not load recipe")
		}
		return
	}
	items, err := api.store.ListRecipeIngredients(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load ingredients")
		return
	}
	writeJSON(w, http.StatusOK, map[string][]RecipeIngredient{"ingredients": items})
}

func (api *API) transferGrocery(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id <= 0 {
		writeError(w, 400, "invalid grocery id")
		return
	}
	if err = api.store.MovePurchasedGrocery(id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, 404, "grocery item not found")
		} else {
			writeError(w, 409, "transfer failed; item retained: "+err.Error())
		}
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
