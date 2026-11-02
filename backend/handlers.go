package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"
)

type API struct {
	store *SQLiteRepository
}

func NewAPI(store *SQLiteRepository) http.Handler {
	api := &API{store: store}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/recipes", api.listRecipes)
	mux.HandleFunc("POST /api/recipes", api.createRecipe)
	mux.HandleFunc("PUT /api/recipes/{id}", api.updateRecipe)
	mux.HandleFunc("DELETE /api/recipes/{id}", api.deleteRecipe)
	mux.HandleFunc("GET /api/calendar", api.getCalendarDay)
	mux.HandleFunc("POST /api/calendar/meals", api.assignMeal)
	mux.HandleFunc("DELETE /api/calendar/meals", api.deleteCalendarMeal)
	mux.HandleFunc("DELETE /api/calendar/{date}/{meal_type}", api.deleteCalendarMeal)
	return cors(mux)
}

// updateRecipe retains the recipe edit flow introduced on main while delegating
// validation and persistence to the model and SQLite repository.
func (api *API) updateRecipe(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id < 1 {
		writeError(w, http.StatusBadRequest, "recipe id must be a positive integer")
		return
	}
	var recipe Recipe
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&recipe); err != nil {
		writeError(w, http.StatusBadRequest, "invalid recipe JSON")
		return
	}
	recipe.ID = id
	updated, err := api.store.UpdateRecipe(recipe)
	if err != nil {
		if errors.Is(err, ErrRecipeNameRequired) {
			writeError(w, http.StatusBadRequest, "name is required")
			return
		}
		if errors.Is(err, ErrRecipeNotFound) {
			writeError(w, http.StatusNotFound, "recipe not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not save recipe")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (api *API) listRecipes(w http.ResponseWriter, _ *http.Request) {
	recipes, err := api.store.ListRecipes()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load recipes")
		return
	}
	writeJSON(w, http.StatusOK, recipes)
}

func (api *API) createRecipe(w http.ResponseWriter, r *http.Request) {
	var recipe Recipe
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&recipe); err != nil {
		writeError(w, http.StatusBadRequest, "invalid recipe JSON")
		return
	}
	if err := recipe.Validate(); err != nil {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	created, err := api.store.CreateRecipe(recipe)
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
	if err := api.store.DeleteRecipe(id); err != nil {
		if errors.Is(err, ErrRecipeNotFound) {
			writeError(w, http.StatusNotFound, "recipe not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not save recipe book")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type AssignMealRequest struct {
	Date     string   `json:"date"`
	MealType MealType `json:"meal_type"`
	RecipeID int      `json:"recipe_id"`
}

func (api *API) getCalendarDay(w http.ResponseWriter, r *http.Request) {
	date := r.URL.Query().Get("date")
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}
	day, err := api.store.GetOrCreateDay(date)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	meals, err := api.store.ListMeals(day.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load meals")
		return
	}
	if meals == nil {
		meals = []Meal{}
	}
	day.Meals = meals
	writeJSON(w, http.StatusOK, day)
}

func (api *API) assignMeal(w http.ResponseWriter, r *http.Request) {
	var req AssignMealRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid meal JSON")
		return
	}
	if req.Date == "" {
		req.Date = time.Now().Format("2006-01-02")
	}
	if !req.MealType.Valid() {
		writeError(w, http.StatusBadRequest, "meal type must be breakfast, lunch, or dinner")
		return
	}
	if req.RecipeID < 1 {
		writeError(w, http.StatusBadRequest, "recipe id must be a positive integer")
		return
	}
	if _, err := api.store.GetRecipe(req.RecipeID); err != nil {
		if errors.Is(err, ErrRecipeNotFound) {
			writeError(w, http.StatusNotFound, "recipe not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not verify recipe")
		return
	}
	day, err := api.store.GetOrCreateDay(req.Date)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	meal, err := api.store.AssignMeal(day.ID, req.RecipeID, req.MealType)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not assign meal")
		return
	}
	writeJSON(w, http.StatusOK, meal)
}

func (api *API) deleteCalendarMeal(w http.ResponseWriter, r *http.Request) {
	date := r.PathValue("date")
	if date == "" {
		date = r.URL.Query().Get("date")
	}
	mealTypeStr := r.PathValue("meal_type")
	if mealTypeStr == "" {
		mealTypeStr = r.URL.Query().Get("meal_type")
	}
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}
	mealType := MealType(mealTypeStr)
	if !mealType.Valid() {
		writeError(w, http.StatusBadRequest, "meal type must be breakfast, lunch, or dinner")
		return
	}
	day, err := api.store.GetDay(date)
	if err != nil {
		if errors.Is(err, ErrDayNotFound) {
			writeError(w, http.StatusNotFound, "day not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not find day")
		return
	}
	if err := api.store.RemoveMeal(day.ID, mealType); err != nil {
		if errors.Is(err, ErrMealNotFound) {
			writeError(w, http.StatusNotFound, "meal not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not remove meal")
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
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
