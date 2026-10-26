# Meal Planner — Technical Specifications

## 1. Architecture

The application consists of an HTML/CSS/JavaScript frontend and a Go 1.22 backend. The frontend communicates with the backend through HTTP requests.

## 2. Implemented Features

- Create, view, and delete recipes.
- Search saved recipes by name.
- Display recipe ingredients and instructions.
- Persist recipes between sessions using JSON storage.

## 3. Backend API

The Go server listens on port `8080` by default.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/recipes` | Retrieve saved recipes |
| POST | `/api/recipes` | Create a recipe |
| DELETE | `/api/recipes/{id}` | Delete a recipe |

Recipe creation requires a nonempty name. Invalid JSON is rejected with HTTP 400, and deleting a nonexistent recipe returns HTTP 404.

## 4. Data Model and Storage

Recipes are stored in `backend/data/recipes.json` by default.

| Field | Type |
|---|---|
| `id` | Integer |
| `name` | String |
| `ingredients` | Array of strings |
| `instructions` | Array of strings |

The backend loads recipes at startup and saves changes to the JSON file.

## 5. Testing and CI

Go unit tests cover recipe creation, retrieval, deletion, persistence, and input validation, including unusual characters and malformed requests.

Tests run using `go test ./...` from `backend/`. GitHub Actions runs tests on pushes and pull requests to `main`.