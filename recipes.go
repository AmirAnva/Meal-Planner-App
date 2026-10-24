package main

// Recipe is a recipe shown by the frontend and stored by the API.
type Recipe struct {
	ID           int      `json:"id"`
	Name         string   `json:"name"`
	Image        string   `json:"image,omitempty"`
	Emoji        string   `json:"emoji,omitempty"`
	Source       string   `json:"source"`
	Tags         []string `json:"tags"`
	Ingredients  []string `json:"ingredients,omitempty"`
	Instructions []string `json:"instructions,omitempty"`
}

// RecipeBook is the complete recipe collection persisted as JSON.
type RecipeBook struct {
	Recipes []Recipe `json:"recipes"`
}
