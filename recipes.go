package main

import "fmt"

type recipe struct {
	name         string
	ingredients  []string
	instructions []string
}

type recipeBook struct {
	recipes []recipe
}

func (rb *recipeBook) addRecipe(ingredients []string, instructions []string, name string) {
	r := recipe{
		name:         name,
		ingredients:  ingredients,
		instructions: instructions,
	}
	rb.recipes = append(rb.recipes, r)
}

func (rb *recipeBook) removeRecipe(name string) {
	for i, r := range rb.recipes {
		if r.name == name {
			rb.recipes = append(rb.recipes[:i], rb.recipes[i+1:]...)
			return
		}
	}
}

func (rb *recipeBook) findRecipe(name string) *recipe {
	for i, r := range rb.recipes {
		if r.name == name {
			return &rb.recipes[i]
		}
	}
	return nil
}

func (rb *recipeBook) findRecipeIndex(name string) int {
	for i, r := range rb.recipes {
		if r.name == name {
			return i
		}
	}
	return -1
}

func (r *recipe) addIngredient(ingredient string) {
	r.ingredients = append(r.ingredients, ingredient)
}

func (r *recipe) addInstruction(instruction string) {
	r.instructions = append(r.instructions, instruction)
}

func (r *recipe) removeIngredient(ingredient string) {
	for i, ing := range r.ingredients {
		if ing == ingredient {
			r.ingredients = append(r.ingredients[:i], r.ingredients[i+1:]...)
			return
		}
	}
}

func (r *recipe) removeInstruction(instruction string) {
	for i, instr := range r.instructions {
		if instr == instruction {
			r.instructions = append(r.instructions[:i], r.instructions[i+1:]...)
			return
		}
	}
}

func (r *recipe) updateName(newName string) {
	r.name = newName
}

func (r recipe) display() {
	fmt.Println(r)
}

func main() {
	rb := recipeBook{}
	var option int
	for true {
		fmt.Println("Option 1: Create a new recipe")
		fmt.Println("Option 2: Add an ingredient")
		fmt.Println("Option 3: Add an instruction")
		fmt.Println("Option 4: Remove an ingredient")
		fmt.Println("Option 5: Remove an instruction")
		fmt.Println("Option 6: Update recipe name")
		fmt.Println("Option 7: Display recipe")
		fmt.Println("Option 8: Remove recipe")
		fmt.Println("Option 9: Exit")
		fmt.Scanf("%d", &option)
		if option < 1 || option > 9 {
			fmt.Println("Invalid option. Please select a valid option.")
			return
		}
		var index int
		if option != 1 && option != 9 {
			fmt.Println("Enter recipe name:")
			var recipeName string
			fmt.Scanf("%s", &recipeName)
			recipe := rb.findRecipe(recipeName)
			if recipe == nil {
				fmt.Println("Recipe not found.")
				return
			}
			index = rb.findRecipeIndex(recipeName)
		}
		switch option {
		case 1:
			var name string
			var ingredients []string
			var instructions []string
			fmt.Println("Enter recipe name:")
			fmt.Scanf("%s", &name)
			fmt.Println("Enter ingredients (comma-separated):")
			var ingInput string
			fmt.Scanf("%s", &ingInput)
			ingredients = append(ingredients, ingInput)
			fmt.Println("Enter instructions (comma-separated):")
			var instrInput string
			fmt.Scanf("%s", &instrInput)
			instructions = append(instructions, instrInput)
			rb.addRecipe(ingredients, instructions, name)
			fmt.Println("Recipe added successfully.")
		case 2:
			fmt.Println("Enter ingredient to add:")
			var ingredient string
			fmt.Scanf("%s", &ingredient)
			rb.recipes[index].addIngredient(ingredient)
			fmt.Println("Ingredient added successfully.")
		case 3:
			fmt.Println("Enter instruction to add:")
			var instruction string
			fmt.Scanf("%s", &instruction)
			rb.recipes[index].addInstruction(instruction)
			fmt.Println("Instruction added successfully.")
		case 4:
			fmt.Println("Enter ingredient to remove:")
			var ingredient string
			fmt.Scanf("%s", &ingredient)
			rb.recipes[index].removeIngredient(ingredient)
			fmt.Println("Ingredient removed successfully.")
		case 5:
			fmt.Println("Enter instruction to remove:")
			var instruction string
			fmt.Scanf("%s", &instruction)
			rb.recipes[index].removeInstruction(instruction)
			fmt.Println("Instruction removed successfully.")
		case 6:
			fmt.Println("Enter new recipe name:")
			var newName string
			fmt.Scanf("%s", &newName)
			rb.recipes[index].updateName(newName)
			fmt.Println("Recipe name updated successfully.")
		case 7:
			rb.recipes[index].display()
		case 8:
			rb.removeRecipe(rb.recipes[index].name)
			fmt.Println("Recipe removed successfully.")
		case 9:
			fmt.Println("Exiting program.")
			return
		}
		option = 0
	}
}
