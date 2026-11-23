# Meal Planner

Meal Planner is a lightweight recipe and meal scheduling app with a modern JavaScript frontend powered by Vite and a Go API backend with SQLite persistence. Recipe ingredients are entered one per row with an optional quantity and unit. Recipe cards are color-coded against pantry stock: green when ingredients appear sufficient, red when ingredients are missing, and orange when quantities are insufficient or need checking. The calendar also summarizes missing or insufficient ingredients for scheduled meals.

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

Open `http://127.0.0.1:5173` in your browser. All `/api` requests are automatically proxied to the Go backend (`http://localhost:8080`).

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
| GET / POST | `/api/ingredients` | List or create normalized ingredients |
| PUT | `/api/recipes/{id}/ingredients` | Set normalized recipe ingredients and quantities |
| GET / POST / PUT | `/api/pantry-items` | List, add, or set normalized pantry stock |
| PUT / DELETE | `/api/pantry-items/{id}` | Update or remove pantry stock |
| GET / POST | `/api/pantry` | List pantry stock or add a quantity |
| PUT / DELETE | `/api/pantry/{id}` | Update or remove pantry stock |
| GET / POST | `/api/grocery-list` | List or create grocery items |
| PUT / DELETE | `/api/grocery-list/{id}` | Update or delete a grocery item |
| POST | `/api/grocery-list/generate` | Compare selected recipe requirements with pantry stock |
| GET / POST / DELETE | `/api/grocery` and `/api/grocery/{id}` | Compatibility routes |
| GET | `/api/calendar?start=YYYY-MM-DD&days=7` | Get calendar days and assigned meals |
| POST | `/api/calendar/meals` | Assign or replace a meal (`date`, `meal_type`, `recipe_id`) |
| DELETE | `/api/calendar/meals?date=YYYY-MM-DD&meal_type=breakfast` | Remove a meal assignment |

See [`SPECIFICATIONS.md`](./SPECIFICATIONS.md) for request formats, validation, and schema details.
