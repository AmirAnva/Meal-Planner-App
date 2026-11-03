package main

import (
	"errors"
	"testing"
)

func TestRecipeValidate(t *testing.T) {
	tests := []struct {
		name       string
		recipeName string
		wantErr    error
	}{
		{name: "empty", recipeName: "", wantErr: ErrRecipeNameRequired},
		{name: "whitespace", recipeName: " \t\n", wantErr: ErrRecipeNameRequired},
		{name: "valid", recipeName: "Egg Bowl"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := (Recipe{Name: test.recipeName}).Validate()
			if test.wantErr != nil {
				if !errors.Is(err, test.wantErr) {
					t.Fatalf("Validate() error = %v, want %v", err, test.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("Validate() error = %v, want nil", err)
			}
		})
	}
}

func TestDayValidate(t *testing.T) {
	tests := []struct {
		name string
		date string
		want bool
	}{
		{name: "empty", date: "", want: false},
		{name: "whitespace", date: "  \t", want: false},
		{name: "date value", date: "2026-11-03", want: true},
		{name: "nonempty value", date: "not-a-date", want: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := (Day{Date: test.date}).Validate()
			if got := err == nil; got != test.want {
				t.Fatalf("Validate() success = %v, want %v; error = %v", got, test.want, err)
			}
		})
	}
}

func TestMealTypeValid(t *testing.T) {
	tests := []struct {
		mealType MealType
		want     bool
	}{
		{Breakfast, true},
		{Lunch, true},
		{Dinner, true},
		{"", false},
		{"snack", false},
		{"BREAKFAST", false},
	}

	for _, test := range tests {
		if got := test.mealType.Valid(); got != test.want {
			t.Errorf("MealType(%q).Valid() = %v, want %v", test.mealType, got, test.want)
		}
	}
}

func TestMealValidate(t *testing.T) {
	tests := []struct {
		name     string
		mealType MealType
		wantErr  string
	}{
		{name: "breakfast", mealType: Breakfast},
		{name: "lunch", mealType: Lunch},
		{name: "dinner", mealType: Dinner},
		{name: "invalid", mealType: "snack", wantErr: "meal type must be breakfast, lunch, or dinner"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := (Meal{MealType: test.mealType}).Validate()
			if test.wantErr == "" {
				if err != nil {
					t.Fatalf("Validate() error = %v, want nil", err)
				}
				return
			}
			if err == nil || err.Error() != test.wantErr {
				t.Fatalf("Validate() error = %v, want %q", err, test.wantErr)
			}
		})
	}
}
