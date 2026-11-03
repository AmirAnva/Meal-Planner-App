package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
)

func createCurrentCalendarRecipe(t *testing.T, handler http.Handler, name string) Recipe {
	t.Helper()

	request := httptest.NewRequest(http.MethodPost, "/api/recipes", strings.NewReader(`{"name":"`+name+`"}`))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusCreated {
		t.Fatalf("create recipe status = %d, want %d: %s", response.Code, http.StatusCreated, response.Body.String())
	}

	var recipe Recipe
	if err := json.Unmarshal(response.Body.Bytes(), &recipe); err != nil {
		t.Fatalf("decode created recipe: %v", err)
	}
	return recipe
}

func TestCurrentGetCalendarDoesNotCreateDays(t *testing.T) {
	handler, databasePath := newTestAPI(t)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/calendar?start=2026-10-29&days=2", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("GET calendar status = %d, want %d", response.Code, http.StatusOK)
	}

	store, err := OpenSQLiteRepository(databasePath)
	if err != nil {
		t.Fatalf("open calendar database: %v", err)
	}
	defer store.Close()
	if _, err := store.GetDay("2026-10-29"); !errors.Is(err, ErrDayNotFound) {
		t.Fatalf("GET calendar created a day, GetDay error = %v", err)
	}
}

func TestCurrentCalendarAPIGetRangeAndAssignMeal(t *testing.T) {
	handler, _ := newTestAPI(t)
	recipe := createCurrentCalendarRecipe(t, handler, "Pancakes")

	request := httptest.NewRequest(http.MethodGet, "/api/calendar?start=2026-10-29&days=3", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("GET calendar status = %d, want %d", response.Code, http.StatusOK)
	}

	var initial calendar
	if err := json.Unmarshal(response.Body.Bytes(), &initial); err != nil {
		t.Fatalf("decode initial calendar: %v", err)
	}
	if len(initial.Days) != 3 {
		t.Fatalf("initial calendar days = %d, want 3", len(initial.Days))
	}
	if initial.Days[0].Date != "2026-10-29" || initial.Days[2].Date != "2026-10-31" {
		t.Fatalf("initial calendar dates = %+v", initial.Days)
	}

	request = httptest.NewRequest(http.MethodPost, "/api/calendar/meals", strings.NewReader(
		`{"date":"2026-10-29","recipe_id":`+strconv.Itoa(recipe.ID)+`,"meal_type":"breakfast"}`,
	))
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("POST meal status = %d, want %d: %s", response.Code, http.StatusOK, response.Body.String())
	}

	var meal Meal
	if err := json.Unmarshal(response.Body.Bytes(), &meal); err != nil {
		t.Fatalf("decode assigned meal: %v", err)
	}
	if meal.RecipeID != recipe.ID || meal.MealType != Breakfast || meal.Recipe.Name != "Pancakes" {
		t.Fatalf("assigned meal = %+v", meal)
	}

	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/calendar?start=2026-10-29&days=1", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("GET assigned calendar status = %d, want %d", response.Code, http.StatusOK)
	}
	var assigned calendar
	if err := json.Unmarshal(response.Body.Bytes(), &assigned); err != nil {
		t.Fatalf("decode assigned calendar: %v", err)
	}
	if len(assigned.Days) != 1 || len(assigned.Days[0].Meals) != 1 {
		t.Fatalf("assigned calendar = %+v, want one meal", assigned)
	}
}

func TestCurrentCalendarAPIAssignmentReplacesAndRemovesMeal(t *testing.T) {
	handler, _ := newTestAPI(t)
	first := createCurrentCalendarRecipe(t, handler, "Pancakes")
	second := createCurrentCalendarRecipe(t, handler, "Waffles")

	assign := func(recipeID int) {
		t.Helper()
		body := `{"date":"2026-11-01","recipe_id":` + strconv.Itoa(recipeID) + `,"meal_type":"dinner"}`
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/calendar/meals", strings.NewReader(body)))
		if response.Code != http.StatusOK {
			t.Fatalf("assign meal status = %d, want %d: %s", response.Code, http.StatusOK, response.Body.String())
		}
	}

	assign(first.ID)
	assign(second.ID)

	request := httptest.NewRequest(http.MethodGet, "/api/calendar?start=2026-11-01&days=1", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	var calendarResponse calendar
	if err := json.Unmarshal(response.Body.Bytes(), &calendarResponse); err != nil {
		t.Fatalf("decode replaced calendar: %v", err)
	}
	if len(calendarResponse.Days) != 1 || len(calendarResponse.Days[0].Meals) != 1 {
		t.Fatalf("replaced calendar = %+v, want one meal", calendarResponse)
	}
	if got := calendarResponse.Days[0].Meals[0].RecipeID; got != second.ID {
		t.Fatalf("replaced recipe ID = %d, want %d", got, second.ID)
	}

	request = httptest.NewRequest(http.MethodDelete, "/api/calendar/meals?date=2026-11-01&meal_type=dinner", nil)
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNoContent {
		t.Fatalf("DELETE meal status = %d, want %d", response.Code, http.StatusNoContent)
	}

	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/calendar?start=2026-11-01&days=1", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("GET after DELETE status = %d, want %d", response.Code, http.StatusOK)
	}
	calendarResponse = calendar{}
	if err := json.Unmarshal(response.Body.Bytes(), &calendarResponse); err != nil {
		t.Fatalf("decode calendar after removal: %v", err)
	}
	if len(calendarResponse.Days) != 1 || len(calendarResponse.Days[0].Meals) != 0 {
		t.Fatalf("calendar after removal = %+v, want no meals", calendarResponse)
	}
}

