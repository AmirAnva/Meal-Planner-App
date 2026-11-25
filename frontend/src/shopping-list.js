// Domain logic for comparing recipe requirements against pantry inventory.
import { convertQuantity, normalizeUnit, parseRecipeIngredient } from './measurement.js';

function pantryIngredientName(item) {
  const name = item.ingredient?.name || item.ingredient || '';
  return parseRecipeIngredient(name)?.ingredient || '';
}

function pantryMatches(ingredient, pantryItems) {
  // Prefer exact names, then distinguish more specific pantry names from broader ones.
  const matches = pantryItems.flatMap(item => {
    const name = pantryIngredientName(item);
    if (!name) return [];
    if (name === ingredient) return [{ item, rank: 0 }];
    if (ingredient.endsWith(` ${name}`)) return [{ item, rank: 1 }];
    if (name.endsWith(` ${ingredient}`)) return [{ item, rank: 2 }];
    return [];
  });
  if (matches.length === 0) return { item: null, ambiguous: false };

  const bestRank = Math.min(...matches.map(match => match.rank));
  const bestMatches = matches.filter(match => match.rank === bestRank);
  return { item: bestMatches[0].item, ambiguous: bestMatches.length > 1 };
}

function summarizeRequirements(group, pantryItem, ambiguous) {
  // Convert all comparable requirements to the pantry unit; unknown units become
  // "check" instead of assuming the pantry is sufficient.
  const { requirements, ...item } = group;
  const usableRequirements = requirements.filter(requirement =>
    Number.isFinite(requirement.quantity) && requirement.quantity > 0 && requirement.unit,
  );
  const hasUnknownRequirement = usableRequirements.length !== requirements.length;
  const targetUnit = normalizeUnit(pantryItem?.unit)
    || usableRequirements.map(requirement => normalizeUnit(requirement.unit)).find(Boolean);
  let required = 0;
  let canCompareRequired = Boolean(targetUnit) && !hasUnknownRequirement;

  if (canCompareRequired) {
    for (const requirement of usableRequirements) {
      const converted = convertQuantity(
        requirement.quantity,
        requirement.unit,
        targetUnit,
        group.ingredient,
      );
      if (converted === null) {
        canCompareRequired = false;
        break;
      }
      required += converted;
    }
  }

  if (!pantryItem) {
    return {
      ...item,
      status: 'missing',
      needed: canCompareRequired ? required : null,
      unit: canCompareRequired ? targetUnit : null,
    };
  }

  const availableQuantity = Number(pantryItem.quantity);
  const availableUnit = normalizeUnit(pantryItem.unit);
  if (ambiguous || !canCompareRequired || !Number.isFinite(availableQuantity) || availableQuantity <= 0 || !availableUnit) {
    return { ...item, status: 'check', needed: null, available: null, unit: null };
  }

  const available = convertQuantity(availableQuantity, availableUnit, targetUnit, group.ingredient);
  if (available === null) {
    return { ...item, status: 'check', needed: null, available: null, unit: null };
  }
  if (required <= available + 1e-9) return null;

  return {
    ...item,
    status: 'short',
    needed: required,
    available,
    shortage: required - available,
    unit: targetUnit,
  };
}

export function assessRecipeAvailability(ingredients = [], pantryItems = []) {
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return { status: 'unknown', label: 'No ingredients listed' };
  }

  const groups = new Map();
  let hasMissingIngredient = false;
  let hasShortage = false;
  let hasUnverifiedAmount = false;

  for (const rawIngredient of ingredients) {
    const parsed = parseRecipeIngredient(rawIngredient);
    if (!parsed) {
      hasUnverifiedAmount = true;
      continue;
    }

    if (!groups.has(parsed.ingredient)) {
      groups.set(parsed.ingredient, []);
    }
    groups.get(parsed.ingredient).push({ quantity: parsed.quantity, unit: parsed.unit });
  }

  for (const [ingredient, requirements] of groups) {
    const match = pantryMatches(ingredient, pantryItems);
    const requirement = summarizeRequirements({
      ingredient,
      requirements,
    }, match.item, match.ambiguous);
    if (!requirement) continue;
    if (requirement.status === 'missing') hasMissingIngredient = true;
    else if (requirement.status === 'short') hasShortage = true;
    else hasUnverifiedAmount = true;
  }

  if (hasMissingIngredient) return { status: 'missing', label: 'Missing ingredients' };
  if (hasShortage) return { status: 'short', label: 'Not enough quantity' };
  if (hasUnverifiedAmount) return { status: 'check', label: 'Check quantities' };
  return { status: 'enough', label: 'Enough ingredients' };
}

export function buildShoppingList(days = [], pantryItems = []) {
  const groups = new Map();
  let plannedMealCount = 0;
  let checkedIngredientCount = 0;

  days.forEach(day => {
    (day.meals || []).forEach(meal => {
      if (!meal.recipe) return;
      plannedMealCount += 1;

      (meal.recipe.ingredients || []).forEach(rawIngredient => {
        const parsed = parseRecipeIngredient(rawIngredient);
        if (!parsed) return;
        checkedIngredientCount += 1;

        if (!groups.has(parsed.ingredient)) {
          groups.set(parsed.ingredient, {
            ingredient: parsed.ingredient.charAt(0).toUpperCase() + parsed.ingredient.slice(1),
            requirements: [],
            uses: [],
          });
        }
        const group = groups.get(parsed.ingredient);
        group.requirements.push({
          quantity: parsed.quantity,
          unit: parsed.unit,
        });
        if (!group.uses.some(use => use.recipe === meal.recipe.name && use.date === day.date)) {
          group.uses.push({ recipe: meal.recipe.name, date: day.date });
        }
      });
    });
  });

  const items = [...groups.values()]
    .map(group => {
      const match = pantryMatches(group.ingredient.toLowerCase(), pantryItems);
      return summarizeRequirements(group, match.item, match.ambiguous);
    })
    .filter(Boolean)
    .sort((a, b) => a.ingredient.localeCompare(b.ingredient));

  return {
    items,
    plannedMealCount,
    checkedIngredientCount,
    toBuyCount: items.filter(item => item.status === 'missing' || item.status === 'short').length,
    toCheckCount: items.filter(item => item.status === 'check').length,
  };
}
