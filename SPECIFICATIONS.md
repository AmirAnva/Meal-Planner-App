# Meal Planner — Technical Specifications

## 1. Architecture

The application consists of an HTML/CSS/JavaScript frontend and a Go 1.22 backend. The frontend communicates with the backend through HTTP requests.

## 2. Implemented Features

- Create, view, edit, and delete recipes.
- Search saved recipes by name and ingredient keywords.
- Display recipe ingredients and instructions.
- Plan daily meals by assigning recipes to breakfast, lunch, and dinner.
- Persist recipes and calendar meal assignments between sessions using SQLite storage.

## 3. Backend API

The Go server listens on port `8080` by default.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/recipes` | Retrieve saved recipes (supports optional `?q=` query param) |
| GET | `/api/recipes/search` | Search recipes across names, ingredients, and instructions (`?q=...`) |
| POST | `/api/recipes` | Create a recipe |
| PUT | `/api/recipes/{id}` | Update an existing recipe |
| DELETE | `/api/recipes/{id}` | Delete a recipe |
| GET | `/api/calendar` | Retrieve meals for a date (defaults to today; accepts `?date=YYYY-MM-DD`) |
| POST | `/api/calendar/meals` | Assign a recipe to a meal slot (`breakfast`, `lunch`, mechanical) |
| DELETE | `/api/calendar/meals` | Remove an assigned meal (`?date=YYYY-MM-DD&meal_type=...` or `/api/calendar/{date}/{meal_type}`) |

Recipe creation requires a nonempty name. Invalid JSON is rejected with HTTP 400, and deleting a nonexistent recipe returns HTTP 404. Calendar meal assignment requires a valid meal type (`breakfast`, `lunch`, or `dinner`) and a valid recipe ID.

## 4. Data Model and Storage

Recipes and meal plans are stored in SQLite (`backend/data/recipes.db` by default).

### Recipes

| Field | Type |
|---|---|
| `id` | Integer |
| `name` | String |
| `ingredients` | Array of strings |
| `instructions` | Array of strings |

### Meals

| Field | Type |
|---|---|
| `id` | Integer |
| `day_id` | Integer (Foreign Key -> days) |
| `recipe_id` | Integer (Foreign Key -> recipes) |
| `meal_type` | String (`breakfast`, `lunch`, `dinner`) |
| `recipe` | Recipe object |

## 5. Testing and CI

Go unit tests cover recipe creation, retrieval, searching by name and ingredients, updating, deletion, meal calendar assignment, meal removal, persistence, and input validation, including unusual characters and malformed requests.

Tests run using `go test ./...` from `backend/`. GitHub Actions runs tests on pushes and pull requests to `main`.
