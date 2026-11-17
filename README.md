# Meal Planner

Meal Planner is a lightweight recipe and meal scheduling app with a modern JavaScript frontend powered by Vite and a Go API backend with SQLite persistence. Recipe ingredients are entered one per row with an optional quantity and unit. Recipe cards are color-coded against pantry stock: green when ingredients appear sufficient, red when ingredients are missing, and orange when quantities are insufficient or need checking. The calendar also summarizes missing or insufficient ingredients for meals scheduled over the next seven days.

## Prerequisites

- [Go 1.22+](https://go.dev/dl/) to run the backend
- [Node.js 18+](https://nodejs.org/) & npm to run the frontend

## Project structure

- `frontend/` contains the browser application (HTML, Vite configuration, and `src/` for CSS & JavaScript).
- `backend/` contains the Go HTTP API, SQLite repository, and unit/integration tests.
- `REQUIREMENTS.md` contains the MVP requirements and functional scope.
- `SPECIFICATIONS.md` contains the technical specification and data models.

## Run the backend

```sh
cd backend
go run .
```

The API listens on `http://localhost:8080`. SQLite automatically creates and initializes its database at `data/recipes.db` relative to the backend working directory.

Override the local defaults with `--port` and `--database`:

```sh
go run . --port 9000 --database ./data/local.db
```

## Run the frontend

```sh
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173/` in your browser. The development server binds to IPv4 and will fail instead of silently switching ports if port 5173 is already in use. The calendar displays a navigable month, with editing enabled only for the next seven days, including today. All `/api` requests are automatically proxied to the Go backend (`http://localhost:8080`).

The local development servers use HTTP, not HTTPS. If Firefox upgrades this address to HTTPS, turn off HTTPS-Only Mode for this local site or choose the option to continue to HTTP.

To create an optimized production build:

```sh
cd frontend
npm run build
```

## Run tests

### Backend tests
```sh
cd backend
go test ./...
```

### Frontend build verification
```sh
cd frontend
npm run build
```

### Frontend tests
```sh
cd frontend
npm test
```

## API endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/recipes` | List all recipes |
| GET | `/api/recipes/search?q={query}` | Search recipes by name or ingredient keyword |
| POST | `/api/recipes` | Create a recipe |
| PUT | `/api/recipes/{id}` | Update an existing recipe |
| DELETE | `/api/recipes/{id}` | Delete a recipe |
| GET | `/api/pantry` | List saved pantry ingredients |
| POST | `/api/pantry` | Add an ingredient with quantity and unit (`{"ingredient":"flour","quantity":500,"unit":"g"}`) |
| PUT | `/api/pantry/{id}` | Update an ingredient's quantity and unit |
| DELETE | `/api/pantry/{id}` | Remove a pantry ingredient |
| GET | `/api/calendar?start=YYYY-MM-DD&days=7` | Get calendar days and assigned meals |
| POST | `/api/calendar/meals` | Assign or replace a meal (`date`, `meal_type`, `recipe_id`) |
| DELETE | `/api/calendar/meals?date=YYYY-MM-DD&meal_type=breakfast` | Remove a meal assignment |
