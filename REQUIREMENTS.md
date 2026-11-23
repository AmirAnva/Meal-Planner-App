# Meal Planner — Requirements

## 1. Overview

Meal Planner helps users organize recipes, find meals based on available ingredients, and plan their daily meals.

## 2. MVP Requirements

### Recipe Management
- **R1:** Create and save recipes with names and ingredients.
- **R2:** View saved recipes and their ingredients.
- **R3:** Edit existing recipes and save changes.
- **R4:** Delete a recipe that is no longer needed.

### Recipe Discovery
- **R5:** Search for recipes by name or keyword.
- **R6:** Compare recipe ingredients with pantry stock and show whether ingredients are sufficient, missing, insufficient, or not comparable.

### Daily Meal Planning
- **R7:** Assign recipes to breakfast, lunch, or dinner from today through the end of next month. Past dates are read-only.
- **R8:** View assigned meals and their associated recipes.

### Pantry and Grocery Planning
- **R9:** Add, view, update, and remove pantry ingredients with quantities and units.
- **R10:** Show aggregated ingredient demand for scheduled meals from today through the end of next month, compared with pantry stock.
- **R11:** Maintain normalized ingredients and persistent grocery items through the backend API; generate shortages from selected recipes.

## 3. Future Requirements

- **Recipe Organization:** Tags, categories, dietary filters, and serving adjustments.
- **Grocery List UI:** Browse, edit, and mark persistent grocery-list items as purchased in the browser.
- **Account Preferences:** Manage profiles, dietary restrictions, allergies, and serving preferences.

## 4. Current Scope

The current implementation includes recipe CRUD and search, the monthly meal calendar, pantry tracking, recipe availability indicators, and the upcoming-meal shopping summary. Normalized ingredient and persistent grocery-list operations are also available through the backend API.
