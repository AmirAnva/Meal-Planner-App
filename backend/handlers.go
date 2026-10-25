package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

type API struct {
	store *RecipeStore
}

func NewAPI(store *RecipeStore) http.Handler {
	api := &API{store: store}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/recipes", api.listRecipes)
	mux.HandleFunc("POST /api/recipes", api.createRecipe)
	mux.HandleFunc("DELETE /api/recipes/{id}", api.deleteRecipe)
	return cors(mux)
}

func (api *API) listRecipes(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, api.store.List())
}

func (api *API) createRecipe(w http.ResponseWriter, r *http.Request) {
	var recipe Recipe
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&recipe); err != nil {
		writeError(w, http.StatusBadRequest, "invalid recipe JSON")
		return
	}
	if strings.TrimSpace(recipe.Name) == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if recipe.Source == "" {
		recipe.Source = "personal"
	}
	if recipe.Source != "personal" && recipe.Source != "external" {
		writeError(w, http.StatusBadRequest, "source must be personal or external")
		return
	}

	created, err := api.store.Create(recipe)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not save recipe")
		return
	}
	w.Header().Set("Location", fmt.Sprintf("/api/recipes/%d", created.ID))
	writeJSON(w, http.StatusCreated, created)
}

func (api *API) deleteRecipe(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id < 1 {
		writeError(w, http.StatusBadRequest, "recipe id must be a positive integer")
		return
	}
	if err := api.store.Delete(id); err != nil {
		if errors.Is(err, ErrRecipeNotFound) {
			writeError(w, http.StatusNotFound, "recipe not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not save recipe book")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		// The response may already be committed; nothing else can be sent here.
		return
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
