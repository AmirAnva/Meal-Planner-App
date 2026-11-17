export const pantryUnitOptions = [
  ['g', 'g'],
  ['kg', 'kg'],
  ['oz', 'oz'],
  ['lb', 'lb'],
  ['ml', 'ml'],
  ['l', 'L'],
  ['tsp', 'tsp'],
  ['tbsp', 'tbsp'],
  ['cup', 'cup'],
  ['fl oz', 'fl oz'],
  ['piece', 'piece'],
  ['clove', 'clove'],
  ['can', 'can'],
  ['bunch', 'bunch'],
  ['pinch', 'pinch'],
  ['dash', 'dash'],
  ['package', 'package'],
  ['head', 'head'],
  ['slice', 'slice'],
  ['stalk', 'stalk'],
  ['sprig', 'sprig'],
  ['handful', 'handful'],
];

const units = {
  g: { dimension: 'mass', factor: 1 },
  kg: { dimension: 'mass', factor: 1000 },
  oz: { dimension: 'mass', factor: 28.349523125 },
  lb: { dimension: 'mass', factor: 453.59237 },
  ml: { dimension: 'volume', factor: 1 },
  l: { dimension: 'volume', factor: 1000 },
  tsp: { dimension: 'volume', factor: 4.92892159375 },
  tbsp: { dimension: 'volume', factor: 14.78676478125 },
  cup: { dimension: 'volume', factor: 236.5882365 },
  'fl oz': { dimension: 'volume', factor: 29.5735295625 },
  piece: { dimension: 'count' },
  clove: { dimension: 'count' },
  can: { dimension: 'count' },
  bunch: { dimension: 'count' },
  pinch: { dimension: 'count' },
  dash: { dimension: 'count' },
  package: { dimension: 'count' },
  head: { dimension: 'count' },
  slice: { dimension: 'count' },
  stalk: { dimension: 'count' },
  sprig: { dimension: 'count' },
  handful: { dimension: 'count' },
};

const aliases = new Map();
for (const [unit] of pantryUnitOptions) aliases.set(unit, unit);
[
  ['gram', 'g'], ['grams', 'g'],
  ['kilogram', 'kg'], ['kilograms', 'kg'],
  ['ounce', 'oz'], ['ounces', 'oz'],
  ['pound', 'lb'], ['pounds', 'lb'], ['lbs', 'lb'],
  ['milliliter', 'ml'], ['milliliters', 'ml'], ['millilitre', 'ml'], ['millilitres', 'ml'],
  ['liter', 'l'], ['liters', 'l'], ['litre', 'l'], ['litres', 'l'],
  ['teaspoon', 'tsp'], ['teaspoons', 'tsp'],
  ['tablespoon', 'tbsp'], ['tablespoons', 'tbsp'],
  ['cups', 'cup'], ['c', 'cup'],
  ['fluid ounce', 'fl oz'], ['fluid ounces', 'fl oz'],
  ['pieces', 'piece'], ['item', 'piece'], ['items', 'piece'], ['each', 'piece'],
  ['cloves', 'clove'], ['cans', 'can'], ['bunches', 'bunch'],
  ['pinches', 'pinch'], ['dashes', 'dash'], ['packages', 'package'],
  ['heads', 'head'], ['slices', 'slice'], ['stalks', 'stalk'],
  ['sprigs', 'sprig'], ['handfuls', 'handful'],
].forEach(([alias, unit]) => aliases.set(alias, unit));

const orderedUnitAliases = [...aliases.keys()].sort((a, b) => b.length - a.length);
const uncomparableUnitAliases = [
  'milligrams', 'milligram', 'micrograms', 'microgram', 'quarts', 'quart',
  'gallons', 'gallon', 'pints', 'pint', 'sticks', 'stick', 'mcg', 'mg',
  'gal', 'qt', 'pt',
];

