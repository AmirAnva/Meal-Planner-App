// Struct for calendar which contains three meals for each day with only one day currently implemented.
// The meals are breakfast, lunch, and dinner. Each meal contains a list of recipes.
package main

type calendar struct {
	Days []day `json:"days"`
}

type day struct {
	Breakfast meal `json:"breakfast"`
	Lunch     meal `json:"lunch"`
	Dinner    meal `json:"dinner"`
}

type recipe map[string]interface{}

type meal struct {
	Recipes []recipe `json:"recipes"`
}

func newCalendar() calendar {
	return calendar{
		Days: []day{{
			Breakfast: meal{Recipes: []recipe{}},
			Lunch:     meal{Recipes: []recipe{}},
			Dinner:    meal{Recipes: []recipe{}},
		}},
	}
}

func (c *calendar) addRecipeToMeal(dayIndex int, mealType MealType, recipe recipe) {
	if dayIndex < 0 || dayIndex >= len(c.Days) {
		return
	}

	switch mealType {
	case Breakfast:
		c.Days[dayIndex].Breakfast.Recipes = append(c.Days[dayIndex].Breakfast.Recipes, recipe)
	case Lunch:
		c.Days[dayIndex].Lunch.Recipes = append(c.Days[dayIndex].Lunch.Recipes, recipe)
	case Dinner:
		c.Days[dayIndex].Dinner.Recipes = append(c.Days[dayIndex].Dinner.Recipes, recipe)
	}
}

func (c *calendar) removeRecipeFromMeal(dayIndex int, mealType MealType, recipeIndex int) {
	if dayIndex < 0 || dayIndex >= len(c.Days) {
		return
	}

	switch mealType {
	case Breakfast:
		if recipeIndex >= 0 && recipeIndex < len(c.Days[dayIndex].Breakfast.Recipes) {
			c.Days[dayIndex].Breakfast.Recipes = append(c.Days[dayIndex].Breakfast.Recipes[:recipeIndex], c.Days[dayIndex].Breakfast.Recipes[recipeIndex+1:]...)
		}
	case Lunch:
		if recipeIndex >= 0 && recipeIndex < len(c.Days[dayIndex].Lunch.Recipes) {
			c.Days[dayIndex].Lunch.Recipes = append(c.Days[dayIndex].Lunch.Recipes[:recipeIndex], c.Days[dayIndex].Lunch.Recipes[recipeIndex+1:]...)
		}
	case Dinner:
		if recipeIndex >= 0 && recipeIndex < len(c.Days[dayIndex].Dinner.Recipes) {
			c.Days[dayIndex].Dinner.Recipes = append(c.Days[dayIndex].Dinner.Recipes[:recipeIndex], c.Days[dayIndex].Dinner.Recipes[recipeIndex+1:]...)
		}
	}
}

func (c *calendar) getRecipesForMeal(dayIndex int, mealType MealType) []recipe {
	if dayIndex < 0 || dayIndex >= len(c.Days) {
		return nil
	}

	switch mealType {
	case Breakfast:
		return c.Days[dayIndex].Breakfast.Recipes
	case Lunch:
		return c.Days[dayIndex].Lunch.Recipes
	case Dinner:
		return c.Days[dayIndex].Dinner.Recipes
	default:
		return nil
	}
}
