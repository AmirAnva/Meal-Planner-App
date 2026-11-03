package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"testing"
)

func TestRecipeTagsNormalizeOnCreateAndUpdate(t *testing.T) {
	repository := newTestRepository(t)
	created, err := repository.CreateRecipe(Recipe{
		Name: "Egg Breakfast",
		Tags: []string{"  Quick  ", "vegetarian", "quick", "", " Vegetarian "},
	})
	if err != nil {
		t.Fatalf("CreateRecipe(): %v", err)
	}
	wantTags := []string{"Quick", "vegetarian"}
	if !reflect.DeepEqual(created.Tags, wantTags) {
		t.Fatalf("created tags = %v, want %v", created.Tags, wantTags)
	}

	created.Tags = []string{"Dinner", " dinner ", "family"}
	updated, err := repository.UpdateRecipe(created)
	if err != nil {
		t.Fatalf("UpdateRecipe(): %v", err)
	}
	if want := []string{"Dinner", "family"}; !reflect.DeepEqual(updated.Tags, want) {
		t.Fatalf("updated tags = %v, want %v", updated.Tags, want)
	}

	reloaded, err := repository.GetRecipe(created.ID)
	if err != nil {
		t.Fatalf("GetRecipe(): %v", err)
	}
	if !reflect.DeepEqual(reloaded.Tags, updated.Tags) {
		t.Fatalf("persisted tags = %v, want %v", reloaded.Tags, updated.Tags)
	}
}

func TestRecipeTagsSearchOnlyMatchesNamesIngredientsAndTags(t *testing.T) {
	repository := newTestRepository(t)
	recipe, err := repository.CreateRecipe(Recipe{
		Name:         "Egg Bowl",
		Ingredients:  []string{"eggs", "rice"},
		Instructions: []string{"Whisk the eggs"},
		Tags:         []string{"high-protein", "breakfast"},
	})
	if err != nil {
		t.Fatalf("CreateRecipe(): %v", err)
	}

	for _, query := range []string{"eggs", "HIGH-PROTEIN", "breakfast"} {
		results, err := repository.SearchRecipes(query)
		if err != nil {
			t.Fatalf("SearchRecipes(%q): %v", query, err)
		}
		if len(results) != 1 || results[0].ID != recipe.ID {
			t.Fatalf("SearchRecipes(%q) = %+v, want recipe %d", query, results, recipe.ID)
		}
	}

	results, err := repository.SearchRecipes("whisk")
	if err != nil {
		t.Fatalf("SearchRecipes() instruction query: %v", err)
	}
	if len(results) != 0 {
		t.Fatalf("SearchRecipes() instruction query = %+v, want no results", results)
	}
}

func TestRecipeTagsAPICreateAndUpdate(t *testing.T) {
	handler, _ := newTestAPI(t)
	create := httptest.NewRequest(http.MethodPost, "/api/recipes", strings.NewReader(
		`{"name":"Egg Salad","ingredients":["eggs"],"tags":["lunch"," eggs "]}`,
	))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, create)
	if response.Code != http.StatusCreated {
		t.Fatalf("create status = %d, want %d: %s", response.Code, http.StatusCreated, response.Body.String())
	}

	var created Recipe
	if err := json.Unmarshal(response.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode created recipe: %v", err)
	}
	if want := []string{"lunch", "eggs"}; !reflect.DeepEqual(created.Tags, want) {
		t.Fatalf("created API tags = %v, want %v", created.Tags, want)
	}

	update := httptest.NewRequest(http.MethodPut, "/api/recipes/"+strconv.Itoa(created.ID), strings.NewReader(
		`{"name":"Egg Salad","ingredients":["eggs"],"tags":["dinner"]}`,
	))
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, update)
	if response.Code != http.StatusOK {
		t.Fatalf("update status = %d, want %d: %s", response.Code, http.StatusOK, response.Body.String())
	}
	var updated Recipe
	if err := json.Unmarshal(response.Body.Bytes(), &updated); err != nil {
		t.Fatalf("decode updated recipe: %v", err)
	}
	if want := []string{"dinner"}; !reflect.DeepEqual(updated.Tags, want) {
		t.Fatalf("updated API tags = %v, want %v", updated.Tags, want)
	}
}

func TestRecipeTagsMigrateExistingDatabase(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("open legacy database: %v", err)
	}
	_, err = db.Exec(`
CREATE TABLE recipes (
  recipe_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  ingredients TEXT NOT NULL DEFAULT '[]',
  instructions TEXT NOT NULL DEFAULT '[]'
);
INSERT INTO recipes(name, ingredients, instructions)
VALUES ('Legacy Eggs', '["eggs"]', '["Cook"]');`)
	if err != nil {
		db.Close()
		t.Fatalf("create legacy schema: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close legacy database: %v", err)
	}

	repository, err := OpenSQLiteRepository(path)
	if err != nil {
		t.Fatalf("open migrated database: %v", err)
	}
	defer repository.Close()

	recipe, err := repository.GetRecipe(1)
	if err != nil {
		t.Fatalf("GetRecipe() after migration: %v", err)
	}
	if recipe.Tags == nil {
		t.Fatal("migrated tags = nil, want empty slice")
	}
	if len(recipe.Tags) != 0 {
		t.Fatalf("migrated tags = %v, want empty slice", recipe.Tags)
	}

	recipe.Tags = []string{"legacy"}
	if _, err := repository.UpdateRecipe(recipe); err != nil {
		t.Fatalf("UpdateRecipe() after migration: %v", err)
	}
}