function ingredientDensity(ingredient) {
  const name = String(ingredient).toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (name === 'olive oil') return 216;
  if (/^(?:powdered|confectioners) sugar$/.test(name)) return 120;
  if (/^(?:brown|light brown|dark brown) sugar$/.test(name)) return 220;
  if (name === 'rice flour') return 158;
  if (name === 'bread flour') return 127;
  if (['flour', 'all purpose flour', 'wheat flour', 'whole wheat flour', 'cake flour', 'self rising flour'].includes(name)) return 120;
  if (/(?:^|\s)sugar$/.test(name)) return 200;
  if (name === 'peanut butter') return 258;
  if (/(?:^|\s)butter$/.test(name)) return 227;
  if (/^(?:rolled )?oats?$/.test(name)) return 90;
  if (/^(?:(?:white|brown|basmati|jasmine) )?rice$/.test(name)) return 185;
  if (/^honey$/.test(name)) return 340;
  if (/^water$/.test(name)) return 236.5882365;
  if (/^(?:(?:whole|skim|2 percent|2%) )?milk$/.test(name)) return 244;
  return null;
}

export function normalizeUnit(value) {
  const normalized = String(value || '').toLowerCase().trim().replace(/\s+/g, ' ');
  return aliases.get(normalized) || null;
}

export function convertQuantity(quantity, fromUnit, toUnit, ingredient) {
  const sourceUnit = normalizeUnit(fromUnit);
  const targetUnit = normalizeUnit(toUnit);
  if (!sourceUnit || !targetUnit || !Number.isFinite(quantity) || quantity < 0) return null;
  if (sourceUnit === targetUnit) return quantity;

  const source = units[sourceUnit];
  const target = units[targetUnit];
  if (source.dimension === target.dimension) {
    if (source.dimension === 'count') return null;
    return quantity * source.factor / target.factor;
  }

  const density = ingredientDensity(ingredient);
  if (!density) return null;
  if (source.dimension === 'mass' && target.dimension === 'volume') {
    const grams = quantity * source.factor;
    return (grams / density) * units.cup.factor / target.factor;
  }
  if (source.dimension === 'volume' && target.dimension === 'mass') {
    const milliliters = quantity * source.factor;
    return (milliliters / units.cup.factor) * density / target.factor;
  }
  return null;
}

