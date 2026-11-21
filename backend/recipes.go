package main

import (
	"bytes"
	"encoding/json"
)

type recipe struct {
	id           int
	name         string
	ingredients  []string
	instructions []string
}

type recipeBook struct {
	recipes []recipe
}

type recipeJSON struct {
	ID           int      `json:"id"`
	Name         string   `json:"name"`
	Ingredients  []string `json:"ingredients"`
	Instructions []string `json:"instructions"`
}

func (r recipe) MarshalJSON() ([]byte, error) {
	return json.Marshal(recipeJSON{
		ID:           r.id,
		Name:         r.name,
		Ingredients:  r.ingredients,
		Instructions: r.instructions,
	})
}

func (r *recipe) UnmarshalJSON(data []byte) error {
	var value recipeJSON
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&value); err != nil {
		return err
	}
	*r = recipe{
		id:           value.ID,
		name:         value.Name,
		ingredients:  value.Ingredients,
		instructions: value.Instructions,
	}
	return nil
}

func (book recipeBook) MarshalJSON() ([]byte, error) {
	return json.Marshal(struct {
		Recipes []recipe `json:"recipes"`
	}{Recipes: book.recipes})
}

func (book *recipeBook) UnmarshalJSON(data []byte) error {
	var stored struct {
		Recipes []recipe `json:"recipes"`
	}
	if err := json.Unmarshal(data, &stored); err != nil {
		return err
	}
	book.recipes = stored.Recipes
	return nil
}
