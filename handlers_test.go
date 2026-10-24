package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func newTestAPI(t *testing.T) (http.Handler, string) {
	t.Helper()

	dataPath := filepath.Join(t.TempDir(), "recipes.json")
	store, err := NewRecipeStore(dataPath)
	if err != nil {
		t.Fatalf("NewRecipeStore() error = %v", err)
	}
	return NewAPI(store), dataPath
}

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

	createRequest := httptest.NewRequest(http.MethodPost, "/api/recipes", strings.NewReader(`{"name":"Oatmeal","source":"personal","tags":["breakfast"]}`))
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
	if created.ID != 1 || created.Name != "Oatmeal" || len(created.Tags) != 1 || created.Tags[0] != "breakfast" {
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

func TestRecipeAPIPersistsRecipes(t *testing.T) {
	handler, dataPath := newTestAPI(t)
	request := httptest.NewRequest(http.MethodPost, "/api/recipes", strings.NewReader(`{"name":"Soup","source":"external","tags":[]}`))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusCreated {
		t.Fatalf("POST status = %d, want %d", response.Code, http.StatusCreated)
	}

	reloaded, err := NewRecipeStore(dataPath)
	if err != nil {
		t.Fatalf("reload recipe store: %v", err)
	}
	if got := reloaded.List(); len(got) != 1 || got[0].Name != "Soup" {
		t.Fatalf("reloaded recipes = %+v, want one Soup recipe", got)
	}
}

func TestRecipeAPIDeleteMissingRecipe(t *testing.T) {
	handler, _ := newTestAPI(t)
	request := httptest.NewRequest(http.MethodDelete, "/api/recipes/42", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("DELETE status = %d, want %d", response.Code, http.StatusNotFound)
	}
}
