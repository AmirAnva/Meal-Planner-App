package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCalendarAPIGetDay(t *testing.T) {
	handler, _ := newTestAPI(t)

	// Fetch calendar for a specific date
	req := httptest.NewRequest(http.MethodGet, "/api/calendar?date=2026-11-02", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/calendar status = %d, want %d", rec.Code, http.StatusOK)
	}

	var day Day
	if err := json.Unmarshal(rec.Body.Bytes(), &day); err != nil {
		t.Fatalf("decode day json: %v", err)
	}

	if day.Date != "2026-11-02" {
		t.Fatalf("day.Date = %q, want %q", day.Date, "2026-11-02")
	}
	if len(day.Meals) != 0 {
		t.Fatalf("expected 0 meals, got %d", len(day.Meals))
	}
}

func TestCalendarAPIAssignAndGetMeal(t *testing.T) {
	handler, _ := newTestAPI(t)

	// Create a recipe first
	recipeReq := httptest.NewRequest(http.MethodPost, "/api/recipes", bytes.NewReader([]byte(`{"name":"Pancakes","ingredients":["flour","milk"],"instructions":["mix","cook"]}`)))
	recipeReq.Header.Set("Content-Type", "application/json")
	recipeRec := httptest.NewRecorder()
	handler.ServeHTTP(recipeRec, recipeReq)

	if recipeRec.Code != http.StatusCreated {
		t.Fatalf("create recipe status = %d, want %d", recipeRec.Code, http.StatusCreated)
	}
	var recipe Recipe
	if err := json.Unmarshal(recipeRec.Body.Bytes(), &recipe); err != nil {
		t.Fatalf("decode recipe: %v", err)
	}

	// Assign to breakfast
	payload := fmt.Sprintf(`{"date":"2026-11-02","meal_type":"breakfast","recipe_id":%d}`, recipe.ID)
	assignReq := httptest.NewRequest(http.MethodPost, "/api/calendar/meals", bytes.NewReader([]byte(payload)))
	assignReq.Header.Set("Content-Type", "application/json")
	assignRec := httptest.NewRecorder()
	handler.ServeHTTP(assignRec, assignReq)

	if assignRec.Code != http.StatusOK {
		t.Fatalf("POST /api/calendar/meals status = %d, want %d: %s", assignRec.Code, http.StatusOK, assignRec.Body.String())
	}

	var assigned Meal
	if err := json.Unmarshal(assignRec.Body.Bytes(), &assigned); err != nil {
		t.Fatalf("decode assigned meal: %v", err)
	}
	if assigned.MealType != Breakfast || assigned.Recipe.Name != "Pancakes" {
		t.Fatalf("unexpected assigned meal: %+v", assigned)
	}

	// Now GET /api/calendar should contain this meal
	getReq := httptest.NewRequest(http.MethodGet, "/api/calendar?date=2026-11-02", nil)
	getRec := httptest.NewRecorder()
	handler.ServeHTTP(getRec, getReq)

	var day Day
	if err := json.Unmarshal(getRec.Body.Bytes(), &day); err != nil {
		t.Fatalf("decode day: %v", err)
	}
	if len(day.Meals) != 1 || day.Meals[0].Recipe.Name != "Pancakes" {
		t.Fatalf("expected 1 meal with Pancakes, got %+v", day.Meals)
	}
}

func TestCalendarAPIAssignValidationErrors(t *testing.T) {
	handler, _ := newTestAPI(t)

	// Invalid meal type
	req := httptest.NewRequest(http.MethodPost, "/api/calendar/meals", bytes.NewReader([]byte(`{"date":"2026-11-02","meal_type":"dessert","recipe_id":1}`)))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid meal_type, got %d", rec.Code)
	}

	// Invalid recipe id
	req = httptest.NewRequest(http.MethodPost, "/api/calendar/meals", bytes.NewReader([]byte(`{"date":"2026-11-02","meal_type":"breakfast","recipe_id":0}`)))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for recipe_id <= 0, got %d", rec.Code)
	}

	// Nonexistent recipe id
	req = httptest.NewRequest(http.MethodPost, "/api/calendar/meals", bytes.NewReader([]byte(`{"date":"2026-11-02","meal_type":"breakfast","recipe_id":999}`)))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for nonexistent recipe, got %d", rec.Code)
	}
}

func TestCalendarAPIDeleteMeal(t *testing.T) {
	handler, _ := newTestAPI(t)

	// Create recipe & assign meal
	recipeReq := httptest.NewRequest(http.MethodPost, "/api/recipes", bytes.NewReader([]byte(`{"name":"Salad","ingredients":["lettuce"],"instructions":[]}`)))
	recipeReq.Header.Set("Content-Type", "application/json")
	recipeRec := httptest.NewRecorder()
	handler.ServeHTTP(recipeRec, recipeReq)

	assignReq := httptest.NewRequest(http.MethodPost, "/api/calendar/meals", bytes.NewReader([]byte(`{"date":"2026-11-02","meal_type":"lunch","recipe_id":1}`)))
	assignReq.Header.Set("Content-Type", "application/json")
	assignRec := httptest.NewRecorder()
	handler.ServeHTTP(assignRec, assignReq)

	if assignRec.Code != http.StatusOK {
		t.Fatalf("assign status = %d, want %d", assignRec.Code, http.StatusOK)
	}

	// DELETE /api/calendar/meals?date=2026-11-02&meal_type=lunch
	delReq := httptest.NewRequest(http.MethodDelete, "/api/calendar/meals?date=2026-11-02&meal_type=lunch", nil)
	delRec := httptest.NewRecorder()
	handler.ServeHTTP(delRec, delReq)

	if delRec.Code != http.StatusNoContent {
		t.Fatalf("DELETE status = %d, want %d", delRec.Code, http.StatusNoContent)
	}

	// Verify it is gone
	getReq := httptest.NewRequest(http.MethodGet, "/api/calendar?date=2026-11-02", nil)
	getRec := httptest.NewRecorder()
	handler.ServeHTTP(getRec, getReq)

	var day Day
	_ = json.Unmarshal(getRec.Body.Bytes(), &day)
	if len(day.Meals) != 0 {
		t.Fatalf("expected 0 meals after deletion, got %d", len(day.Meals))
	}

	// Deleting again returns 404
	delReq2 := httptest.NewRequest(http.MethodDelete, "/api/calendar/meals?date=2026-11-02&meal_type=lunch", nil)
	delRec2 := httptest.NewRecorder()
	handler.ServeHTTP(delRec2, delReq2)
	if delRec2.Code != http.StatusNotFound {
		t.Fatalf("second DELETE status = %d, want %d", delRec2.Code, http.StatusNotFound)
	}
}
