package main

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGetCalendarDoesNotCreateDays(t *testing.T) {
	handler, databasePath := newTestAPI(t)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/calendar?start=2026-10-29&days=2", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("GET calendar status = %d, want %d", response.Code, http.StatusOK)
	}

	store, err := OpenSQLiteRepository(databasePath)
	if err != nil {
		t.Fatalf("open calendar database: %v", err)
	}
	defer store.Close()
	if _, err := store.GetDay("2026-10-29"); !errors.Is(err, ErrDayNotFound) {
		t.Fatalf("GET calendar created a day, GetDay error = %v", err)
	}
}
