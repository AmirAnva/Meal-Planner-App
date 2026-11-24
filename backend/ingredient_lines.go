package main

import (
	"regexp"
	"sort"
	"strconv"
	"strings"
)

type parsedIngredientLine struct {
	name     string
	quantity *float64
	unit     *string
}

type ingredientUnitAlias struct {
	alias string
	unit  string
}

var (
	ingredientAmountPattern = regexp.MustCompile(`(?i)^((?:\d+\s+)?\d+/\d+|\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞]|one|two|three|four|five|six|seven|eight|nine|ten|a|an)(?:\s+(.*))?$`)
	ingredientUnitAliases   = buildIngredientUnitAliases()
	ingredientModifiers     = []string{
		"extra virgin", "boneless", "skinless", "unsalted", "chopped", "crushed",
		"minced", "grated", "diced", "medium", "packed", "ground", "dried",
		"fresh", "large", "small", "ripe", "whole", "salted",
	}
)

func buildIngredientUnitAliases() []ingredientUnitAlias {
	aliases := []ingredientUnitAlias{
		{"fluid ounces", "fl oz"}, {"fluid ounce", "fl oz"}, {"fl oz", "fl oz"},
		{"tablespoons", "tbsp"}, {"tablespoon", "tbsp"}, {"tbsp", "tbsp"},
		{"teaspoons", "tsp"}, {"teaspoon", "tsp"}, {"tsp", "tsp"},
		{"milliliters", "ml"}, {"milliliter", "ml"}, {"millilitres", "ml"}, {"millilitre", "ml"}, {"ml", "ml"},
		{"kilograms", "kg"}, {"kilogram", "kg"}, {"kg", "kg"},
		{"grams", "g"}, {"gram", "g"}, {"g", "g"},
		{"ounces", "oz"}, {"ounce", "oz"}, {"oz", "oz"},
		{"pounds", "lb"}, {"pound", "lb"}, {"lbs", "lb"}, {"lb", "lb"},
		{"liters", "l"}, {"liter", "l"}, {"litres", "l"}, {"litre", "l"}, {"l", "l"},
		{"cups", "cup"}, {"cup", "cup"},
		{"pieces", "piece"}, {"piece", "piece"}, {"items", "piece"}, {"item", "piece"}, {"each", "piece"},
		{"cloves", "clove"}, {"clove", "clove"},
		{"cans", "can"}, {"can", "can"},
		{"bunches", "bunch"}, {"bunch", "bunch"},
		{"pinches", "pinch"}, {"pinch", "pinch"},
		{"dashes", "dash"}, {"dash", "dash"},
		{"packages", "package"}, {"package", "package"},
		{"heads", "head"}, {"head", "head"},
		{"slices", "slice"}, {"slice", "slice"},
		{"stalks", "stalk"}, {"stalk", "stalk"},
		{"sprigs", "sprig"}, {"sprig", "sprig"},
		{"handfuls", "handful"}, {"handful", "handful"},
	}
	sort.SliceStable(aliases, func(i, j int) bool {
		return len(aliases[i].alias) > len(aliases[j].alias)
	})
	return aliases
}

func parseRecipeIngredientLines(lines []string) []parsedIngredientLine {
	byName := make(map[string]int, len(lines))
	result := make([]parsedIngredientLine, 0, len(lines))
	for _, line := range lines {
		parsed := parseRecipeIngredientLine(line)
		if parsed.name == "" {
			continue
		}
		key := strings.ToLower(parsed.name)
		if index, exists := byName[key]; exists {
			previous := &result[index]
			if previous.quantity == nil || parsed.quantity == nil || previous.unit == nil || parsed.unit == nil {
				previous.quantity = nil
				previous.unit = nil
				continue
			}
			factor, comparable := unitConversion(*parsed.unit, *previous.unit)
			if !comparable {
				previous.quantity = nil
				previous.unit = nil
				continue
			}
			total := *previous.quantity + *parsed.quantity*factor
			previous.quantity = &total
			continue
		}
		byName[key] = len(result)
		result = append(result, parsed)
	}
	return result
}

func parseRecipeIngredientLine(line string) parsedIngredientLine {
	text := strings.TrimSpace(line)
	match := ingredientAmountPattern.FindStringSubmatch(text)
	if len(match) == 0 {
		return parsedIngredientLine{name: cleanIngredientName(text, false)}
	}

	quantity, valid := parseIngredientAmount(match[1])
	remaining := strings.TrimSpace(match[2])
	if !valid {
		return parsedIngredientLine{name: cleanIngredientName(text, false)}
	}

	var unit *string
	lowerRemaining := strings.ToLower(remaining)
	if alias, normalized, found := takeIngredientUnit(lowerRemaining, ingredientUnitAliases); found {
		remaining = strings.TrimSpace(remaining[len(alias):])
		unit = &normalized
	} else if alias, found := takeUnsupportedIngredientUnit(lowerRemaining); found {
		remaining = strings.TrimSpace(remaining[len(alias):])
		quantity = 0
	} else {
		defaultUnit := "piece"
		unit = &defaultUnit
	}

	name := cleanIngredientName(remaining, true)
	if name == "" {
		return parsedIngredientLine{name: cleanIngredientName(text, false)}
	}
	if quantity == 0 && unit == nil {
		return parsedIngredientLine{name: name}
	}
	return parsedIngredientLine{name: name, quantity: &quantity, unit: unit}
}

