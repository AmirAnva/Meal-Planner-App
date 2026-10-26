// This file contains tests for the JSON serialization and deserialization of the recipeBook struct.
package main

import (
	"encoding/json"
	"reflect"
	"testing"
)

// TestRecipeBookJSONRoundTrip tests that a recipeBook can be marshaled to JSON and then unmarshaled back to the same struct.
func TestRecipeBookJSONRoundTrip(t *testing.T) {
	want := recipeBook{
		recipes: []recipe{
			{
				id:           7,
				name:         "Vegetable Curry",
				ingredients:  []string{"potato", "carrot", "coconut milk"},
				instructions: []string{"Chop the vegetables", "Simmer until tender"},
			},
			{
				id:           12,
				name:         "Fruit Salad",
				ingredients:  []string{"apple", "orange"},
				instructions: []string{"Slice the fruit", "Toss together"},
			},
		},
	}

	data, err := json.Marshal(want)
	if err != nil {
		t.Fatalf("marshal recipe book: %v", err)
	}

	var got recipeBook
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("unmarshal recipe book: %v", err)
	}

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("round-trip recipe book = %+v, want %+v", got, want)
	}
}
