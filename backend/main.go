package main

import (
	"flag"
	"log"
	"net/http"
	"strconv"
)

func main() {
	port := flag.Int("port", 8080, "HTTP server port")
	database := flag.String("database", "data/recipes.db", "SQLite database file path")
	ollamaHost := flag.String("ollama-host", "", "Ollama host URL (defaults to OLLAMA_HOST or http://localhost:11434)")
	ollamaModel := flag.String("ollama-model", "", "Ollama model name (defaults to OLLAMA_MODEL or qwen2.5:1.5b)")
	flag.Parse()

	store, err := OpenSQLiteRepository(*database)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer store.Close()

	importer := NewOllamaImporter(*ollamaHost, *ollamaModel, nil)
	log.Printf("Configured recipe parser with Ollama at %s (model: %s)", importer.OllamaURL, importer.Model)

	addr := ":" + strconv.Itoa(*port)
	log.Printf("API listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, NewAPIWithImporter(store, importer)))
}
