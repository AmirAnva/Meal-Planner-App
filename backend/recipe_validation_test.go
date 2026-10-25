package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Conner Chen - Test that a recipe with an empty name is rejected.
func TestRecipeAPIRejectsEmptyName(t *testing.T) {
	handler, _ := newTestAPI(t)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api/recipes",
		strings.NewReader(`{"name":"","ingredients":[],"instructions":[]}`),
	)
	request.Header.Set("Content-Type", "application/json")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("Expected status 400, got %d", response.Code)
	}
}

// Amir Anvarkhujaev - Test that a recipe with a whitespace-only name is rejected.
func TestRecipeAPIRejectsWhitespaceOnlyName(t *testing.T) {
	handler, _ := newTestAPI(t)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api/recipes",
		strings.NewReader(`{"name":"   ","ingredients":[],"instructions":[]}`),
	)
	request.Header.Set("Content-Type", "application/json")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("Expected status 400, got %d", response.Code)
	}
}

// Amir Anvarkhujaev - Test that malformed JSON is rejected.
func TestRecipeAPIRejectsMalformedJSON(t *testing.T) {
	handler, _ := newTestAPI(t)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api/recipes",
		strings.NewReader(`{"name":"Pasta",`),
	)
	request.Header.Set("Content-Type", "application/json")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("Expected status 400, got %d", response.Code)
	}
}

// Amir Anvarkhujaev - Test that a recipe missing its required name is rejected.
func TestRecipeAPIRejectsMissingName(t *testing.T) {
	handler, _ := newTestAPI(t)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api/recipes",
		strings.NewReader(`{"ingredients":["pasta"],"instructions":["Boil pasta"]}`),
	)
	request.Header.Set("Content-Type", "application/json")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("Expected status 400, got %d", response.Code)
	}
}
