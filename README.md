# Meal Planner

Meal Planner is a lightweight recipe app with a static frontend and a Go API starter.

## Project structure

- `frontend/` contains the browser app.
- `backend/` contains the Go HTTP API starter.

## Run the frontend

Open `frontend/index.html` in a browser.

## Run the backend

```sh
cd backend
go run ./cmd/server
```

The API listens on `:8080`. Check `GET /health` for a JSON health response.
