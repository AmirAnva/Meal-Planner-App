package main

import (
	"log"
	"net/http"
	"os"
)

func main() {
	dataPath := os.Getenv("RECIPE_DATA_FILE")
	if dataPath == "" {
		dataPath = "data/recipes.json"
	}
	store, err := NewRecipeStore(dataPath)
	if err != nil {
		log.Fatalf("load recipe book: %v", err)
	}

	addr := os.Getenv("ADDR")
	if addr == "" {
		addr = ":8080"
	}
	log.Printf("API listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, NewAPI(store)))
}
