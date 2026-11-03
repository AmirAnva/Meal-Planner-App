package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func newTestAPI(t *testing.T) (http.Handler, string) {
	t.Helper()

	dataPath := filepath.Join(t.TempDir(), "recipes.db")
	store, err := OpenSQLiteRepository(dataPath)
	if err != nil {
		t.Fatalf("NewRecipeStore() error = %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	return NewAPI(store), dataPath
}

// Chelsea Zhuang: checks the recipe collection lifecycle.
func TestRecipeAPIListCreateAndDelete(t *testing.T) {
	handler, _ := newTestAPI(t)

	listRequest := httptest.NewRequest(http.MethodGet, "/api/recipes", nil)
	listResponse := httptest.NewRecorder()
	handler.ServeHTTP(listResponse, listRequest)
	if listResponse.Code != http.StatusOK {
		t.Fatalf("GET status = %d, want %d", listResponse.Code, http.StatusOK)
	}
	var empty []Recipe
	if err := json.Unmarshal(listResponse.Body.Bytes(), &empty); err != nil {
		t.Fatalf("decode empty list: %v", err)
	}
	if len(empty) != 0 {
		t.Fatalf("GET returned %d recipes, want 0", len(empty))
	}

	createRequest := httptest.NewRequest(http.MethodPost, "/api/recipes", strings.NewReader(`{"name":"Oatmeal","ingredients":[],"instructions":[]}`))
	createRequest.Header.Set("Content-Type", "application/json")
	createResponse := httptest.NewRecorder()
	handler.ServeHTTP(createResponse, createRequest)
	if createResponse.Code != http.StatusCreated {
		t.Fatalf("POST status = %d, want %d: %s", createResponse.Code, http.StatusCreated, createResponse.Body.String())
	}
	var created Recipe
	if err := json.Unmarshal(createResponse.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode created recipe: %v", err)
	}
	if created.ID != 1 || created.Name != "Oatmeal" {
		t.Fatalf("unexpected created recipe: %+v", created)
	}

	deleteRequest := httptest.NewRequest(http.MethodDelete, "/api/recipes/1", nil)
	deleteResponse := httptest.NewRecorder()
	handler.ServeHTTP(deleteResponse, deleteRequest)
	if deleteResponse.Code != http.StatusNoContent {
		t.Fatalf("DELETE status = %d, want %d", deleteResponse.Code, http.StatusNoContent)
	}

	listResponse = httptest.NewRecorder()
	handler.ServeHTTP(listResponse, httptest.NewRequest(http.MethodGet, "/api/recipes", nil))
	if listResponse.Code != http.StatusOK || strings.TrimSpace(listResponse.Body.String()) != "[]" {
		t.Fatalf("GET after DELETE = (%d, %s), want (200, [])", listResponse.Code, listResponse.Body.String())
	}
}

// Chelsea Zhuang: checks that created recipes survive a reload.
func TestRecipeAPIPersistsRecipes(t *testing.T) {
	handler, dataPath := newTestAPI(t)
	request := httptest.NewRequest(http.MethodPost, "/api/recipes", strings.NewReader(`{"name":"Soup","ingredients":[],"instructions":[]}`))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusCreated {
		t.Fatalf("POST status = %d, want %d", response.Code, http.StatusCreated)
	}

	reloaded, err := OpenSQLiteRepository(dataPath)
	if err != nil {
		t.Fatalf("reload recipe store: %v", err)
	}
	defer reloaded.Close()
	recipes, err := reloaded.ListRecipes()
	if err != nil {
		t.Fatalf("list persisted recipes: %v", err)
	}
	if got := recipes; len(got) != 1 || got[0].Name != "Soup" {
		t.Fatalf("reloaded recipes = %+v, want one Soup recipe", got)
	}
}

// Chelsea Zhuang: checks the response for an unknown recipe ID.
func TestRecipeAPIDeleteMissingRecipe(t *testing.T) {
	handler, _ := newTestAPI(t)
	request := httptest.NewRequest(http.MethodDelete, "/api/recipes/42", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("DELETE status = %d, want %d", response.Code, http.StatusNotFound)
	}
}

func TestRecipeAPISearch(t *testing.T) {
	handler, _ := newTestAPI(t)
	request := httptest.NewRequest(http.MethodPost, "/api/recipes", strings.NewReader(`{"name":"Tomato Soup","ingredients":["tomato"],"tags":["quick","Soup"]}`))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusCreated {
		t.Fatalf("create recipe status = %d, want %d", response.Code, http.StatusCreated)
	}
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/recipes", strings.NewReader(`{"name":"Onion Salad","ingredients":["onion"]}`)))
	if response.Code != http.StatusCreated {
		t.Fatalf("create second recipe status = %d, want %d", response.Code, http.StatusCreated)
	}

	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/recipes/search?q=TOMATO&q=onion", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("search status = %d, want %d", response.Code, http.StatusOK)
	}
	var recipes []Recipe
	if err := json.Unmarshal(response.Body.Bytes(), &recipes); err != nil {
		t.Fatalf("decode search results: %v", err)
	}
	if len(recipes) != 2 || recipes[0].Name != "Tomato Soup" || recipes[1].Name != "Onion Salad" {
		t.Fatalf("search results = %+v, want Tomato Soup and Onion Salad", recipes)
	}

	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/recipes/search?q=quick", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("tag search status = %d, want %d", response.Code, http.StatusOK)
	}
	recipes = nil
	if err := json.Unmarshal(response.Body.Bytes(), &recipes); err != nil {
		t.Fatalf("decode tag search results: %v", err)
	}
	if len(recipes) != 1 || recipes[0].Name != "Tomato Soup" {
		t.Fatalf("tag search results = %+v, want Tomato Soup", recipes)
	}
}

