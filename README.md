# Meal Planner

Meal Planner is a lightweight recipe app with a static frontend and a Go API starter.

## Project structure

- `frontend/` contains the browser app.
- `backend/` contains the Go HTTP API and recipe JSON store.

## Run the frontend

Open `frontend/index.html` in a browser.

## Run the backend

```sh
cd backend
go run .
```

The API listens on `:8080`. Recipe data is stored in `backend/data/recipes.json`.
