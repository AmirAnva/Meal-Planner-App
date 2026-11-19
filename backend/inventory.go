package main

import (
	"database/sql"
	"errors"
	"strings"
)

func (r *SQLiteRepository) syncRecipeIngredients(recipeID int, names []string) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, name := range names {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		if _, err = tx.Exec(`INSERT INTO ingredients(name) VALUES (?) ON CONFLICT(name) DO NOTHING`, name); err != nil {
			return err
		}
		if _, err = tx.Exec(`INSERT INTO recipe_ingredients(recipe_id, ingredient_id) SELECT ?, ingredient_id FROM ingredients WHERE name=? ON CONFLICT(recipe_id, ingredient_id) DO NOTHING`, recipeID, name); err != nil {
			return err
		}
	}
	// Remove associations that were removed from the legacy Recipe payload.
	rows, err := tx.Query(`SELECT ri.ingredient_id, i.name FROM recipe_ingredients ri JOIN ingredients i USING(ingredient_id) WHERE ri.recipe_id=?`, recipeID)
	if err != nil {
		return err
	}
	type assoc struct {
		id   int
		name string
	}
	var all []assoc
	for rows.Next() {
		var a assoc
		if err := rows.Scan(&a.id, &a.name); err != nil {
			rows.Close()
			return err
		}
		all = append(all, a)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	keep := map[string]bool{}
	for _, n := range names {
		keep[strings.ToLower(strings.TrimSpace(n))] = true
	}
	for _, a := range all {
		if !keep[strings.ToLower(a.name)] {
			if _, err = tx.Exec(`DELETE FROM recipe_ingredients WHERE recipe_id=? AND ingredient_id=?`, recipeID, a.id); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

func (r *SQLiteRepository) CreateIngredient(v Ingredient) (Ingredient, error) {
	v.Name = strings.TrimSpace(v.Name)
	if v.Name == "" {
		return Ingredient{}, errors.New("ingredient name is required")
	}
	e := r.db.QueryRow(`INSERT INTO ingredients(name) VALUES (?) RETURNING ingredient_id`, v.Name).Scan(&v.ID)
	return v, e
}
func (r *SQLiteRepository) GetIngredient(id int) (Ingredient, error) {
	var v Ingredient
	e := r.db.QueryRow(`SELECT ingredient_id,name FROM ingredients WHERE ingredient_id=?`, id).Scan(&v.ID, &v.Name)
	return v, e
}
func (r *SQLiteRepository) ListIngredients() ([]Ingredient, error) {
	rows, e := r.db.Query(`SELECT ingredient_id,name FROM ingredients ORDER BY name COLLATE NOCASE`)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []Ingredient{}
	for rows.Next() {
		var v Ingredient
		if e = rows.Scan(&v.ID, &v.Name); e != nil {
			return nil, e
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
func (r *SQLiteRepository) UpdateIngredient(v Ingredient) (Ingredient, error) {
	v.Name = strings.TrimSpace(v.Name)
	if v.Name == "" {
		return Ingredient{}, errors.New("ingredient name is required")
	}
	res, e := r.db.Exec(`UPDATE ingredients SET name=? WHERE ingredient_id=?`, v.Name, v.ID)
	if e != nil {
		return Ingredient{}, e
	}
	n, e := res.RowsAffected()
	if e == nil && n == 0 {
		e = sql.ErrNoRows
	}
	return v, e
}
func (r *SQLiteRepository) DeleteIngredient(id int) error {
	_, e := r.db.Exec(`DELETE FROM ingredients WHERE ingredient_id=?`, id)
	return e
}

func (r *SQLiteRepository) SetRecipeIngredients(recipeID int, items []RecipeIngredient) error {
	tx, e := r.db.Begin()
	if e != nil {
		return e
	}
	defer tx.Rollback()
	if _, e = tx.Exec(`DELETE FROM recipe_ingredients WHERE recipe_id=?`, recipeID); e != nil {
		return e
	}
	for _, v := range items {
		if _, e = tx.Exec(`INSERT INTO recipe_ingredients(recipe_id,ingredient_id,quantity,unit) VALUES(?,?,?,?)`, recipeID, v.IngredientID, v.Quantity, v.Unit); e != nil {
			return e
		}
	}
	return tx.Commit()
}
func (r *SQLiteRepository) ListRecipeIngredients(recipeID int) ([]RecipeIngredient, error) {
	rows, e := r.db.Query(`SELECT ri.recipe_id,ri.ingredient_id,i.name,ri.quantity,ri.unit FROM recipe_ingredients ri JOIN ingredients i USING(ingredient_id) WHERE ri.recipe_id=? ORDER BY i.name COLLATE NOCASE`, recipeID)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []RecipeIngredient{}
	for rows.Next() {
		var v RecipeIngredient
		var q sql.NullFloat64
		var u sql.NullString
		if e = rows.Scan(&v.RecipeID, &v.IngredientID, &v.Ingredient.Name, &q, &u); e != nil {
			return nil, e
		}
		v.Ingredient.ID = v.IngredientID
		if q.Valid {
			v.Quantity = &q.Float64
		}
		if u.Valid {
			v.Unit = &u.String
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

func (r *SQLiteRepository) PutPantryItem(v PantryItem) error {
	_, e := r.db.Exec(`INSERT INTO pantry_items(ingredient_id,quantity,unit) VALUES(?,?,?) ON CONFLICT(ingredient_id) DO UPDATE SET quantity=excluded.quantity,unit=excluded.unit`, v.IngredientID, v.Quantity, v.Unit)
	return e
}
func (r *SQLiteRepository) ListPantryItems() ([]PantryItem, error) {
	rows, e := r.db.Query(`SELECT p.ingredient_id,i.name,p.quantity,p.unit FROM pantry_items p JOIN ingredients i USING(ingredient_id) ORDER BY i.name COLLATE NOCASE`)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []PantryItem{}
	for rows.Next() {
		var v PantryItem
		var u sql.NullString
		if e = rows.Scan(&v.IngredientID, &v.Ingredient.Name, &v.Quantity, &u); e != nil {
			return nil, e
		}
		v.Ingredient.ID = v.IngredientID
		if u.Valid {
			v.Unit = &u.String
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
func (r *SQLiteRepository) DeletePantryItem(id int) error {
	_, e := r.db.Exec(`DELETE FROM pantry_items WHERE ingredient_id=?`, id)
	return e
}

func (r *SQLiteRepository) CreateGroceryItem(v GroceryItem) (GroceryItem, error) {
	res, e := r.db.Exec(`INSERT INTO grocery_items(ingredient_id,name,quantity,unit,purchased) VALUES(?,?,?,?,?)`, v.IngredientID, v.Name, v.Quantity, v.Unit, v.Purchased)
	if e != nil {
		return GroceryItem{}, e
	}
	id, e := res.LastInsertId()
	v.ID = int(id)
	return v, e
}
func (r *SQLiteRepository) ListGroceryItems() ([]GroceryItem, error) {
	rows, e := r.db.Query(`SELECT grocery_item_id,ingredient_id,name,quantity,unit,purchased FROM grocery_items ORDER BY grocery_item_id`)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []GroceryItem{}
	for rows.Next() {
		var v GroceryItem
		var iid sql.NullInt64
		var name, unit sql.NullString
		var q sql.NullFloat64
		var p int
		if e = rows.Scan(&v.ID, &iid, &name, &q, &unit, &p); e != nil {
			return nil, e
		}
		if iid.Valid {
			x := int(iid.Int64)
			v.IngredientID = &x
		}
		if name.Valid {
			v.Name = &name.String
		}
		if q.Valid {
			v.Quantity = &q.Float64
		}
		if unit.Valid {
			v.Unit = &unit.String
		}
		v.Purchased = p != 0
		out = append(out, v)
	}
	return out, rows.Err()
}
func (r *SQLiteRepository) UpdateGroceryItem(v GroceryItem) error {
	res, e := r.db.Exec(`UPDATE grocery_items SET ingredient_id=?,name=?,quantity=?,unit=?,purchased=? WHERE grocery_item_id=?`, v.IngredientID, v.Name, v.Quantity, v.Unit, v.Purchased, v.ID)
	if e != nil {
		return e
	}
	n, e := res.RowsAffected()
	if e == nil && n == 0 {
		e = sql.ErrNoRows
	}
	return e
}
func (r *SQLiteRepository) DeleteGroceryItem(id int) error {
	_, e := r.db.Exec(`DELETE FROM grocery_items WHERE grocery_item_id=?`, id)
	return e
}