func TestCurrentCalendarAPIRejectsInvalidRequests(t *testing.T) {
	handler, _ := newTestAPI(t)
	tests := []struct {
		name   string
		method string
		path   string
		body   string
		want   int
	}{
		{"invalid start date", http.MethodGet, "/api/calendar?start=2026-13-01", "", http.StatusBadRequest},
		{"invalid day count", http.MethodGet, "/api/calendar?days=32", "", http.StatusBadRequest},
		{"invalid meal date", http.MethodPost, "/api/calendar/meals", `{"date":"tomorrow","recipe_id":1,"meal_type":"dinner"}`, http.StatusBadRequest},
		{"invalid meal type", http.MethodPost, "/api/calendar/meals", `{"date":"2026-11-01","recipe_id":1,"meal_type":"snack"}`, http.StatusBadRequest},
		{"unknown recipe", http.MethodPost, "/api/calendar/meals", `{"date":"2026-11-01","recipe_id":999,"meal_type":"dinner"}`, http.StatusBadRequest},
		{"missing calendar day", http.MethodDelete, "/api/calendar/meals?date=2026-11-01&meal_type=dinner", "", http.StatusNotFound},
		{"invalid removal meal type", http.MethodDelete, "/api/calendar/meals?date=2026-11-01&meal_type=snack", "", http.StatusBadRequest},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(test.method, test.path, strings.NewReader(test.body))
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != test.want {
				t.Fatalf("%s status = %d, want %d: %s", test.name, response.Code, test.want, response.Body.String())
			}
		})
	}
}

func TestCurrentCalendarAPIDefaultAndMaximumRanges(t *testing.T) {
	handler, _ := newTestAPI(t)

	for _, test := range []struct {
		name string
		path string
		want int
	}{
		{name: "default range", path: "/api/calendar", want: 7},
		{name: "maximum range", path: "/api/calendar?start=2026-12-01&days=31", want: 31},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, test.path, nil))
			if response.Code != http.StatusOK {
				t.Fatalf("GET calendar status = %d, want %d", response.Code, http.StatusOK)
			}

			var result calendar
			if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
				t.Fatalf("decode calendar: %v", err)
			}
			if len(result.Days) != test.want {
				t.Fatalf("calendar days = %d, want %d", len(result.Days), test.want)
			}
		})
	}
}

func TestCurrentCalendarAPISupportsEveryMealType(t *testing.T) {
	handler, _ := newTestAPI(t)
	recipe := createCurrentCalendarRecipe(t, handler, "Meal Prep")

	for _, mealType := range []MealType{Breakfast, Lunch, Dinner} {
		body := `{"date":"2026-11-02","recipe_id":` + strconv.Itoa(recipe.ID) + `,"meal_type":"` + string(mealType) + `"}`
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/calendar/meals", strings.NewReader(body)))
		if response.Code != http.StatusOK {
			t.Fatalf("assign %s status = %d, want %d: %s", mealType, response.Code, http.StatusOK, response.Body.String())
		}
	}

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/calendar?start=2026-11-02&days=1", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("GET calendar status = %d, want %d", response.Code, http.StatusOK)
	}
	var result calendar
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatalf("decode calendar: %v", err)
	}
	if len(result.Days) != 1 || len(result.Days[0].Meals) != 3 {
		t.Fatalf("calendar meals = %+v, want three meal types", result.Days)
	}
}

func TestCurrentCalendarAPIRemovingMissingMealReturnsNotFound(t *testing.T) {
	handler, _ := newTestAPI(t)
	recipe := createCurrentCalendarRecipe(t, handler, "Breakfast")

	body := `{"date":"2026-11-03","recipe_id":` + strconv.Itoa(recipe.ID) + `,"meal_type":"breakfast"}`
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/calendar/meals", strings.NewReader(body)))
	if response.Code != http.StatusOK {
		t.Fatalf("assign meal status = %d, want %d", response.Code, http.StatusOK)
	}

	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodDelete, "/api/calendar/meals?date=2026-11-03&meal_type=lunch", nil))
	if response.Code != http.StatusNotFound {
		t.Fatalf("remove missing meal status = %d, want %d", response.Code, http.StatusNotFound)
	}
}

func TestCurrentCalendarAPIRejectsMalformedAndUnknownMealJSON(t *testing.T) {
	handler, _ := newTestAPI(t)
	for _, body := range []string{
		`{"date":"2026-11-04","recipe_id":1`,
		`{"date":"2026-11-04","recipe_id":1,"meal_type":"dinner","extra":true}`,
	} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/calendar/meals", strings.NewReader(body)))
		if response.Code != http.StatusBadRequest {
			t.Fatalf("meal body %q status = %d, want %d", body, response.Code, http.StatusBadRequest)
		}
	}
}
