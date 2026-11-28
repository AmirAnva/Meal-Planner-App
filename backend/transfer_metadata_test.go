package main

import "testing"

func TestTransferConvertsAndCannotRepeat(t *testing.T) {
	r, e := OpenSQLiteRepository(":memory:")
	if e != nil {
		t.Fatal(e)
	}
	defer r.db.Close()
	i, e := r.CreateIngredient(Ingredient{Name: "Flour"})
	if e != nil {
		t.Fatal(e)
	}
	g, kg := "g", "kg"
	q := 1.0
	if e = r.PutPantryItem(PantryItem{IngredientID: i.ID, Quantity: 500, Unit: &g}); e != nil {
		t.Fatal(e)
	}
	item, e := r.CreateGroceryItem(GroceryItem{IngredientID: &i.ID, Quantity: &q, Unit: &kg, Purchased: true})
	if e != nil {
		t.Fatal(e)
	}
	if e = r.MovePurchasedGrocery(item.ID); e != nil {
		t.Fatal(e)
	}
	if e = r.MovePurchasedGrocery(item.ID); e == nil {
		t.Fatal("repeat transfer succeeded")
	}
	stock, e := r.ListPantryItems()
	if e != nil || len(stock) != 1 || stock[0].Quantity != 1500 {
		t.Fatalf("stock=%+v err=%v", stock, e)
	}
}
func TestRecipeLabelsPersist(t *testing.T) {
	r, e := OpenSQLiteRepository(":memory:")
	if e != nil {
		t.Fatal(e)
	}
	defer r.db.Close()
	v, e := r.CreateRecipe(Recipe{Name: "Soup", Category: "Dinner", Tags: "Quick", Dietary: "Vegan"})
	if e != nil {
		t.Fatal(e)
	}
	v, e = r.GetRecipe(v.ID)
	if e != nil || v.Category != "Dinner" || v.Tags != "Quick" || v.Dietary != "Vegan" {
		t.Fatalf("recipe=%+v err=%v", v, e)
	}
}