func takeIngredientUnit(text string, aliases []ingredientUnitAlias) (string, string, bool) {
	for _, item := range aliases {
		if strings.HasPrefix(text, item.alias) &&
			(len(text) == len(item.alias) || text[len(item.alias)] == ' ' || text[len(item.alias)] == '\t') {
			return item.alias, item.unit, true
		}
	}
	return "", "", false
}

func takeUnsupportedIngredientUnit(text string) (string, bool) {
	unsupported := []string{
		"milligrams", "milligram", "micrograms", "microgram", "quarts", "quart",
		"gallons", "gallon", "pints", "pint", "sticks", "stick", "mcg", "mg",
		"gal", "qt", "pt",
	}
	for _, alias := range unsupported {
		if strings.HasPrefix(text, alias) &&
			(len(text) == len(alias) || text[len(alias)] == ' ' || text[len(alias)] == '\t') {
			return alias, true
		}
	}
	return "", false
}

func parseIngredientAmount(text string) (float64, bool) {
	vulgarFractions := map[string]float64{
		"¼": 0.25, "½": 0.5, "¾": 0.75, "⅓": 1.0 / 3,
		"⅔": 2.0 / 3, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
	}
	if value, ok := vulgarFractions[text]; ok {
		return value, true
	}
	switch strings.ToLower(text) {
	case "a", "an", "one":
		return 1, true
	case "two":
		return 2, true
	case "three":
		return 3, true
	case "four":
		return 4, true
	case "five":
		return 5, true
	case "six":
		return 6, true
	case "seven":
		return 7, true
	case "eight":
		return 8, true
	case "nine":
		return 9, true
	case "ten":
		return 10, true
	}
	if strings.Contains(text, " ") {
		parts := strings.Fields(text)
		if len(parts) != 2 {
			return 0, false
		}
		whole, err := strconv.ParseFloat(parts[0], 64)
		if err != nil {
			return 0, false
		}
		fraction, ok := parseIngredientAmount(parts[1])
		if !ok {
			return 0, false
		}
		return whole + fraction, true
	}
	if strings.Contains(text, "/") {
		parts := strings.Split(text, "/")
		if len(parts) != 2 {
			return 0, false
		}
		numerator, numeratorErr := strconv.ParseFloat(parts[0], 64)
		denominator, denominatorErr := strconv.ParseFloat(parts[1], 64)
		if numeratorErr != nil || denominatorErr != nil || denominator == 0 {
			return 0, false
		}
		return numerator / denominator, true
	}
	value, err := strconv.ParseFloat(text, 64)
	return value, err == nil
}

func cleanIngredientName(name string, singularize bool) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return ""
	}
	if comma := strings.IndexByte(name, ','); comma >= 0 {
		name = name[:comma]
	}
	for {
		start := strings.IndexByte(name, '(')
		if start < 0 {
			break
		}
		end := strings.IndexByte(name[start:], ')')
		if end < 0 {
			break
		}
		name = name[:start] + name[start+end+1:]
	}
	name = strings.TrimSpace(name)
	lower := strings.ToLower(name)
	if index := strings.Index(lower, " to taste"); index >= 0 {
		name = name[:index] + name[index+len(" to taste"):]
	}
	name = strings.TrimSpace(name)
	for _, modifier := range ingredientModifiers {
		lower = strings.ToLower(name)
		if strings.HasPrefix(lower, modifier+" ") {
			name = strings.TrimSpace(name[len(modifier):])
			return cleanIngredientName(name, singularize)
		}
	}
	name = strings.Trim(name, " .;:")
	if !singularize {
		return name
	}
	words := strings.Fields(name)
	if len(words) == 0 {
		return ""
	}
	last := words[len(words)-1]
	lower = strings.ToLower(last)
	switch {
	case strings.HasSuffix(lower, "ies"):
		last = last[:len(last)-3] + "y"
	case strings.HasSuffix(lower, "oes"):
		last = last[:len(last)-2]
	case strings.HasSuffix(lower, "ches"), strings.HasSuffix(lower, "shes"), strings.HasSuffix(lower, "xes"), strings.HasSuffix(lower, "zes"):
		last = last[:len(last)-2]
	case strings.HasSuffix(lower, "s") && !strings.HasSuffix(lower, "ss"):
		last = last[:len(last)-1]
	}
	words[len(words)-1] = last
	return strings.Join(words, " ")
}
