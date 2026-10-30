# Meal Planner

Meal Planner is a lightweight recipe app with a static frontend and a Go API backend.

## Prerequisites

- [Go 1.22+](https://go.dev/dl/) to run the backend
- A modern web browser to run the frontend

## Project structure

- `frontend/` contains the browser app (HTML, CSS, and JavaScript).
- `backend/` contains the Go HTTP API, MVC models, and SQLite repository.
- `REQUIREMENTS.md` contains the MVP requirements and technical specification.

## Run the backend

```sh
cd backend
go run .
```

The API listens on `http://localhost:8080`. SQLite creates its database
automatically at `data/recipes.db` relative to the backend working directory.
Override the local defaults with `--port` and `--database`:

```sh
go run . --port 9000 --database ./data/local.db
```

## Run the frontend

Start the backend first, then open `frontend/index.html` in a browser.

## Run the backend tests

```sh
cd backend
go test ./...
```

## API endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/recipes` | List all recipes |
| POST | `/api/recipes` | Create a recipe |
| PUT | `/api/recipes/{id}` | Update a recipe |
| DELETE | `/api/recipes/{id}` | Delete a recipe |