func TestRecipeAPIUpdate(t *testing.T) {
	handler, _ := newTestAPI(t)
	create := httptest.NewRequest(http.MethodPost, "/api/recipes", strings.NewReader(`{"name":"Egg Bowl","ingredients":["eggs"]}`))
	createdResponse := httptest.NewRecorder()
	handler.ServeHTTP(createdResponse, create)
	if createdResponse.Code != http.StatusCreated {
		t.Fatalf("create status = %d, want %d", createdResponse.Code, http.StatusCreated)
	}

	var created Recipe
	if err := json.Unmarshal(createdResponse.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode created recipe: %v", err)
	}
	update := httptest.NewRequest(http.MethodPut, "/api/recipes/"+strconv.Itoa(created.ID),
		strings.NewReader(`{"name":"Updated Egg Bowl","ingredients":["eggs","rice"],"tags":["breakfast"]}`))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, update)
	if response.Code != http.StatusOK {
		t.Fatalf("update status = %d, want %d: %s", response.Code, http.StatusOK, response.Body.String())
	}

	var updated Recipe
	if err := json.Unmarshal(response.Body.Bytes(), &updated); err != nil {
		t.Fatalf("decode updated recipe: %v", err)
	}
	if updated.ID != created.ID || updated.Name != "Updated Egg Bowl" || len(updated.Ingredients) != 2 || len(updated.Tags) != 1 {
		t.Fatalf("updated recipe = %+v", updated)
	}
}

func TestRecipeAPIRejectsInvalidUpdateRequests(t *testing.T) {
	handler, _ := newTestAPI(t)
	tests := []struct {
		name string
		path string
		body string
		want int
	}{
		{"invalid ID", "/api/recipes/not-an-id", `{"name":"Soup"}`, http.StatusBadRequest},
		{"missing recipe", "/api/recipes/99", `{"name":"Soup"}`, http.StatusNotFound},
		{"invalid JSON", "/api/recipes/1", `{"name":`, http.StatusBadRequest},
		{"unknown field", "/api/recipes/1", `{"name":"Soup","unknown":true}`, http.StatusBadRequest},
		{"empty name", "/api/recipes/1", `{"name":" "}`, http.StatusBadRequest},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPut, test.path, strings.NewReader(test.body))
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != test.want {
				t.Fatalf("update status = %d, want %d: %s", response.Code, test.want, response.Body.String())
			}
		})
	}
}

func TestRecipeAPIRejectsUnknownCreateFields(t *testing.T) {
	handler, _ := newTestAPI(t)
	request := httptest.NewRequest(http.MethodPost, "/api/recipes", strings.NewReader(`{"name":"Soup","unknown":true}`))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("create status = %d, want %d", response.Code, http.StatusBadRequest)
	}
}

func TestAPIOptionsReturnsCORSHeaders(t *testing.T) {
	handler, _ := newTestAPI(t)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodOptions, "/api/recipes", nil))
	if response.Code != http.StatusNoContent {
		t.Fatalf("OPTIONS status = %d, want %d", response.Code, http.StatusNoContent)
	}
	if response.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("CORS origin = %q, want *", response.Header().Get("Access-Control-Allow-Origin"))
	}
	if response.Header().Get("Access-Control-Allow-Methods") == "" || response.Header().Get("Access-Control-Allow-Headers") == "" {
		t.Fatal("OPTIONS response missing CORS method or header declarations")
	}
}

func TestAPIStorageErrorsReturnInternalServerError(t *testing.T) {
	store, err := OpenSQLiteRepository(":memory:")
	if err != nil {
		t.Fatalf("open repository: %v", err)
	}
	if err := store.Close(); err != nil {
		t.Fatalf("close repository: %v", err)
	}
	handler := NewAPI(store)

	tests := []struct {
		name string
		path string
	}{
		{"list", "/api/recipes"},
		{"search", "/api/recipes/search?q=soup"},
		{"calendar", "/api/calendar?start=2026-11-01&days=1"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, test.path, nil))
			if response.Code != http.StatusInternalServerError {
				t.Fatalf("%s status = %d, want %d", test.name, response.Code, http.StatusInternalServerError)
			}
		})
	}
}
