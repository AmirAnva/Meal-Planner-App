package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
)

// Chelsea Zhuang
func TestCreateRecipeInputCases(t *testing.T) {
	testCases := []struct {
		name   string
		recipe Recipe
	}{
		{
			name: "ordinary recipe information",
			recipe: Recipe{
				Name:         "Oatmeal and Eggs",
				Ingredients:  []string{"oats", "eggs"},
				Instructions: []string{"Cook the oats", "Serve with eggs"},
			},
		},
		{
			name: "unusual characters are preserved",
			recipe: Recipe{
				Name:         `Crème brûlée — "chef's choice" 🥣`,
				Ingredients:  []string{"1½ cups cream", "𓀟 𰻝𰻝面 zest"},
				Instructions: []string{"Stir gently; don't boil."},
			},
		},
		{
			name: "empty ingredients and instructions",
			recipe: Recipe{
				Name:         "Mystery Soup",
				Ingredients:  []string{},
				Instructions: []string{},
			},
		},
		{
			name: "markup-like text remains ordinary data",
			recipe: Recipe{
				Name:         `'); DROP TABLE recipes; -- <script>alert('xss')</script>`,
				Ingredients:  []string{`<img src=x onerror=alert(1)>`},
				Instructions: []string{},
			},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			handler, _ := newTestAPI(t)

			requestBody, err := json.Marshal(testCase.recipe)
			if err != nil {
				t.Fatalf("marshal recipe: %v", err)
			}

			request := httptest.NewRequest(
				http.MethodPost,
				"/api/recipes",
				bytes.NewReader(requestBody),
			)
			request.Header.Set("Content-Type", "application/json")

			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)

			if response.Code != http.StatusCreated {
				t.Fatalf(
					"POST status = %d, want %d: %s",
					response.Code,
					http.StatusCreated,
					response.Body.String(),
				)
			}

			var created Recipe
			if err := json.Unmarshal(response.Body.Bytes(), &created); err != nil {
				t.Fatalf("decode created recipe: %v", err)
			}

			if created.ID != 1 {
				t.Errorf("created ID = %d, want 1", created.ID)
			}

			if created.Name != testCase.recipe.Name {
				t.Errorf(
					"created name = %q, want %q",
					created.Name,
					testCase.recipe.Name,
				)
			}

			if !reflect.DeepEqual(created.Ingredients, testCase.recipe.Ingredients) {
				t.Errorf(
					"created ingredients = %v, want %v",
					created.Ingredients,
					testCase.recipe.Ingredients,
				)
			}

			if !reflect.DeepEqual(created.Instructions, testCase.recipe.Instructions) {
				t.Errorf(
					"created instructions = %v, want %v",
					created.Instructions,
					testCase.recipe.Instructions,
				)
			}
		})
	}
}
