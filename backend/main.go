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
	flag.Parse()
	store, err := OpenSQLiteRepository(*database)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer store.Close()

	addr := ":" + strconv.Itoa(*port)
	log.Printf("API listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, NewAPI(store)))
}
