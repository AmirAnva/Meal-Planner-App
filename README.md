# Meal Planner

Meal Planner is a lightweight recipe app with a static frontend and a Go API starter.

## Project structure

- `frontend/` contains the browser app.
- `backend/` contains the Go HTTP API, MVC models, and SQLite repository.

## Run the frontend

Open `frontend/index.html` in a browser.

## Run the backend

```sh
cd backend
go run .
```

The API listens on `:8080`. The SQLite database is created automatically at
`backend/data/recipes.db` when you run the command from the repository root, or
`data/recipes.db` when you run it from `backend/`.

Use `--port` and `--database` to override the local development defaults:

```sh
go run . --port 9000 --database ./data/local.db
```
