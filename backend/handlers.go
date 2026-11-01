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
	mux.HandleFunc("GET /api/calendar", api.getCalendar)
	mux.HandleFunc("POST /api/calendar/meals", api.assignCalendarMeal)
	mux.HandleFunc("DELETE /api/calendar/meals", api.removeCalendarMeal)
	return cors(mux)
}

func (api *API) getCalendar(w http.ResponseWriter, r *http.Request) {
	start := time.Now().Format("2006-01-02")
	if value := r.URL.Query().Get("start"); value != "" {
		if _, err := time.Parse("2006-01-02", value); err != nil {
			writeError(w, http.StatusBadRequest, "start must be a date in YYYY-MM-DD format")
			return
		}
		start = value
	}
	daysCount := 7
	if value := r.URL.Query().Get("days"); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil || parsed < 1 || parsed > 31 {
			writeError(w, http.StatusBadRequest, "days must be between 1 and 31")
			return
		}
		daysCount = parsed
	}

	startDate, _ := time.Parse("2006-01-02", start)
	days := make([]Day, 0, daysCount)
	for offset := 0; offset < daysCount; offset++ {
		date := startDate.AddDate(0, 0, offset).Format("2006-01-02")
		day, err := api.store.GetOrCreateDay(date)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not load calendar")
			return
		}
		day.Meals, err = api.store.ListMeals(day.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not load calendar")
			return
		}
		days = append(days, day)
	}
	writeJSON(w, http.StatusOK, calendar{Days: days})
}

type calendarMealRequest struct {
	Date     string   `json:"date"`
	RecipeID int      `json:"recipe_id"`
	MealType MealType `json:"meal_type"`
}

func (api *API) assignCalendarMeal(w http.ResponseWriter, r *http.Request) {
	var request calendarMealRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, "invalid meal JSON")
		return
	}
	if _, err := time.Parse("2006-01-02", request.Date); err != nil {
		writeError(w, http.StatusBadRequest, "date must be in YYYY-MM-DD format")
		return
	}
	if request.RecipeID < 1 || !request.MealType.Valid() {
		writeError(w, http.StatusBadRequest, "recipe_id and meal_type are required")
		return
	}
	day, err := api.store.GetOrCreateDay(request.Date)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not save calendar")
		return
	}
	meal, err := api.store.AssignMeal(day.ID, request.RecipeID, request.MealType)
	if err != nil {
		if errors.Is(err, ErrRecipeNotFound) {
			writeError(w, http.StatusBadRequest, "recipe not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not save calendar")
		return
	}
	writeJSON(w, http.StatusOK, meal)
}

func (api *API) removeCalendarMeal(w http.ResponseWriter, r *http.Request) {
	date := r.URL.Query().Get("date")
	mealType := MealType(r.URL.Query().Get("meal_type"))
	if _, err := time.Parse("2006-01-02", date); err != nil || !mealType.Valid() {
		writeError(w, http.StatusBadRequest, "date and meal_type are required")
		return
	}
	day, err := api.store.GetDay(date)
	if errors.Is(err, ErrDayNotFound) {
		writeError(w, http.StatusNotFound, "calendar day not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load calendar")
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
