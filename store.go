package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
)

var ErrRecipeNotFound = errors.New("recipe not found")

type RecipeStore struct {
	mu   sync.RWMutex
	path string
	book RecipeBook
}

func NewRecipeStore(path string) (*RecipeStore, error) {
	store := &RecipeStore{path: path, book: RecipeBook{Recipes: []Recipe{}}}
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return store, nil
		}
		return nil, err
	}

	if err := json.Unmarshal(data, &store.book); err != nil {
		return nil, err
	}
	if store.book.Recipes == nil {
		store.book.Recipes = []Recipe{}
	}
	return store, nil
}

func (s *RecipeStore) List() []Recipe {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return append([]Recipe{}, s.book.Recipes...)
}

func (s *RecipeStore) Create(recipe Recipe) (Recipe, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if recipe.Tags == nil {
		recipe.Tags = []string{}
	}
	if recipe.Ingredients == nil {
		recipe.Ingredients = []string{}
	}
	if recipe.Instructions == nil {
		recipe.Instructions = []string{}
	}

	maxID := 0
	for _, existing := range s.book.Recipes {
		if existing.ID > maxID {
			maxID = existing.ID
		}
	}
	recipe.ID = maxID + 1

	updated := RecipeBook{Recipes: append(append([]Recipe{}, s.book.Recipes...), recipe)}
	if err := s.save(updated); err != nil {
		return Recipe{}, err
	}
	s.book = updated
	return recipe, nil
}

func (s *RecipeStore) Delete(id int) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	updatedRecipes := make([]Recipe, 0, len(s.book.Recipes))
	found := false
	for _, recipe := range s.book.Recipes {
		if recipe.ID == id {
			found = true
			continue
		}
		updatedRecipes = append(updatedRecipes, recipe)
	}
	if !found {
		return ErrRecipeNotFound
	}

	updated := RecipeBook{Recipes: updatedRecipes}
	if err := s.save(updated); err != nil {
		return err
	}
	s.book = updated
	return nil
}

func (s *RecipeStore) save(book RecipeBook) error {
	dir := filepath.Dir(s.path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}

	file, err := os.CreateTemp(dir, ".recipes-*.tmp")
	if err != nil {
		return err
	}
	tempPath := file.Name()
	defer os.Remove(tempPath)

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(book); err != nil {
		file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	return os.Rename(tempPath, s.path)
}
