# Meal Planner — Technical Specifications

## 1. Architecture

- **Frontend:** Modular HTML, CSS, and JavaScript application built with Vite. The development server proxies `/api` requests to the Go backend.
- The frontend retains `meal10`'s controller/view modules and inline controller actions; measurement and shopping calculations stay in DOM-independent helper modules.
- **Backend:** Go 1.22 HTTP API using `http.ServeMux` pattern routing and SQLite through `modernc.org/sqlite`.
- **Persistence:** SQLite at `backend/data/recipes.db`, with foreign-key enforcement and migrations for legacy pantry and recipe data.

## 2. Implemented Features

- Recipe create, view, update, delete, search, and detail views.
- Monthly meal calendar with breakfast, lunch, and dinner slots. Today through the end of next month is editable; past and later dates are read-only. Only the current Sunday-to-Saturday week is highlighted.
- Pantry quantities stored by normalized ingredient, with case-insensitive names. Adding an existing ingredient in the same unit accumulates stock; a different unit is rejected.
- Metric and US customary pantry display, with weight-to-volume conversion only for recognized ingredients.
- Recipe availability indicators and a shopping summary for meals scheduled from today through the end of next month. Recipe ingredient lines remain compatible with the legacy free-text array format; recognized quantity/unit prefixes are also synced to normalized recipe-ingredient records.
- Normalized ingredient and recipe-ingredient storage, a persistent grocery list, and grocery requirement generation from recipe IDs.

## 3. Backend API

The Go server listens on port `8080` by default. Both the original `meal9` routes and the pantry/grocery compatibility routes are supported.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/recipes` | List recipes |
| GET | `/api/recipes/search?q={query}` | Search recipe names, ingredients, or instructions |
| POST | `/api/recipes` | Create a recipe |
| PUT | `/api/recipes/{id}` | Update a recipe |
| DELETE | `/api/recipes/{id}` | Delete a recipe |
| GET / POST | `/api/ingredients` | List or create normalized ingredients |
| DELETE | `/api/ingredients/{id}` | Delete an unused normalized ingredient |
| PUT | `/api/recipes/{id}/ingredients` | Replace normalized recipe ingredients and quantities |
| GET | `/api/pantry-items` | List pantry items |
| POST | `/api/pantry-items` | Add or accumulate pantry stock by ingredient name, quantity, and unit |
| PUT | `/api/pantry-items` | Set a pantry item by `ingredient_id` |
| PUT / DELETE | `/api/pantry-items/{id}` | Update or remove pantry stock by ingredient ID |
| GET / POST | `/api/pantry` | List or add pantry stock (compatibility route) |
| PUT / DELETE | `/api/pantry/{id}` | Update or remove pantry stock by ingredient ID |
| GET / POST | `/api/grocery-list` | List or create grocery items |
| PUT / DELETE | `/api/grocery-list/{id}` | Update or remove a grocery item |
| POST | `/api/grocery-list/generate` | Compare selected recipe requirements with pantry stock; optionally add shortages |
| GET / POST | `/api/grocery` | Compatibility list/create routes |
| DELETE | `/api/grocery/{id}` | Compatibility delete route |
| GET | `/api/calendar?start=YYYY-MM-DD&days=N` | Get assigned meals for a date range (`1`–`31` days) |
| POST | `/api/calendar/meals` | Assign or replace a meal |
| DELETE | `/api/calendar/meals?date=YYYY-MM-DD&meal_type=breakfast` | Remove a meal assignment |

Normalized recipe ingredients use `{"ingredients":[{"ingredient_id":1,"quantity":2,"unit":"cup"}]}`. Grocery generation accepts `{"recipe_ids":[1,2],"add_to_list":true}`. Pantry compatibility routes accept `{"ingredient":"flour","quantity":500,"unit":"g"}` for additions and `{"quantity":500,"unit":"g"}` for updates.

Recipe create/update require a non-empty name. Invalid IDs and JSON are rejected with client errors; missing records return 404. Pantry additions require a positive quantity and supported unit.

## 4. Data Model and Storage

Recipes retain serialized JSON ingredient and instruction arrays for API compatibility. Normalized ingredient associations, pantry quantities, and grocery items are stored separately.

```sql
CREATE TABLE recipes (
  recipe_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  ingredients TEXT NOT NULL DEFAULT '[]',
  instructions TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE ingredients (
  ingredient_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);
CREATE TABLE recipe_ingredients (
  recipe_id INTEGER NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(ingredient_id),
  quantity REAL,
  unit TEXT,
  PRIMARY KEY (recipe_id, ingredient_id)
);
CREATE TABLE pantry_items (
  ingredient_id INTEGER PRIMARY KEY REFERENCES ingredients(ingredient_id),
  quantity REAL NOT NULL DEFAULT 0,
  unit TEXT
);
CREATE TABLE grocery_items (
  grocery_item_id INTEGER PRIMARY KEY,
  ingredient_id INTEGER REFERENCES ingredients(ingredient_id),
  name TEXT,
  quantity REAL,
  unit TEXT,
  purchased INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE days (
  day_id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE
);
CREATE TABLE meals (
  meal_id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_id INTEGER NOT NULL REFERENCES days(day_id) ON DELETE CASCADE,
  recipe_id INTEGER NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner')),
  UNIQUE(day_id, meal_type)
);
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY
);
```

On startup, legacy pantry tables keyed by ingredient text are migrated to normalized ingredient IDs while retaining quantities and units. Legacy recipe ingredient arrays are imported into `recipe_ingredients` once without overwriting existing normalized associations. A follow-up migration parses legacy quantity/unit prefixes only when normalized associations still contain unstructured legacy names. Deleting a recipe cascades to its calendar assignments and normalized recipe-ingredient rows.

## 5. Testing

- Backend: `cd backend` then `go test ./...`
- Frontend tests: `cd frontend` then `npm test`
- Frontend production build: `cd frontend` then `npm run build`
