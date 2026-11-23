package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
)

func TestNormalizedInventoryHandlersAndCompatibilityRoutes(t *testing.T) {
	handler, _ := newTestAPI(t)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/recipes", strings.NewReader(`{"name":"Rice bowl"}`)))
	if response.Code != http.StatusCreated {
		t.Fatalf("create recipe status = %d, want 201: %s", response.Code, response.Body.String())
	}
	var recipe Recipe
	if err := json.Unmarshal(response.Body.Bytes(), &recipe); err != nil {
		t.Fatalf("decode recipe: %v", err)
	}

	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/ingredients", strings.NewReader(`{"name":"Rice"}`)))
	if response.Code != http.StatusCreated {
		t.Fatalf("create ingredient status = %d, want 201: %s", response.Code, response.Body.String())
	}
	var ingredient Ingredient
	if err := json.Unmarshal(response.Body.Bytes(), &ingredient); err != nil {
		t.Fatalf("decode ingredient: %v", err)
	}

	response = httptest.NewRecorder()
	body := `{"ingredients":[{"ingredient_id":` + strconv.Itoa(ingredient.ID) + `,"quantity":2,"unit":"cup"}]}`
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPut, "/api/recipes/"+strconv.Itoa(recipe.ID)+"/ingredients", strings.NewReader(body)))
	if response.Code != http.StatusOK {
		t.Fatalf("set recipe ingredients status = %d, want 200: %s", response.Code, response.Body.String())
	}

	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/grocery-list/generate", strings.NewReader(`{"recipe_ids":[`+strconv.Itoa(recipe.ID)+`],"add_to_list":true}`)))
	if response.Code != http.StatusOK {
		t.Fatalf("generate grocery requirements status = %d, want 200: %s", response.Code, response.Body.String())
	}

	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/grocery-list", nil))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"quantity":2`) {
		t.Fatalf("meal9 grocery list route = (%d, %s), want generated item", response.Code, response.Body.String())
	}

	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/grocery", nil))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"quantity":2`) {
		t.Fatalf("compatibility grocery route = (%d, %s), want generated item", response.Code, response.Body.String())
	}
}

func TestIngredientDeleteRejectsReferencedIngredient(t *testing.T) {
	handler, _ := newTestAPI(t)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/ingredients", strings.NewReader(`{"name":"Oats"}`)))
	if response.Code != http.StatusCreated {
		t.Fatalf("create ingredient status = %d, want 201", response.Code)
	}
	var ingredient Ingredient
	if err := json.Unmarshal(response.Body.Bytes(), &ingredient); err != nil {
		t.Fatalf("decode ingredient: %v", err)
	}
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPut, "/api/pantry-items", strings.NewReader(`{"ingredient_id":`+strconv.Itoa(ingredient.ID)+`,"quantity":4,"unit":"cup"}`)))
	if response.Code != http.StatusNoContent {
		t.Fatalf("save pantry item status = %d, want 204: %s", response.Code, response.Body.String())
	}
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodDelete, "/api/ingredients/"+strconv.Itoa(ingredient.ID), nil))
	if response.Code != http.StatusConflict {
		t.Fatalf("delete referenced ingredient status = %d, want 409: %s", response.Code, response.Body.String())
	}
}
