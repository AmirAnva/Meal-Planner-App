import assert from 'node:assert/strict';
import test from 'node:test';
import { assessRecipeAvailability, buildShoppingList } from '../src/shopping-list.js';
import { formatRecipeIngredient, parseRecipeIngredient, parseRecipeIngredientFields } from '../src/measurements.js';

test('aggregates demands and reports absent ingredients across scheduled meals', () => {
  const result = buildShoppingList([
    {
      date: '2026-11-17',
      meals: [
        { recipe: { name: 'Pancakes', ingredients: ['2 cups flour', '1 ripe banana'] } },
        { recipe: { name: 'Banana Bread', ingredients: ['1 cup flour', '2 ripe bananas'] } },
      ],
    },
  ], [{ ingredient: 'all-purpose flour', quantity: 500, unit: 'g' }]);

  assert.equal(result.plannedMealCount, 2);
  assert.equal(result.checkedIngredientCount, 4);
  assert.deepEqual(result.items, [
    {
      ingredient: 'Banana',
      status: 'missing',
      needed: 3,
      unit: 'piece',
      uses: [
        { recipe: 'Pancakes', date: '2026-11-17' },
        { recipe: 'Banana Bread', date: '2026-11-17' },
      ],
    },
  ]);
});

test('does not report shortages when pantry amounts cover recipe requirements', () => {
  const result = buildShoppingList([
    {
      date: '2026-11-17',
      meals: [{ recipe: { name: 'Soup', ingredients: ['2 cups chopped carrots'] } }],
    },
  ], [{ ingredient: 'carrots', quantity: 2, unit: 'cup' }]);

  assert.equal(result.plannedMealCount, 1);
  assert.equal(result.checkedIngredientCount, 1);
  assert.deepEqual(result.items, []);
});

test('warns when aggregated recipe quantities exceed pantry stock across compatible units', () => {
  const result = buildShoppingList([
    {
      date: '2026-11-17',
      meals: [{ recipe: { name: 'Bread', ingredients: ['2 cups flour'] } }],
    },
    {
      date: '2026-11-19',
      meals: [{ recipe: { name: 'Pasta', ingredients: ['100 g flour'] } }],
    },
  ], [{ ingredient: 'flour', quantity: 300, unit: 'g' }]);

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].status, 'short');
  assert.equal(result.items[0].unit, 'g');
  assert.equal(result.items[0].needed, 340);
  assert.equal(result.items[0].available, 300);
  assert.equal(result.items[0].shortage, 40);
  assert.equal(result.items[0].uses.length, 2);
});

test('flags unquantified recipe entries instead of assuming pantry quantity is enough', () => {
  const result = buildShoppingList([
    {
      date: '2026-11-17',
      meals: [{ recipe: { name: 'Toast', ingredients: ['butter'] } }],
    },
  ], [{ ingredient: 'butter', quantity: 1, unit: 'lb' }]);

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].status, 'check');
});

test('flags weight-volume comparisons when ingredient-specific conversion data is unavailable', () => {
  const result = buildShoppingList([
    {
      date: '2026-11-17',
      meals: [{ recipe: { name: 'Quinoa Salad', ingredients: ['2 cups quinoa'] } }],
    },
  ], [{ ingredient: 'quinoa', quantity: 500, unit: 'g' }]);

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].status, 'check');
});

test('preserves ingredient matching for explicit units the pantry cannot compare', () => {
  const result = buildShoppingList([
    {
      date: '2026-11-17',
      meals: [{ recipe: { name: 'Chowder', ingredients: ['2 quarts milk'] } }],
    },
  ], [{ ingredient: 'milk', quantity: 1, unit: 'l' }]);

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].ingredient, 'Milk');
  assert.equal(result.items[0].status, 'check');
});

test('assesses recipe availability as enough, missing, insufficient, or unverified', () => {
  const pantry = [
    { ingredient: 'flour', quantity: 100, unit: 'g' },
    { ingredient: 'milk', quantity: 2, unit: 'cup' },
  ];

  assert.deepEqual(
    assessRecipeAvailability(['1 cup milk'], pantry),
    { status: 'enough', label: 'Enough ingredients' },
  );
  assert.deepEqual(
    assessRecipeAvailability(['1 banana'], pantry),
    { status: 'missing', label: 'Missing ingredients' },
  );
  assert.deepEqual(
    assessRecipeAvailability(['2 cups flour'], pantry),
    { status: 'short', label: 'Not enough quantity' },
  );
  assert.deepEqual(
    assessRecipeAvailability(['1 cup flour', '100 g flour'], pantry),
    { status: 'short', label: 'Not enough quantity' },
  );
  assert.deepEqual(
    assessRecipeAvailability(['2 cups quinoa'], [{ ingredient: 'quinoa', quantity: 500, unit: 'g' }]),
    { status: 'check', label: 'Check quantities' },
  );
});

test('recipe ingredient fields preserve quantities, units, and legacy free-text lines', () => {
  const fields = parseRecipeIngredientFields('1 1/2 cups all-purpose flour');
  assert.deepEqual(fields, { ingredient: 'all-purpose flour', quantity: '1.5', unit: 'cup' });

  const saved = formatRecipeIngredient(fields.ingredient, fields.quantity, fields.unit);
  assert.equal(saved, '1.5 cup all-purpose flour');
  assert.deepEqual(parseRecipeIngredient(saved), {
    ingredient: 'all purpose flour',
    quantity: 1.5,
    unit: 'cup',
  });
  assert.deepEqual(parseRecipeIngredientFields('salt to taste'), {
    ingredient: 'salt to taste',
    quantity: '',
    unit: 'g',
  });
  assert.deepEqual(parseRecipeIngredientFields('2 quarts milk'), {
    ingredient: '2 quarts milk',
    quantity: '',
    unit: 'g',
  });
});
