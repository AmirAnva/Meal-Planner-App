package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

var ErrRecipeNotFound = errors.New("recipe not found")
var ErrInvalidRecipe = errors.New("name is required")

type RecipeStore struct {
	mu   sync.RWMutex
	path string
	book recipeBook
}

func NewRecipeStore(path string) (*RecipeStore, error) {
	store := &RecipeStore{path: path, book: recipeBook{recipes: []recipe{}}}
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
	if store.book.recipes == nil {
		store.book.recipes = []recipe{}
	}
	return store, nil
}

func (s *RecipeStore) List() []recipe {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return append([]recipe{}, s.book.recipes...)
}

func (s *RecipeStore) Create(entry recipe) (recipe, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if strings.TrimSpace(entry.name) == "" {
		return recipe{}, ErrInvalidRecipe
	}
	if entry.ingredients == nil {
		entry.ingredients = []string{}
	}
	if entry.instructions == nil {
		entry.instructions = []string{}
	}

	maxID := 0
	for _, existing := range s.book.recipes {
		if existing.id > maxID {
			maxID = existing.id
		}
	}
	entry.id = maxID + 1

	updated := recipeBook{recipes: append(append([]recipe{}, s.book.recipes...), entry)}
	if err := s.save(updated); err != nil {
		return recipe{}, err
	}
	s.book = updated
	return entry, nil
}

func (s *RecipeStore) Update(id int, entry recipe) (recipe, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if strings.TrimSpace(entry.name) == "" {
		return recipe{}, ErrInvalidRecipe
	}
	if entry.ingredients == nil {
		entry.ingredients = []string{}
	}
	if entry.instructions == nil {
		entry.instructions = []string{}
	}

	updatedRecipes := make([]recipe, len(s.book.recipes))
	found := false
	for i, existing := range s.book.recipes {
		if existing.id == id {
			entry.id = id
			updatedRecipes[i] = entry
			found = true
		} else {
			updatedRecipes[i] = existing
		}
	}
	if !found {
		return recipe{}, ErrRecipeNotFound
	}

	updated := recipeBook{recipes: updatedRecipes}
	if err := s.save(updated); err != nil {
		return recipe{}, err
	}
	s.book = updated
	return entry, nil
}

func (s *RecipeStore) Delete(id int) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	updatedRecipes := make([]recipe, 0, len(s.book.recipes))
	found := false
	for _, recipe := range s.book.recipes {
		if recipe.id == id {
			found = true
			continue
		}
		updatedRecipes = append(updatedRecipes, recipe)
	}
	if !found {
		return ErrRecipeNotFound
	}

	updated := recipeBook{recipes: updatedRecipes}
	if err := s.save(updated); err != nil {
		return err
	}
	s.book = updated
	return nil
}

func (s *RecipeStore) save(book recipeBook) error {
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