export function displayPantryQuantity(item, system) {
  const sourceUnit = normalizeUnit(item.unit);
  const quantity = Number(item.quantity);
  if (!sourceUnit || !Number.isFinite(quantity) || quantity <= 0) return 'Quantity not set';

  const sourceDimension = units[sourceUnit].dimension;
  let targetUnit = sourceUnit;
  if (system === 'metric' && sourceDimension === 'mass') targetUnit = 'g';
  if (system === 'metric' && sourceDimension === 'volume') targetUnit = 'ml';
  if (system === 'us' && sourceDimension === 'volume') targetUnit = 'cup';
  if (system === 'us' && sourceDimension === 'mass') {
    targetUnit = ingredientDensity(item.ingredient) ? 'cup' : 'oz';
  }

  const converted = convertQuantity(quantity, sourceUnit, targetUnit, item.ingredient);
  if (converted === null) return `${quantity} ${sourceUnit}`;
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(converted)} ${targetUnit}`;
}

export function parseRecipeIngredient(value) {
  let text = String(value || '').replace(/\([^)]*\)/g, ' ').trim();
  const amountMatch = text.match(recipeAmountPattern);
  let quantity = null;
  let unit = null;

  if (amountMatch) {
    quantity = parseAmount(amountMatch[1]);
    text = text.slice(amountMatch[0].length).trim();

    const lowerText = text.toLowerCase();
    const unitAlias = orderedUnitAliases.find(alias => new RegExp(`^${escapeRegExp(alias)}\\b`).test(lowerText));
    if (unitAlias) {
      unit = aliases.get(unitAlias);
      text = text.slice(unitAlias.length).trim().replace(/^of\b\s*/i, '');
    } else {
      const uncomparableUnit = uncomparableUnitAliases
        .find(alias => new RegExp(`^${escapeRegExp(alias)}\\b`).test(lowerText));
      if (uncomparableUnit) {
        unit = null;
        text = text.slice(uncomparableUnit.length).trim().replace(/^of\b\s*/i, '');
      } else {
        unit = 'piece';
      }
    }
  }

  const ingredient = normalizeIngredientName(text);
  return ingredient ? { ingredient, quantity, unit } : null;
}

export function parseRecipeIngredientFields(value) {
  const text = String(value || '').trim();
  const amountMatch = text.match(recipeAmountPattern);
  if (!amountMatch) return { ingredient: text, quantity: '', unit: 'g' };

  const quantity = parseAmount(amountMatch[1]);
  const remaining = text.slice(amountMatch[0].length).trim();
  const lowerRemaining = remaining.toLowerCase();
  const unitAlias = orderedUnitAliases.find(alias => new RegExp(`^${escapeRegExp(alias)}\\b`).test(lowerRemaining));
  if (unitAlias) {
    return {
      ingredient: remaining.slice(unitAlias.length).trim().replace(/^of\b\s*/i, ''),
      quantity: quantity === null ? '' : String(quantity),
      unit: aliases.get(unitAlias),
    };
  }

  const unsupportedUnit = uncomparableUnitAliases
    .find(alias => new RegExp(`^${escapeRegExp(alias)}\\b`).test(lowerRemaining));
  if (unsupportedUnit) return { ingredient: text, quantity: '', unit: 'g' };

  return {
    ingredient: remaining,
    quantity: quantity === null ? '' : String(quantity),
    unit: 'piece',
  };
}

export function formatRecipeIngredient(ingredient, quantity, unit) {
  const name = String(ingredient || '').trim();
  const amount = String(quantity || '').trim();
  if (!amount) return name;
  return `${amount} ${normalizeUnit(unit) || String(unit || '').trim()} ${name}`.trim();
}

const recipeAmountPattern = /^((?:\d+\s+)?\d+\/\d+|\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞]|one|two|three|four|five|six|seven|eight|nine|ten|a|an)(?=\s|$)\s*/i;

function parseAmount(text) {
  const vulgarFractions = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 };
  if (Object.prototype.hasOwnProperty.call(vulgarFractions, text)) return vulgarFractions[text];
  if (['a', 'an', 'one'].includes(text.toLowerCase())) return 1;
  const wordNumbers = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  if (Object.prototype.hasOwnProperty.call(wordNumbers, text.toLowerCase())) return wordNumbers[text.toLowerCase()];
  if (text.includes(' ')) {
    const [whole, fraction] = text.split(/\s+/);
    return Number(whole) + parseAmount(fraction);
  }
  if (text.includes('/')) {
    const [numerator, denominator] = text.split('/').map(Number);
    return denominator ? numerator / denominator : null;
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function normalizeIngredientName(value) {
  const name = String(value || '')
    .toLowerCase()
    .replace(/,.*$/, '')
    .replace(/\bto taste\b/g, '')
    .replace(/^(?:(?:fresh|dried|chopped|diced|minced|grated|crushed|large|small|medium|ripe|packed|ground|whole|boneless|skinless|unsalted|salted|extra virgin)\s+)+/, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = name.split(' ');
  const last = words[words.length - 1];
  if (last && last.endsWith('ies')) {
    words[words.length - 1] = `${last.slice(0, -3)}y`;
  } else if (last && last.endsWith('oes')) {
    words[words.length - 1] = last.slice(0, -2);
  } else if (last && /(ches|shes|xes|zes)$/.test(last)) {
    words[words.length - 1] = last.slice(0, -2);
  } else if (last && last.endsWith('s') && !last.endsWith('ss')) {
    words[words.length - 1] = last.slice(0, -1);
  }
  return words.join(' ');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
