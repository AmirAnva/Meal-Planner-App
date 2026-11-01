// calendar contains the meal assignments for each day.
package main

type calendar struct {
	Days []Day `json:"days"`
}

func newCalendar() calendar {
	return calendar{
		Days: []Day{{
			Meals: []Meal{
				{MealType: Breakfast},
				{MealType: Lunch},
				{MealType: Dinner},
			},
		}},
	}
}

func (c *calendar) addRecipeToMeal(dayIndex int, mealType MealType, recipe Recipe) {
	if dayIndex < 0 || dayIndex >= len(c.Days) {
		return
	}

	for i := range c.Days[dayIndex].Meals {
		if c.Days[dayIndex].Meals[i].MealType == mealType {
			c.Days[dayIndex].Meals[i].Recipe = recipe
			return
		}
	}

	c.Days[dayIndex].Meals = append(c.Days[dayIndex].Meals, Meal{
		MealType: mealType,
		Recipe:   recipe,
	})
}

func (c *calendar) removeRecipeFromMeal(dayIndex int, mealType MealType, recipeIndex int) {
	if dayIndex < 0 || dayIndex >= len(c.Days) || recipeIndex != 0 {
		return
	}

	for i := range c.Days[dayIndex].Meals {
		if c.Days[dayIndex].Meals[i].MealType == mealType {
			c.Days[dayIndex].Meals = append(c.Days[dayIndex].Meals[:i], c.Days[dayIndex].Meals[i+1:]...)
			return
		}
	}
}

func (c *calendar) getRecipesForMeal(dayIndex int, mealType MealType) []Recipe {
	if dayIndex < 0 || dayIndex >= len(c.Days) {
		return nil
	}

	for _, meal := range c.Days[dayIndex].Meals {
		if meal.MealType == mealType && meal.Recipe.Name != "" {
			return []Recipe{meal.Recipe}
		}
	}
	return []Recipe{}
}
