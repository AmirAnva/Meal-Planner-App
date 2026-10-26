package main

import (
	"encoding/json"
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

// Amir Anvarkhujaev - Tests bad request validation edge cases and error messages.
//Test that a recipe with a whitespace-only name is rejected.
//Test that malformed JSON is rejected.
//Test that a recipe missing its required name is rejected.

func TestRecipeAPIValidationErrors(t *testing.T) {
	handler, _ := newTestAPI(t)

	testCases := []struct {
		name        string
		payload     string
		expectedErr string
	}{
		{
			name:        "whitespace-only name",
			payload:     `{"name":"   ","ingredients":[],"instructions":[]}`,
			expectedErr: "name is required",
		},
		{
			name:        "missing name field",
			payload:     `{"ingredients":["pasta"],"instructions":["Boil pasta"]}`,
			expectedErr: "name is required",
		},
		{
			name:        "malformed JSON syntax",
			payload:     `{"name":"Pasta",`,
			expectedErr: "invalid recipe JSON",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/api/recipes", strings.NewReader(tc.payload))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want %d", response.Code, http.StatusBadRequest)
			}

			var body struct {
				Error string `json:"error"`
			}
			if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
				t.Fatalf("failed to decode error body: %v", err)
			}
			if body.Error != tc.expectedErr {
				t.Fatalf("got error message %q, want %q", body.Error, tc.expectedErr)
			}
		})
	}
}
