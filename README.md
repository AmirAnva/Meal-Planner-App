# Meal Planner

Meal Planner is a lightweight recipe app with a static frontend and a Go API backend.

## Prerequisites

- [Go 1.22+](https://go.dev/dl/) — required to run the backend
- A modern web browser — required to run the frontend

## Project Structure

- `frontend/` — browser app (HTML, CSS, JavaScript)
- `backend/` — Go HTTP API and JSON recipe store

## Setup & Running

### 1. Start the backend first

```sh
cd backend
go run .
```

The API listens on `http://localhost:8080`. Recipe data is stored in `backend/data/recipes.json`.

> **Note:** The backend must be running before you open the frontend, or recipes will not load.

### 2. Open the frontend

Open `frontend/index.html` in your browser.

## Run the tests

```sh
cd backend
go test ./...
```

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/recipes` | List all recipes |
| POST | `/api/recipes` | Create a recipe |
| PUT | `/api/recipes/{id}` | Update a recipe |
| DELETE | `/api/recipes/{id}` | Delete a recipe |
