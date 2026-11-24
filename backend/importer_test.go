package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

type mockRecipeParser struct {
	result *Recipe
	err    error
}

func (m *mockRecipeParser) ImportRecipeFromURL(ctx context.Context, targetURL string) (*Recipe, error) {
	if m.err != nil {
		return nil, m.err
	}
	return m.result, nil
}

func TestImportRecipeEndpoint_Success(t *testing.T) {
	dataPath := filepath.Join(t.TempDir(), "recipes.db")
	store, err := OpenSQLiteRepository(dataPath)
	if err != nil {
		t.Fatalf("OpenSQLiteRepository() error = %v", err)
	}
	defer store.Close()

	expected := &Recipe{
		Name:         "Lemon Herb Salmon",
		Ingredients:  []string{"1 lb salmon fillet", "2 tbsp lemon juice", "1 tsp dill"},
		Instructions: []string{"Preheat oven to 400F.", "Bake for 15 minutes until flaky."},
	}
	mock := &mockRecipeParser{result: expected}
	apiHandler := NewAPIWithImporter(store, mock)

	req := httptest.NewRequest(http.MethodPost, "/api/recipes/import-url", strings.NewReader(`{"url":"https://example.com/salmon"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	apiHandler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d. Body: %s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var parsed Recipe
	if err := json.Unmarshal(rec.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}

	if parsed.Name != expected.Name {
		t.Errorf("got name %q, want %q", parsed.Name, expected.Name)
	}
	if !reflect.DeepEqual(parsed.Ingredients, expected.Ingredients) {
		t.Errorf("got ingredients %+v, want %+v", parsed.Ingredients, expected.Ingredients)
	}
	if !reflect.DeepEqual(parsed.Instructions, expected.Instructions) {
		t.Errorf("got instructions %+v, want %+v", parsed.Instructions, expected.Instructions)
	}
}

func TestImportRecipeEndpoint_InvalidInput(t *testing.T) {
	dataPath := filepath.Join(t.TempDir(), "recipes.db")
	store, err := OpenSQLiteRepository(dataPath)
	if err != nil {
		t.Fatalf("OpenSQLiteRepository() error = %v", err)
	}
	defer store.Close()

	mock := &mockRecipeParser{err: errors.New("url unreachable")}
	apiHandler := NewAPIWithImporter(store, mock)

	// Missing URL
	req := httptest.NewRequest(http.MethodPost, "/api/recipes/import-url", strings.NewReader(`{"url":""}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	apiHandler.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}

	// Parser returns error
	req2 := httptest.NewRequest(http.MethodPost, "/api/recipes/import-url", strings.NewReader(`{"url":"https://unreachable.fake"}`))
	req2.Header.Set("Content-Type", "application/json")
	rec2 := httptest.NewRecorder()
	apiHandler.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec2.Code, http.StatusBadRequest)
	}
}

func TestExtractJSONLDRecipe(t *testing.T) {
	sampleHTML := `
<!DOCTYPE html>
<html>
<head>
  <title>Blueberry Pancakes Recipe</title>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Recipe",
    "name": "Fluffy Blueberry Pancakes",
    "recipeIngredient": [
      "1 cup all-purpose flour",
      "1 tbsp sugar",
      "1/2 cup fresh blueberries"
    ],
    "recipeInstructions": [
      {"@type": "HowToStep", "text": "Whisk dry ingredients in a bowl."},
      {"@type": "HowToStep", "text": "Fold in blueberries and cook on griddle."}
    ]
  }
  </script>
</head>
<body><h1>Pancakes</h1></body>
</html>`

	recipe, ok := extractJSONLDRecipe(sampleHTML)
	if !ok || recipe == nil {
		t.Fatalf("expected JSON-LD recipe to be found")
	}

	if recipe.Name != "Fluffy Blueberry Pancakes" {
		t.Errorf("got name %q, want 'Fluffy Blueberry Pancakes'", recipe.Name)
	}
	if len(recipe.Ingredients) != 3 {
		t.Errorf("got %d ingredients, want 3", len(recipe.Ingredients))
	}
	if len(recipe.Instructions) != 2 {
		t.Errorf("got %d instructions, want 2", len(recipe.Instructions))
	}
	if recipe.Instructions[0] != "Whisk dry ingredients in a bowl." {
		t.Errorf("unexpected step 1: %s", recipe.Instructions[0])
	}
}

func TestOllamaImporter_EndToEndWithMockServers(t *testing.T) {
	// 1. Mock Ollama server
	ollamaServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/generate" {
			http.NotFound(w, r)
			return
		}

		var req struct {
			Model  string `json:"model"`
			Prompt string `json:"prompt"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// Return Qwen-generated recipe JSON wrapped in Ollama response
		modelOutput := `{"name": "Garlic Butter Steak Bites", "ingredients": ["1 lb sirloin steak, cubed", "3 cloves garlic, minced", "2 tbsp butter"], "instructions": ["Season steak cubes with salt and pepper.", "Sear steak in hot skillet for 4 minutes.", "Toss with melted butter and garlic."]}`
		respPayload := map[string]string{
			"response": modelOutput,
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(respPayload)
	}))
	defer ollamaServer.Close()

	// 2. Mock recipe webpage (no JSON-LD, plain text blog)
	webpageServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`
<!DOCTYPE html>
<html>
<head><title>Garlic Butter Steak Bites - Easy Dinner</title></head>
<body>
  <header><nav><a href="/">Home</a></nav></header>
  <main>
    <h1>Garlic Butter Steak Bites</h1>
    <p>Growing up, my grandmother always made these delicious bites...</p>
    <h2>Ingredients</h2>
    <p>1 lb sirloin steak, cubed</p>
    <p>3 cloves garlic, minced</p>
    <p>2 tbsp butter</p>
    <h2>How to make it</h2>
    <p>Season steak cubes with salt and pepper.</p>
    <p>Sear steak in hot skillet for 4 minutes.</p>
    <p>Toss with melted butter and garlic.</p>
  </main>
  <footer>Copyright 2026</footer>
</body>
</html>`))
	}))
	defer webpageServer.Close()

	importer := NewOllamaImporter(ollamaServer.URL, "qwen2.5:1.5b", &http.Client{})

	recipe, err := importer.ImportRecipeFromURL(context.Background(), webpageServer.URL)
	if err != nil {
		t.Fatalf("ImportRecipeFromURL failed: %v", err)
	}

	if recipe.Name != "Garlic Butter Steak Bites" {
		t.Errorf("got name %q, want 'Garlic Butter Steak Bites'", recipe.Name)
	}
	if len(recipe.Ingredients) != 3 {
		t.Errorf("got %d ingredients, want 3: %+v", len(recipe.Ingredients), recipe.Ingredients)
	}
	if len(recipe.Instructions) != 3 {
		t.Errorf("got %d instructions, want 3: %+v", len(recipe.Instructions), recipe.Instructions)
	}
}
