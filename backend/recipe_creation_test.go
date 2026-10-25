package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Chelsea Zhuang: TestCreateRecipeInputCases checks normal, unusual, empty, and hostile-looking recipe inputs.
func TestCreateRecipeInputCases(t *testing.T) {
	testCases := []struct {
		name            string
		recipe          recipeJSON
		wantEscapedHTML bool
	}{
		{
			name: "ordinary recipe information",
			recipe: recipeJSON{
				Name:         "Oatmeal and Eggs",
				Ingredients:  []string{"oats", "eggs"},
				Instructions: []string{"Cook the oats", "Serve with eggs"},
			},
		},
		{
			name: "unusual characters",
			recipe: recipeJSON{
				Name:         `Crème brûlée — "chef's choice" 🥣`,
				Ingredients:  []string{"1½ cups cream", "𓀟  𰻝𰻝面 zest"},
				Instructions: []string{"Stir gently; don't boil."},
			},
		},
		{
			name: "empty ingredients",
			recipe: recipeJSON{
				Name:         "Mystery Soup",
				Ingredients:  []string{},
				Instructions: []string{},
			},
		},
		{
			name: "hostile-looking input remains data",
			recipe: recipeJSON{
				Name:         `'); DROP TABLE recipes; -- <script>alert('xss')</script>`,
				Ingredients:  []string{`<img src=x onerror=alert(1)>`},
				Instructions: []string{},
			},
			wantEscapedHTML: true,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			handler, _ := newTestAPI(t)
			requestBody, err := json.Marshal(testCase.recipe)
			if err != nil {
				t.Fatalf("marshal recipe: %v", err)
			}

			request := httptest.NewRequest(http.MethodPost, "/api/recipes", strings.NewReader(string(requestBody)))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusCreated {
				t.Fatalf("POST status = %d, want %d: %s", response.Code, http.StatusCreated, response.Body.String())
			}

			var created recipeJSON
			if err := json.Unmarshal(response.Body.Bytes(), &created); err != nil {
				t.Fatalf("decode created recipe: %v", err)
			}
			if created.ID != 1 || created.Name != testCase.recipe.Name {
				t.Fatalf("created recipe = %+v, want name %q and ID 1", created, testCase.recipe.Name)
			}
			if len(created.Ingredients) != len(testCase.recipe.Ingredients) || len(created.Instructions) != len(testCase.recipe.Instructions) {
				t.Fatalf("created recipe lists = ingredients %v, instructions %v", created.Ingredients, created.Instructions)
			}
			if testCase.wantEscapedHTML && strings.Contains(response.Body.String(), "<script>") {
				t.Fatalf("response contains unescaped script markup: %s", response.Body.String())
			}
		})
	}
}
