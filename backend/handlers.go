package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func TestPantryAPILifecycleAndPersistence(t *testing.T) {
	handler, databasePath := newTestAPI(t)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/pantry", nil))
	if response.Code != http.StatusOK || strings.TrimSpace(response.Body.String()) != "[]" {
		t.Fatalf("initial GET pantry = (%d, %s), want (200, [])", response.Code, response.Body.String())
	}

	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/pantry", strings.NewReader(`{"ingredient":"  Olive Oil  ","quantity":1.5,"unit":"l"}`)))
	if response.Code != http.StatusCreated {
		t.Fatalf("POST pantry status = %d, want %d: %s", response.Code, http.StatusCreated, response.Body.String())
	}
	var created PantryItem
	if err := json.Unmarshal(response.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode created pantry item: %v", err)
	}
	if created.ID < 1 || created.Ingredient != "Olive Oil" || created.Quantity != 1.5 || created.Unit != "l" {
		t.Fatalf("created pantry item = %+v, want trimmed Olive Oil with quantity 1.5 l", created)
	}

	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/pantry", strings.NewReader(`{"ingredient":"olive oil","quantity":1,"unit":"l"}`)))
	if response.Code != http.StatusConflict {
		t.Fatalf("duplicate POST status = %d, want %d", response.Code, http.StatusConflict)
	}

	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPut, "/api/pantry/1", strings.NewReader(`{"quantity":750,"unit":"ml"}`)))
	if response.Code != http.StatusOK {
		t.Fatalf("PUT pantry status = %d, want %d: %s", response.Code, http.StatusOK, response.Body.String())
	}
	if err := json.Unmarshal(response.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode updated pantry item: %v", err)
	}
	if created.Ingredient != "Olive Oil" || created.Quantity != 750 || created.Unit != "ml" {
		t.Fatalf("updated pantry item = %+v, want Olive Oil with quantity 750 ml", created)
	}

	reloaded, err := OpenSQLiteRepository(databasePath)
	if err != nil {
		t.Fatalf("reopen pantry database: %v", err)
	}
	defer reloaded.Close()
	items, err := reloaded.ListPantryItems()
	if err != nil {
		t.Fatalf("list persisted pantry items: %v", err)
	}
	if len(items) != 1 || items[0] != created {
		t.Fatalf("persisted pantry items = %+v, want [%+v]", items, created)
	}
}

func TestPantryAPIValidatesAndRemovesItems(t *testing.T) {
	handler, _ := newTestAPI(t)
	tests := []struct {
		name string
		body string
		want int
	}{
		{name: "missing ingredient", body: `{}`, want: http.StatusBadRequest},
		{name: "blank ingredient", body: `{"ingredient":"  "}`, want: http.StatusBadRequest},
		{name: "missing quantity", body: `{"ingredient":"Rice"}`, want: http.StatusBadRequest},
		{name: "non-positive quantity", body: `{"ingredient":"Rice","quantity":0,"unit":"g"}`, want: http.StatusBadRequest},
		{name: "unsupported unit", body: `{"ingredient":"Rice","quantity":1,"unit":"bucket"}`, want: http.StatusBadRequest},
		{name: "malformed JSON", body: `{"ingredient":`, want: http.StatusBadRequest},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/pantry", strings.NewReader(test.body)))
			if response.Code != test.want {
				t.Fatalf("POST pantry status = %d, want %d: %s", response.Code, test.want, response.Body.String())
			}
		})
	}

	createResponse := httptest.NewRecorder()
	handler.ServeHTTP(createResponse, httptest.NewRequest(http.MethodPost, "/api/pantry", strings.NewReader(`{"ingredient":"Tomatoes","quantity":3,"unit":"piece"}`)))
	var item PantryItem
	if err := json.Unmarshal(createResponse.Body.Bytes(), &item); err != nil {
		t.Fatalf("decode created pantry item: %v", err)
	}
	deleteResponse := httptest.NewRecorder()
	handler.ServeHTTP(deleteResponse, httptest.NewRequest(http.MethodDelete, "/api/pantry/"+strconv.Itoa(item.ID), nil))
	if deleteResponse.Code != http.StatusNoContent {
		t.Fatalf("DELETE pantry item status = %d, want %d", deleteResponse.Code, http.StatusNoContent)
	}
	deleteResponse = httptest.NewRecorder()
	handler.ServeHTTP(deleteResponse, httptest.NewRequest(http.MethodDelete, "/api/pantry/"+strconv.Itoa(item.ID), nil))
	if deleteResponse.Code != http.StatusNotFound {
		t.Fatalf("DELETE missing pantry item status = %d, want %d", deleteResponse.Code, http.StatusNotFound)
	}
}

func TestPantrySchemaMigrationPreservesExistingItems(t *testing.T) {
	databasePath := filepath.Join(t.TempDir(), "legacy.db")
	legacyDB, err := sql.Open("sqlite", databasePath)
	if err != nil {
		t.Fatalf("open legacy database: %v", err)
	}

	if _, err := legacyDB.Exec(`CREATE TABLE pantry_items (
		pantry_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
		ingredient TEXT NOT NULL COLLATE NOCASE UNIQUE
	); INSERT INTO pantry_items(ingredient) VALUES ('Flour')`); err != nil {
		legacyDB.Close()
		t.Fatalf("create legacy pantry table: %v", err)
	}
	if err := legacyDB.Close(); err != nil {
		t.Fatalf("close legacy database: %v", err)
	}

	repository, err := OpenSQLiteRepository(databasePath)
	if err != nil {
		t.Fatalf("open migrated database: %v", err)
	}
	defer repository.Close()
	items, err := repository.ListPantryItems()
	if err != nil {
		t.Fatalf("list migrated pantry items: %v", err)
	}
	want := PantryItem{ID: 1, Ingredient: "Flour"}
	if len(items) != 1 || items[0] != want {
		t.Fatalf("migrated pantry items = %+v, want [%+v]", items, want)
	}
}

func TestPantryQuantityAcceptsCommonCookingUnits(t *testing.T) {
	for _, unit := range []string{"g", "cup", "fl oz", "piece", "clove", "pinch", "handful"} {
		if err := (PantryQuantity{Quantity: 1, Unit: unit}).Validate(); err != nil {
			t.Errorf("PantryQuantity unit %q validation error = %v", unit, err)
		}
	}
}
