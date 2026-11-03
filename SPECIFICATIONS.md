# Meal Planner — Technical Specifications

## 1. Architecture

The application uses a decoupled client-server architecture:
- **Frontend:** Modular HTML/CSS/JavaScript application served and bundled via [Vite](https://vitejs.dev/). In development, Vite provides Hot Module Replacement (HMR) and automatically proxies `/api` requests to the backend server.
- **Backend:** Go 1.22 HTTP API utilizing Go's standard library `http.ServeMux` with pattern-based routing and a pure-Go SQLite repository (`modernc.org/sqlite`).

## 2. Implemented Features

- **Recipe CRUD:** Create, view, update (`PUT`), and delete recipes.
- **Search & Filtering:** Search recipes by title or ingredients in real time with client-side race-condition avoidance.
- **Recipe Details:** Modal view displaying full ingredients list and step-by-step instructions.
- **Daily Meal Planning:** Assign recipes to `breakfast`, `lunch`, or `dinner` slots for any day, view assigned meals, and remove assignments.
- **Persistent Storage:** SQLite database with foreign keys and cascade deletions.

## 3. Backend API

The Go server listens on port `8080` by default.

| Method | Endpoint | Request Body | Response Codes | Description |
|---|---|---|---|---|
| GET | `/api/recipes` | None | 200, 500 | List all saved recipes |
| GET | `/api/recipes/search?q={query}` | None | 200, 500 | Search recipes matching query |
| POST | `/api/recipes` | `{"name": "...", "ingredients": [...], "instructions": [...]}` | 201, 400, 500 | Create a recipe (name required) |
| PUT | `/api/recipes/{id}` | `{"name": "...", "ingredients": [...], "instructions": [...]}` | 200, 400, 404, 500 | Update an existing recipe |
| DELETE | `/api/recipes/{id}` | None | 204, 400, 404, 500 | Delete a recipe |
| GET | `/api/calendar?start=YYYY-MM-DD&days=N` | None | 200, 400, 500 | Get dates and assigned meals |
| POST | `/api/calendar/meals` | `{"date": "YYYY-MM-DD", "meal_type": "...", "recipe_id": N}` | 200, 400, 404, 500 | Assign or replace a meal |
| DELETE | `/api/calendar/meals?date=YYYY-MM-DD&meal_type=...` | None | 204, 400, 404, 500 | Remove a meal assignment |

Recipe creation and update require a non-empty name. Invalid JSON is rejected with HTTP 400, and non-existent IDs return HTTP 404.

## 4. Data Model and Storage

Data is persisted in SQLite at `backend/data/recipes.db` with `PRAGMA foreign_keys = ON`.

### Schema

```sql
CREATE TABLE IF NOT EXISTS recipes (
  recipe_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  ingredients TEXT NOT NULL DEFAULT '[]',
  instructions TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS days (
  day_id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS meals (
  meal_id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_id INTEGER NOT NULL REFERENCES days(day_id) ON DELETE CASCADE,
  recipe_id INTEGER NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner')),
  UNIQUE(day_id, meal_type)
);
```

- When a recipe is deleted, cascading constraints remove any associated calendar meal assignments.
- Ingredients and instructions are stored as serialized JSON arrays within SQLite text columns.

## 5. Testing and CI

- **Backend:** Go unit and integration tests cover recipe creation, retrieval, updates, deletions, calendar meal assignments, SQLite constraints, and error handling. Run via `go test ./...` in `backend/`.
- **Frontend:** Build validation runs via `npm run build` in `frontend/`.
- **CI:** GitHub Actions automatically tests the backend on pushes and pull requests to `main`.
