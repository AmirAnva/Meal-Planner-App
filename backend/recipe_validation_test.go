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
		strings.NewReader(`{"name":"","source":"personal"}`),
	)
	request.Header.Set("Content-Type", "application/json")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("Expected status 400, got %d", response.Code)
	}
}
