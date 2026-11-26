// ── controller.js — Event handlers & API calls (Controller layer) ─

import * as View from './view.js';

// ── State ─────────────────────────────────────────────────────────
let recipes             = [];
let currentYear         = new Date().getFullYear();
let currentMonth        = new Date().getMonth() + 1; // 1-12
let selectedDate        = '';
let monthMealsByDate    = {};
let activeMealType      = '';
let searchRequestId     = 0;
let mealSearchRequestId = 0;
let calendarRequestId   = 0;
let calendarAbortController = null;
let isSavingMeal        = false;
let isRemovingMeal      = false;

// Grocery State
let groceryItems        = [];
let groceryFilter       = 'all';
let grocerySearchQuery  = '';
const groceryItemUpdateVersions = new Map();

// Pantry State
let pantryItems         = [];
let ingredientsList     = [];
let pantryFilter        = 'all';
let pantrySearchQuery   = '';
let pantryLoadRequestId = 0;
const pantryItemUpdateVersions = new Map();
const pantryInFlightIds = new Set();
let isSavingPantry      = false;

// Calendar Week & Reschedule / Generate Grocery State
let calendarMode        = 'month';
let weekStartDate       = '';
let isReschedulingMeal  = false;
let isGeneratingGrocery = false;

// ── API helper ────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const res = await fetch(path, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function formatDateString(year, month, day) {
  const y = String(year);
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getTodayDateString() {
  const d = new Date();
  return formatDateString(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

selectedDate = getTodayDateString();
weekStartDate = selectedDate;

function addDaysToDateString(dateStr, deltaDays) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + deltaDays);
  return formatDateString(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

// ── Load recipes ──────────────────────────────────────────────────
async function loadRecipes() {
  try {
    const data = await apiFetch('/api/recipes');
    recipes = Array.isArray(data) ? data : (data && Array.isArray(data.recipes) ? data.recipes : []);
    const searchInput = document.getElementById('search-input');
    if (searchInput && searchInput.value.trim()) {
      handleSearch(searchInput.value);
    } else {
      refreshRecipeFilters(); View.render(recipes);
    }
  } catch (err) {
    View.showToast('Could not load recipes: ' + err.message);
  }
}

// ── Load calendar ─────────────────────────────────────────────────
async function loadCalendar(year = currentYear, month = currentMonth) {
  const requestId = ++calendarRequestId;

  if (calendarAbortController) {
    calendarAbortController.abort();
  }
  calendarAbortController = new AbortController();
  const { signal } = calendarAbortController;

  currentYear = year;
  currentMonth = month;

  try {
    const startDate = calendarMode === 'week'
      ? weekStartDate
      : formatDateString(year, month, 1);
    const daysCount = calendarMode === 'week'
      ? 7
      : new Date(year, month, 0).getDate();

    const data = await apiFetch(`/api/calendar?start=${startDate}&days=${daysCount}`, { signal });

    if (requestId !== calendarRequestId) return false;

    monthMealsByDate = {};
    if (data && Array.isArray(data.days)) {
      data.days.forEach(day => {
        const mealsMap = {};
        if (Array.isArray(day.meals)) {
          day.meals.forEach(m => {
            mealsMap[m.meal_type] = m;
          });
        }
        monthMealsByDate[day.date] = mealsMap;
      });
    }

    if (calendarMode === 'week') {
      View.renderWeekGrid({
        startDateStr: weekStartDate,
        mealsByDate: monthMealsByDate,
      });
    } else {
      View.renderMonthGrid({
        year,
        month,
        selectedDate,
        monthMealsByDate,
      });
    }

    const selectedDayMeals = monthMealsByDate[selectedDate] || {};
    View.renderCalendar(selectedDayMeals);
    return true;
  } catch (err) {
    if (err.name === 'AbortError' || requestId !== calendarRequestId) return false;
    View.showToast('Could not load calendar: ' + err.message);
    return false;
  }
}

// ── Submit add or edit ────────────────────────────────────────────
async function submitRecipe(e) {
  e.preventDefault();

  try {
    const { editId, payload } = View.readRecipeForm();
    if (editId) {
      // Edit existing recipe
      const updated = await apiFetch(`/api/recipes/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      recipes = recipes.map(r => r.id === updated.id ? updated : r);
      View.closeModal();
      const searchInput = document.getElementById('search-input');
      if (searchInput && searchInput.value.trim()) {
        handleSearch(searchInput.value);
      } else {
        refreshRecipeFilters(); View.render(recipes);
      }
      loadCalendar();
      View.showToast(`"${updated.name}" updated!`);
    } else {
      // Create new recipe
      const created = await apiFetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      recipes.push(created);
      View.closeModal();
      const searchInput = document.getElementById('search-input');
      if (searchInput && searchInput.value.trim()) {
        handleSearch(searchInput.value);
      } else {
        refreshRecipeFilters(); View.render(recipes);
      }
      View.showToast(`"${created.name}" added!`);
    }
  } catch (err) {
    View.showToast('Could not save recipe: ' + err.message);
  }
}

// ── Remove recipe ─────────────────────────────────────────────────
async function removeRecipe(id) {
  const recipe = recipes.find(r => r.id === Number(id));
  const card = document.getElementById(`card-${id}`);
  const cardName = card?.querySelector('.card-name')?.textContent?.trim();
  const recipeName = (recipe && recipe.name) || cardName;
  const message = recipeName
    ? `Are you sure you want to remove "${recipeName}"?`
    : 'Are you sure you want to remove this recipe?';

  if (!window.confirm(message)) return;

  if (!View.animateRecipeRemoval(id)) return;

  try {
    await apiFetch(`/api/recipes/${id}`, { method: 'DELETE' });
    setTimeout(() => {
      recipes = recipes.filter(r => r.id !== Number(id));
      const searchInput = document.getElementById('search-input');
      if (searchInput && searchInput.value.trim()) {
        handleSearch(searchInput.value);
      } else {
        refreshRecipeFilters(); View.render(recipes);
      }
      loadCalendar();
      View.showToast('Recipe removed.');
    }, 200);
  } catch (err) {
    View.restoreRecipeCard(id);
    View.showToast('Could not remove recipe: ' + err.message);
  }
}

// ── Edit button from detail modal ─────────────────────────────────
async function editFromDetail() {
  const id = View.getDetailRecipeId();
  View.closeDetailModal();
  await openStructuredEdit(id);
}

// ── Search in Recipes ─────────────────────────────────────────────
async function handleSearch(val) {
  const query = val.trim();
  const requestId = ++searchRequestId;

  if (!query) {
    refreshRecipeFilters(); View.render(recipes);
    return;
  }

  try {
    const data = await apiFetch(`/api/recipes/search?q=${encodeURIComponent(query)}`);
    if (requestId !== searchRequestId) return;
    const results = Array.isArray(data) ? data : (data && Array.isArray(data.recipes) ? data.recipes : []);
    refreshRecipeFilters(); View.render(results);
  } catch (err) {
    if (requestId !== searchRequestId) return;
    View.showToast('Could not search recipes: ' + err.message);
  }
}

// ── Page navigation ───────────────────────────────────────────────
function navigateTo(page) {
  const isRecipes = page === 'recipes';
  const isCalendar = page === 'calendar';
  const isGrocery = page === 'grocery';
  const isPantry = page === 'pantry';

  const recipesView = document.getElementById('recipes-view');
  if (recipesView) recipesView.style.display = isRecipes ? 'block' : 'none';

  const calendarView = document.getElementById('calendar-view');
  if (calendarView) calendarView.style.display = isCalendar ? 'block' : 'none';

  const groceryView = document.getElementById('grocery-view');
  if (groceryView) groceryView.style.display = isGrocery ? 'block' : 'none';

  const pantryView = document.getElementById('pantry-view');
  if (pantryView) pantryView.style.display = isPantry ? 'block' : 'none';

  document.querySelectorAll('.nav-item').forEach(link => {
    link.classList.toggle(
      'active',
      link.dataset.page === page ||
      (isRecipes && link.id === 'recipes-nav') ||
      (isCalendar && link.id === 'calendar-nav') ||
      (isGrocery && link.id === 'grocery-nav') ||
      (isPantry && link.id === 'pantry-nav')
    );
  });

  if (isCalendar) {
    loadCalendar(currentYear, currentMonth);
  } else if (isGrocery) {
    loadGroceryItems();
  } else if (isPantry) {
    loadPantryItems();
  }

  window.scrollTo(0, 0);
}

function showCalendar() {
  navigateTo('calendar');
}

function showRecipes() {
  navigateTo('recipes');
}

function showGrocery() {
  navigateTo('grocery');
}

function showPantry() {
  navigateTo('pantry');
}

// ── Pantry Inventory Controller ───────────────────────────────────
async function loadIngredientsCatalog() {
  try {
    const data = await apiFetch('/api/ingredients');
    ingredientsList = Array.isArray(data) ? data : [];
    View.renderIngredientDatalist(ingredientsList);
  } catch (_) {
    // Non-fatal: autocomplete catalog can remain empty if request fails
  }
}

async function loadPantryItems() {
  const reqId = ++pantryLoadRequestId;
  try {
    const [pantryData] = await Promise.all([
      apiFetch('/api/pantry-items'),
      loadIngredientsCatalog(),
    ]);
    if (reqId !== pantryLoadRequestId) return;

    const incoming = Array.isArray(pantryData) ? pantryData : [];
    // Preserve any optimistic updates that are still in-flight
    pantryItems = incoming.map(serverItem => {
      const id = Number(serverItem.ingredient_id);
      if (pantryInFlightIds.has(id)) {
        const localItem = pantryItems.find(it => Number(it.ingredient_id) === id);
        if (localItem) return localItem;
      }
      return serverItem;
    });
    View.renderPantryList(pantryItems, pantryFilter, pantrySearchQuery);
  } catch (err) {
    if (reqId === pantryLoadRequestId) {
      View.showToast('Could not load pantry: ' + err.message);
    }
  }
}

async function openPantryModal() {
  if (ingredientsList.length === 0 || pantryItems.length === 0) {
    await loadPantryItems();
  }
  View.openPantryModal();
}

function handlePantryNameInput(val) {
  const editId = document.getElementById('p-ingredient-id')?.value?.trim();
  if (editId) {
    View.renderPantryExistingNotice(null);
    return;
  }
  const normalized = (val || '').trim().toLowerCase();
  if (!normalized) {
    View.renderPantryExistingNotice(null);
    return;
  }
  const existing = pantryItems.find(it => ((it.ingredient && it.ingredient.name) || '').trim().toLowerCase() === normalized);
  View.renderPantryExistingNotice(existing || null);
}

async function resolveIngredientId(name) {
  const normalized = name.trim().toLowerCase();
  const existing = ingredientsList.find(ing => (ing.name || '').trim().toLowerCase() === normalized);
  if (existing) return existing.id;

  try {
    const created = await apiFetch('/api/ingredients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
    ingredientsList.push(created);
    View.renderIngredientDatalist(ingredientsList);
    return created.id;
  } catch (err) {
    // Handle race/case-insensitive collision by refreshing catalog once
    await loadIngredientsCatalog();
    const matched = ingredientsList.find(ing => (ing.name || '').trim().toLowerCase() === normalized);
    if (matched) return matched.id;
    throw err;
  }
}

async function submitPantryItem(e) {
  e.preventDefault();
  if (isSavingPantry) return;

  const { ingredientId, name, quantity, unit, addToExisting } = View.readPantryForm();
  if (!name) {
    View.showToast('Ingredient name is required');
    return;
  }
  if (name.length > 120) {
    View.showToast('Ingredient name must be 120 characters or less');
    return;
  }
  if (unit && unit.length > 30) {
    View.showToast('Unit must be 30 characters or less');
    return;
  }
  if (!Number.isFinite(quantity) || quantity < 0) {
    View.showToast('Quantity must be a valid non-negative number');
    return;
  }

  isSavingPantry = true;
  try {
    const isEditing = Boolean(ingredientId && Number.isInteger(ingredientId) && ingredientId > 0);
    const resolvedId = isEditing ? ingredientId : await resolveIngredientId(name);

    let finalQty = Number(quantity);
    let finalUnit = unit || null;

    if (!isEditing) {
      const existing = pantryItems.find(it => Number(it.ingredient_id) === Number(resolvedId));
      if (existing && addToExisting) {
        const existingUnit = (existing.unit || '').trim();
        const incomingUnit = (finalUnit || '').trim();
        const factor = measurementFactor(incomingUnit, existingUnit);
        const unitsMatch = factor !== null || Number(existing.quantity) === 0;
        if (unitsMatch) {
          if (Number(existing.quantity) > 0) { finalQty = Number(existing.quantity) + finalQty * factor; finalUnit = existingUnit || "each"; }
        } else {
          const ok = window.confirm(
            `"${name}" is currently stored in "${existingUnit}" (${existing.quantity} ${existingUnit}), ` +
            `but you entered "${incomingUnit}". Overwrite with ${finalQty} ${incomingUnit}?`
          );
          if (!ok) return;
        }
      }
    }

    await apiFetch('/api/pantry-items', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ingredient_id: Number(resolvedId),
        quantity: finalQty,
        unit: finalUnit,
      }),
    });

    View.closePantryModal();
    await loadPantryItems();
    View.showToast(`"${name}" saved to pantry!`);
  } catch (err) {
    View.showToast('Could not save pantry item: ' + err.message);
  } finally {
    isSavingPantry = false;
  }
}

async function updatePantryQuantity(ingredientId, nextQuantity) {
  const numId = Number(ingredientId);
  const item = pantryItems.find(it => Number(it.ingredient_id) === numId);
  if (!item) return;

  const clampedQty = Math.max(0, Math.round(nextQuantity * 1000) / 1000);
  const prevQuantity = item.quantity;
  item.quantity = clampedQty;
  View.renderPantryList(pantryItems, pantryFilter, pantrySearchQuery);

  const version = (pantryItemUpdateVersions.get(numId) || 0) + 1;
  pantryItemUpdateVersions.set(numId, version);
  pantryInFlightIds.add(numId);

  try {
    await apiFetch('/api/pantry-items', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ingredient_id: numId,
        quantity: clampedQty,
        unit: item.unit ?? null,
      }),
    });
  } catch (err) {
    if (pantryItemUpdateVersions.get(numId) === version) {
      item.quantity = prevQuantity;
      View.renderPantryList(pantryItems, pantryFilter, pantrySearchQuery);
      View.showToast('Could not update pantry quantity: ' + err.message);
    }
  } finally {
    if (pantryItemUpdateVersions.get(numId) === version) {
      pantryInFlightIds.delete(numId);
    }
  }
}

function adjustPantryQuantity(ingredientId, delta) {
  const numId = Number(ingredientId);
  const item = pantryItems.find(it => Number(it.ingredient_id) === numId);
  if (!item) return;
  const current = Number(item.quantity) || 0;
  updatePantryQuantity(numId, current + Number(delta));
}

function depletePantryItem(ingredientId) {
  const numId = Number(ingredientId);
  const item = pantryItems.find(it => Number(it.ingredient_id) === numId);
  if (!item) return;
  updatePantryQuantity(numId, 0);
  const name = (item.ingredient && item.ingredient.name) || 'Ingredient';
  View.showToast(`"${name}" marked as out of stock.`);
}

function setPantryFilter(filter) {
  pantryFilter = filter;
  document.querySelectorAll('#pantry-filter-tabs .filter-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  View.renderPantryList(pantryItems, pantryFilter, pantrySearchQuery);
}

function handlePantrySearch(val) {
  pantrySearchQuery = val;
  View.renderPantryList(pantryItems, pantryFilter, pantrySearchQuery);
}

// ── Grocery List Controller ────────────────────────────────────────
async function loadGroceryItems() {
  try {
    const data = await apiFetch('/api/grocery-list');
    groceryItems = Array.isArray(data) ? data : [];
    View.renderGroceryList(groceryItems, groceryFilter, grocerySearchQuery);
  } catch (err) {
    View.showToast('Could not load grocery list: ' + err.message);
  }
}

async function submitGroceryItem(e) {
  e.preventDefault();
  const payload = View.readGroceryForm();
  if (!payload.name) {
    View.showToast('Item name is required');
    return;
  }
  if (payload.name.length > 120) {
    View.showToast('Item name must be 120 characters or less');
    return;
  }
  if (payload.unit && payload.unit.length > 30) {
    View.showToast('Unit must be 30 characters or less');
    return;
  }
  if (payload.quantity !== null && (isNaN(payload.quantity) || payload.quantity < 0)) {
    View.showToast('Quantity must be a positive number or zero');
    return;
  }

  try {
    const created = await apiFetch('/api/grocery-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const existingIdx = groceryItems.findIndex(it => it.id === created.id);
    if (existingIdx !== -1) {
      groceryItems[existingIdx] = created;
    } else {
      groceryItems.push(created);
    }
    View.closeGroceryModal();
    View.renderGroceryList(groceryItems, groceryFilter, grocerySearchQuery);
    View.showToast(`"${created.name}" ${existingIdx !== -1 ? 'updated in' : 'added to'} grocery list!`);
  } catch (err) {
    View.showToast('Could not add item: ' + err.message);
  }
}

async function toggleGroceryItem(id, purchased) {
  const numId = Number(id);
  const item = groceryItems.find(it => it.id === numId);
  if (!item) return;

  const prevPurchased = item.purchased;
  item.purchased = Boolean(purchased);
  View.renderGroceryList(groceryItems, groceryFilter, grocerySearchQuery);

  const version = (groceryItemUpdateVersions.get(numId) || 0) + 1;
  groceryItemUpdateVersions.set(numId, version);

  try {
    const updated = await apiFetch(`/api/grocery-list/${numId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ingredient_id: item.ingredient_id ?? null,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        purchased: Boolean(purchased),
      }),
    });

    if (groceryItemUpdateVersions.get(numId) === version) {
      const idx = groceryItems.findIndex(it => it.id === numId);
      if (idx !== -1) groceryItems[idx] = updated;
      View.renderGroceryList(groceryItems, groceryFilter, grocerySearchQuery);
    }
  } catch (err) {
    if (groceryItemUpdateVersions.get(numId) === version) {
      item.purchased = prevPurchased;
      View.renderGroceryList(groceryItems, groceryFilter, grocerySearchQuery);
      View.showToast('Could not update item: ' + err.message);
    }
  }
}

async function removeGroceryItem(id) {
  const numId = Number(id);
  const item = groceryItems.find(it => it.id === numId);
  const name = (item && item.name) || 'item';
  try {
    await apiFetch(`/api/grocery-list/${numId}`, { method: 'DELETE' });
    groceryItems = groceryItems.filter(it => it.id !== numId);
    View.renderGroceryList(groceryItems, groceryFilter, grocerySearchQuery);
    View.showToast(`"${name}" removed.`);
  } catch (err) {
    View.showToast('Could not remove item: ' + err.message);
  }
}

async function clearPurchasedGroceryItems() {
  const purchased = groceryItems.filter(it => it.purchased);
  if (purchased.length === 0) return;
  if (!window.confirm(`Remove ${purchased.length} purchased item${purchased.length === 1 ? '' : 's'}?`)) return;

  const failed = [];
  // Delete sequentially to avoid SQLite locking on concurrent writes
  for (const it of purchased) {
    try {
      await apiFetch(`/api/grocery-list/${it.id}`, { method: 'DELETE' });
      groceryItems = groceryItems.filter(item => item.id !== it.id);
    } catch (_) {
      failed.push(it);
    }
  }

  View.renderGroceryList(groceryItems, groceryFilter, grocerySearchQuery);
  if (failed.length === 0) {
    View.showToast('Purchased items cleared.');
  } else {
    View.showToast(`Could not clear ${failed.length} item(s).`);
  }
}

let isMovingToPantry = false;

async function movePurchasedToPantry() {
  if (isMovingToPantry) return;
  const purchased = groceryItems.filter(it => it.purchased);
  if (purchased.length === 0) return;

  if (!window.confirm(`Move ${purchased.length} purchased item${purchased.length === 1 ? '' : 's'} to your Pantry?`)) {
    return;
  }

  isMovingToPantry = true;
  try {
    let moved = 0; const failures = [];
    for (const it of purchased) {
      try { await apiFetch(`/api/grocery-list/${it.id}/transfer`, {method:'POST'}); moved++; }
      catch (err) { failures.push(`${it.name || it.id}: ${err.message}`); }
    }
    await loadGroceryItems(); await loadPantryItems();
    View.showToast(`Moved ${moved} item(s). ${failures.join('; ')}`);
  } finally {
    isMovingToPantry = false;
  }
}

function setGroceryFilter(filter) {
  groceryFilter = filter;
  document.querySelectorAll('#grocery-filter-tabs .filter-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  View.renderGroceryList(groceryItems, groceryFilter, grocerySearchQuery);
}

function handleGrocerySearch(val) {
  grocerySearchQuery = val;
  View.renderGroceryList(groceryItems, groceryFilter, grocerySearchQuery);
}

// ── Calendar date & month controls ────────────────────────────────
function changeMonth(delta) {
  let newMonth = currentMonth + delta;
  let newYear = currentYear;
  if (newMonth > 12) {
    newMonth = 1;
    newYear++;
  } else if (newMonth < 1) {
    newMonth = 12;
    newYear--;
  }
  loadCalendar(newYear, newMonth);
}

function setCalendarMode(mode) {
  calendarMode = mode === 'week' ? 'week' : 'month';
  document.querySelectorAll('#calendar-view-tabs .filter-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === calendarMode);
  });

  const monthCard = document.getElementById('calendar-month-card');
  const weekGrid = document.getElementById('calendar-week-grid');
  const subtitle = document.getElementById('calendar-subtitle');

  if (calendarMode === 'week') {
    if (monthCard) monthCard.style.display = 'none';
    if (weekGrid) weekGrid.style.display = 'grid';
    if (subtitle) subtitle.textContent = 'Upcoming 7-day meal schedule';
  } else {
    if (monthCard) monthCard.style.display = 'block';
    if (weekGrid) weekGrid.style.display = 'none';
    if (subtitle) subtitle.textContent = 'Click any day to view or plan meals';
  }

  loadCalendar(currentYear, currentMonth);
}

function stepCalendarPeriod(delta) {
  if (calendarMode === 'week') {
    weekStartDate = addDaysToDateString(weekStartDate, delta * 7);
    loadCalendar(currentYear, currentMonth);
  } else {
    changeMonth(delta);
  }
}

async function goToToday() {
  const now = new Date();
  selectedDate = getTodayDateString();
  if (calendarMode === 'week') {
    weekStartDate = selectedDate;
    await loadCalendar(now.getFullYear(), now.getMonth() + 1);
    return;
  }
  const ok = await loadCalendar(now.getFullYear(), now.getMonth() + 1);
  if (!ok) return;
  View.highlightSelectedDay(selectedDate);
  const todayMeals = monthMealsByDate[selectedDate] || {};
  View.openDayMealsModal(selectedDate, todayMeals);
}

function selectCalendarDay(dateStr) {
  selectedDate = dateStr;
  View.highlightSelectedDay(dateStr);
  const selectedDayMeals = monthMealsByDate[selectedDate] || {};
  View.openDayMealsModal(selectedDate, selectedDayMeals);
}

// ── Calendar meal selector & assignment ───────────────────────────
async function openMealSelector(mealType) {
  activeMealType = mealType;
  if (!recipes || recipes.length === 0) {
    try {
      const data = await apiFetch('/api/recipes');
      recipes = Array.isArray(data) ? data : (data && Array.isArray(data.recipes) ? data.recipes : []);
    } catch (_) {
      // Continue with empty list if fails
    }
  }
  View.openMealSelectorModal(mealType, recipes, selectedDate);
}

async function handleMealRecipeSearch(val) {
  const query = val.trim();
  const requestId = ++mealSearchRequestId;

  if (!query) {
    View.renderMealPickerList(recipes);
    return;
  }

  try {
    const data = await apiFetch(`/api/recipes/search?q=${encodeURIComponent(query)}`);
    if (requestId !== mealSearchRequestId) return;
    const results = Array.isArray(data) ? data : (data && Array.isArray(data.recipes) ? data.recipes : []);
    View.renderMealPickerList(results);
  } catch (err) {
    if (requestId !== mealSearchRequestId) return;
    View.showToast('Could not search recipes: ' + err.message);
  }
}

async function selectRecipeForMeal(recipeId) {
  if (isSavingMeal) return;
  const mealType = activeMealType || document.getElementById('selected-meal-type').value;
  if (!mealType) return;

  isSavingMeal = true;
  const payload = {
    date: selectedDate,
    meal_type: mealType,
    recipe_id: Number(recipeId),
  };

  try {
    const updated = await apiFetch('/api/calendar/meals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!monthMealsByDate[selectedDate]) {
      monthMealsByDate[selectedDate] = {};
    }
    monthMealsByDate[selectedDate][mealType] = updated;

    View.closeMealModal();
    View.renderCalendar(monthMealsByDate[selectedDate]);
    View.updateDayCellMeals(selectedDate, monthMealsByDate[selectedDate]);
    if (calendarMode === 'week') {
      View.renderWeekGrid({ startDateStr: weekStartDate, mealsByDate: monthMealsByDate });
    }

    const recipeName = (updated && updated.recipe && updated.recipe.name) ? updated.recipe.name : 'Recipe';
    const displayType = mealType.charAt(0).toUpperCase() + mealType.slice(1);
    View.showToast(`"${recipeName}" assigned to ${displayType}!`);
  } catch (err) {
    View.showToast('Could not assign meal: ' + err.message);
  } finally {
    isSavingMeal = false;
  }
}

async function removeMeal(mealType) {
  if (isRemovingMeal) return;
  isRemovingMeal = true;
  try {
    await apiFetch(`/api/calendar/meals?date=${selectedDate}&meal_type=${mealType}`, {
      method: 'DELETE',
    });

    if (monthMealsByDate[selectedDate]) {
      delete monthMealsByDate[selectedDate][mealType];
    }

    View.renderCalendar(monthMealsByDate[selectedDate] || {});
    View.updateDayCellMeals(selectedDate, monthMealsByDate[selectedDate] || {});
    if (calendarMode === 'week') {
      View.renderWeekGrid({ startDateStr: weekStartDate, mealsByDate: monthMealsByDate });
    }

    const displayType = mealType.charAt(0).toUpperCase() + mealType.slice(1);
    View.showToast(`Removed recipe from ${displayType}.`);
  } catch (err) {
    View.showToast('Could not remove meal: ' + err.message);
  } finally {
    isRemovingMeal = false;
  }
}

function openMealSelectorForDate(dateStr, mealType) {
  selectedDate = dateStr;
  openMealSelector(mealType);
}

function openDetailModalForDate(recipeId, dateStr) {
  selectedDate = dateStr;
  View.openDetailModal(recipeId, recipes, monthMealsByDate[dateStr] || {});
}

function removeMealOnDate(dateStr, mealType) {
  selectedDate = dateStr;
  removeMeal(mealType);
}

// ── Meal Rescheduling ─────────────────────────────────────────────
function openRescheduleForDate(dateStr, mealType) {
  const dayMeals = monthMealsByDate[dateStr] || {};
  const meal = dayMeals[mealType];
  if (!meal || !meal.recipe) return;
  View.openRescheduleModal({
    sourceDate: dateStr,
    sourceType: mealType,
    recipe: meal.recipe,
  });
}

function openRescheduleModal(mealType) {
  openRescheduleForDate(selectedDate, mealType);
}

async function submitRescheduleMeal(e) {
  e.preventDefault();
  if (isReschedulingMeal) return;

  const { sourceDate, sourceType, recipeId, targetDate, targetType } = View.readRescheduleForm();
  if (!targetDate || !targetType || !Number.isInteger(recipeId) || recipeId < 1) {
    View.showToast('Please choose a valid date and meal slot.');
    return;
  }
  if (sourceDate === targetDate && sourceType === targetType) {
    View.closeRescheduleModal();
    return;
  }

  isReschedulingMeal = true;
  let postedToTarget = false;
  try {
    // Check if the target slot already has a meal assigned
    let existingTargetMeal = monthMealsByDate[targetDate] && monthMealsByDate[targetDate][targetType];
    if (!monthMealsByDate[targetDate]) {
      const targetDayData = await apiFetch(`/api/calendar?start=${encodeURIComponent(targetDate)}&days=1`).catch(() => null);
      const dayEntry = targetDayData && Array.isArray(targetDayData.days) ? targetDayData.days[0] : null;
      if (dayEntry && Array.isArray(dayEntry.meals)) {
        existingTargetMeal = dayEntry.meals.find(m => m.meal_type === targetType);
      }
    }

    if (existingTargetMeal && existingTargetMeal.recipe && existingTargetMeal.recipe.name) {
      const displayTarget = targetType.charAt(0).toUpperCase() + targetType.slice(1);
      const ok = window.confirm(
        `${displayTarget} on ${targetDate} already has "${existingTargetMeal.recipe.name}" assigned. Replace it?`
      );
      if (!ok) return;
    }

    // Assign to target slot first so original meal is preserved if assignment fails
    await apiFetch('/api/calendar/meals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: targetDate,
        recipe_id: recipeId,
        meal_type: targetType,
      }),
    });
    postedToTarget = true;

    await apiFetch(`/api/calendar/meals?date=${encodeURIComponent(sourceDate)}&meal_type=${encodeURIComponent(sourceType)}`, {
      method: 'DELETE',
    });

    View.closeRescheduleModal();
    await loadCalendar(currentYear, currentMonth);
    const displayType = targetType.charAt(0).toUpperCase() + targetType.slice(1);
    View.showToast(`Meal moved to ${displayType} on ${targetDate}!`);
  } catch (err) {
    if (postedToTarget) {
      View.closeRescheduleModal();
      await loadCalendar(currentYear, currentMonth);
      View.showToast('Meal copied to new date, but could not remove original slot: ' + err.message);
    } else {
      View.showToast('Could not move meal: ' + err.message);
    }
  } finally {
    isReschedulingMeal = false;
  }
}

// ── Auto-Generate Grocery List ────────────────────────────────────
async function generateGroceryFallbackFromText(recipeIds, scaleFactor, addToList) {
  const pantryData = await apiFetch('/api/pantry-items');
  const pantryMap = new Map();
  if (Array.isArray(pantryData)) {
    pantryData.forEach(p => {
      const pName = ((p.ingredient && p.ingredient.name) || '').trim().toLowerCase();
      if (pName && Number(p.quantity) > 0) {
        pantryMap.set(pName, p);
      }
    });
  }

  const grouped = new Map();
  recipeIds.forEach(id => {
    const recipe = recipes.find(r => r.id === Number(id));
    if (!recipe || !Array.isArray(recipe.ingredients)) return;
    recipe.ingredients.forEach(line => {
      const parsed = View.parseIngredientLine(line);
      if (!parsed || !parsed.name) return;
      const key = [...grouped.keys()].find(k => grouped.get(k).name.toLowerCase() === parsed.name.toLowerCase() && measurementFactor(parsed.unit, grouped.get(k).unit) !== null) || `${parsed.name.toLowerCase()}||${(parsed.unit || '').toLowerCase()}`;
      const rawQty = parsed.quantity * scaleFactor;
      const qty = rawQty > 0 ? Math.max(0.001, Math.round(rawQty * 1000) / 1000) : 0;
      if (!grouped.has(key)) {
        grouped.set(key, {
          name: parsed.name,
          quantity: qty,
          unit: parsed.unit,
        });
      } else {
        grouped.get(key).quantity = Math.round((grouped.get(key).quantity + qty * measurementFactor(parsed.unit, grouped.get(key).unit)) * 1000) / 1000;
      }
    });
  });

  const requirements = [];
  grouped.forEach(entry => {
    const pantryEntry = pantryMap.get(entry.name.toLowerCase());
    let status = 'missing';
    let missingQty = entry.quantity;
    let pantryQty = 0;

    if (pantryEntry) {
      pantryQty = Number(pantryEntry.quantity) || 0;
      const factor = measurementFactor(pantryEntry.unit, entry.unit);
      if (factor !== null) {
        pantryQty *= factor;
        missingQty = Math.max(0, Math.round((entry.quantity - pantryQty) * 1000) / 1000);
        status = missingQty <= 0 ? 'available' : 'insufficient';
      } else {
        status = 'incomparable'; missingQty = 0;
      }
    }

    requirements.push({
      ingredient: { id: 0, name: entry.name },
      required_quantity: entry.quantity,
      unit: entry.unit || '',
      pantry_quantity: pantryQty,
      pantry_comparable: status !== 'incomparable',
      missing_quantity: missingQty,
      status,
    });
  });

  if (!addToList) {
    View.renderGeneratePreview(requirements, true);
    return { requirements, addedCount: 0 };
  }

  let addedCount = 0;
  for (const req of requirements) {
    if (req.status === 'available' || req.missing_quantity <= 0) continue;
    await apiFetch('/api/grocery-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: req.ingredient.name,
        quantity: req.missing_quantity,
        unit: req.unit || null,
        purchased: false,
      }),
    });
    addedCount++;
  }
  return { requirements, addedCount };
}

async function openGenerateGroceryModal() {
  if (!recipes || recipes.length === 0) {
    try {
      const data = await apiFetch('/api/recipes');
      recipes = Array.isArray(data) ? data : (data && Array.isArray(data.recipes) ? data.recipes : []);
    } catch (_) {
      // Continue with empty list
    }
  }
  View.openGenerateGroceryModal(recipes, []);
}

async function selectUpcomingWeekRecipes() {
  try {
    const start = getTodayDateString();
    const data = await apiFetch(`/api/calendar?start=${start}&days=7`);
    const ids = [];
    if (data && Array.isArray(data.days)) {
      data.days.forEach(day => {
        if (Array.isArray(day.meals)) {
          day.meals.forEach(meal => {
            if (meal && meal.recipe_id) ids.push(Number(meal.recipe_id));
          });
        }
      });
    }
    if (ids.length === 0) {
      View.showToast('No meals planned for the upcoming 7 days.');
      return;
    }
    View.renderGenerateRecipeList(recipes, ids);
    View.showToast(`Selected ${ids.length} planned meal${ids.length === 1 ? '' : 's'} from the upcoming week.`);
  } catch (err) {
    View.showToast('Could not load upcoming week: ' + err.message);
  }
}

function clearGenerateRecipeSelection() {
  View.renderGenerateRecipeList(recipes, []);
  const previewSection = document.getElementById('generate-preview-section');
  if (previewSection) previewSection.style.display = 'none';
}

async function runGenerateGrocery(addToList) {
  if (isGeneratingGrocery) return;
  const recipeIds = View.readGenerateSelectedRecipeIds();
  if (recipeIds.length === 0) {
    View.showToast('Select at least one recipe.');
    return;
  }

  isGeneratingGrocery = true;
  try {
    const data = await apiFetch('/api/grocery-list/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipe_ids: recipeIds,
        add_to_list: Boolean(addToList),
      }),
    });

    if (!addToList) {
      View.renderGeneratePreview((data && data.requirements) || [], false);
      return;
    }

    const added = (data && Array.isArray(data.added)) ? data.added : [];
    View.closeGenerateGroceryModal();
    await loadGroceryItems();
    if (added.length > 0) {
      View.showToast(`Added ${added.length} missing item${added.length === 1 ? '' : 's'} to your grocery list!`);
    } else {
      View.showToast('All required ingredients are already in your pantry!');
    }
  } catch (err) {
    if (err.message && err.message.includes('without quantity or unit')) {
      try {
        const uniqueIds = [...new Set(recipeIds)];
        const structuredSet = new Set();
        for (const id of uniqueIds) {
          try {
            await apiFetch('/api/grocery-list/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ recipe_ids: [id], add_to_list: false }),
            });
            structuredSet.add(id);
          } catch (_) {
            // Unstructured recipe; handled by text fallback
          }
        }

        const structuredIds = recipeIds.filter(id => structuredSet.has(id));
        const unstructuredIds = recipeIds.filter(id => !structuredSet.has(id));

        let structuredReqs = [];
        let structuredAdded = 0;
        if (structuredIds.length > 0) {
          const sData = await apiFetch('/api/grocery-list/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipe_ids: structuredIds, add_to_list: Boolean(addToList) }),
          });
          structuredReqs = (sData && Array.isArray(sData.requirements)) ? sData.requirements : [];
          structuredAdded = (sData && Array.isArray(sData.added)) ? sData.added.length : 0;
        }

        let unstructuredResult = { requirements: [], addedCount: 0 };
        if (unstructuredIds.length > 0) {
          // Pass addToList=false first if we only want preview, otherwise add missing items
          unstructuredResult = await generateGroceryFallbackFromText(unstructuredIds, 1, Boolean(addToList));
        }

        if (!addToList) {
          const combined = [...structuredReqs, ...unstructuredResult.requirements];
          View.renderGeneratePreview(combined, unstructuredIds.length > 0);
          return;
        }

        const totalAdded = structuredAdded + unstructuredResult.addedCount;
        View.closeGenerateGroceryModal();
        await loadGroceryItems();
        if (totalAdded > 0) {
          View.showToast(`Added ${totalAdded} item${totalAdded === 1 ? '' : 's'} to your grocery list!`);
        } else {
          View.showToast('All ingredients are already covered by your pantry!');
        }
        return;
      } catch (fallbackErr) {
        View.showToast('Could not generate grocery list: ' + fallbackErr.message);
        return;
      }
    }
    View.showToast('Could not generate grocery list: ' + err.message);
  } finally {
    isGeneratingGrocery = false;
  }
}

async function generateGroceryFromDetail() {
  if (isGeneratingGrocery) return;
  const recipeId = Number(View.getDetailRecipeId());
  if (!Number.isInteger(recipeId) || recipeId < 1) return;

  const scale = View.getDetailScale();
  const isWholeScale = Number.isInteger(scale) && scale >= 1;
  const recipeIds = isWholeScale ? Array(scale).fill(recipeId) : [recipeId];

  isGeneratingGrocery = true;
  try {
    if (isWholeScale) {
      const data = await apiFetch('/api/grocery-list/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipe_ids: recipeIds,
          add_to_list: true,
        }),
      });

      const added = (data && Array.isArray(data.added)) ? data.added : [];
      if (added.length > 0) {
        View.showToast(`Added ${added.length} missing item${added.length === 1 ? '' : 's'} (${scale}x) to grocery list!`);
      } else {
        View.showToast('All required ingredients are already in your pantry!');
      }
    } else {
      // Fractional scale (e.g. 0.5x, 1.5x): compute requirements and add scaled missing quantities
      const data = await apiFetch('/api/grocery-list/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipe_ids: [recipeId],
          add_to_list: false,
        }),
      });
      const reqs = (data && Array.isArray(data.requirements)) ? data.requirements : [];
      let addedCount = 0;
      for (const req of reqs) {
        const scaledReq = Math.round(Number(req.required_quantity) * scale * 100) / 100;
        const missing = req.pantry_comparable
          ? Math.max(0, Math.round((scaledReq - Number(req.pantry_quantity)) * 100) / 100)
          : 0;
        if (missing <= 0 || req.status === 'incomparable') continue;
        await apiFetch('/api/grocery-list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ingredient_id: req.ingredient.id,
            name: req.ingredient.name,
            quantity: missing,
            unit: req.unit || null,
            purchased: false,
          }),
        });
        addedCount++;
      }
      if (addedCount > 0) {
        View.showToast(`Added ${addedCount} missing item${addedCount === 1 ? '' : 's'} (${scale}x) to grocery list!`);
      } else {
        View.showToast('All required ingredients are already in your pantry!');
      }
    }
  } catch (err) {
    if (err.message && err.message.includes('without quantity or unit')) {
      try {
        const result = await generateGroceryFallbackFromText([recipeId], scale, true);
        if (result.addedCount > 0) {
          View.showToast(`Added ${result.addedCount} item${result.addedCount === 1 ? '' : 's'} (${scale}x) from recipe text!`);
        } else {
          View.showToast('All ingredients are already covered by your pantry!');
        }
        return;
      } catch (fallbackErr) {
        View.showToast('Could not add missing ingredients: ' + fallbackErr.message);
        return;
      }
    }
    View.showToast('Could not add missing ingredients: ' + err.message);
  } finally {
    isGeneratingGrocery = false;
  }
}

// ── Bind event handlers to window for inline HTML attributes ───────
Object.assign(window, {
  navigateTo,
  showCalendar,
  showRecipes,
  showGrocery,
  showPantry,
  handleSearch,
  openModal: View.openModal,
  closeModal: View.closeModal,
  submitRecipe,
  openEditModal: openStructuredEdit,
  removeRecipe,
  editFromDetail,
  openDetailModal: (id) => View.openDetailModal(id, recipes, monthMealsByDate[selectedDate] || {}),
  closeDetailModal: View.closeDetailModal,
  backdropClick: View.backdropClick,
  backdropDetailClick: View.backdropDetailClick,
  backdropMealClick: View.backdropMealClick,
  openMealSelector,
  handleMealRecipeSearch,
  selectRecipeForMeal,
  removeMeal,
  closeMealModal: View.closeMealModal,
  changeMonth,
  goToToday,
  selectCalendarDay,
  closeDayMealsModal: View.closeDayMealsModal,
  backdropDayMealsClick: View.backdropDayMealsClick,
  openGroceryModal: View.openGroceryModal,
  closeGroceryModal: View.closeGroceryModal,
  backdropGroceryClick: View.backdropGroceryClick,
  submitGroceryItem,
  toggleGroceryItem,
  removeGroceryItem,
  clearPurchasedGroceryItems,
  movePurchasedToPantry,
  setGroceryFilter,
  handleGrocerySearch,
  openPantryModal,
  openEditPantryModal: (id) => View.openEditPantryModal(id, pantryItems),
  closePantryModal: View.closePantryModal,
  backdropPantryClick: View.backdropPantryClick,
  handlePantryNameInput,
  submitPantryItem,
  adjustPantryQuantity,
  depletePantryItem,
  setPantryFilter,
  handlePantrySearch,
  setDetailScale: View.setDetailScale,
  adjustDetailScale: View.adjustDetailScale,
  setCalendarMode,
  stepCalendarPeriod,
  openMealSelectorForDate,
  openDetailModalForDate,
  removeMealOnDate,
  openRescheduleModal,
  openRescheduleForDate,
  closeRescheduleModal: View.closeRescheduleModal,
  backdropRescheduleClick: View.backdropRescheduleClick,
  submitRescheduleMeal,
  openGenerateGroceryModal,
  closeGenerateGroceryModal: View.closeGenerateGroceryModal,
  backdropGenerateGroceryClick: View.backdropGenerateGroceryClick,
  selectUpcomingWeekRecipes,
  clearGenerateRecipeSelection,
  runGenerateGrocery,
  generateGroceryFromDetail,
});

// ── Keyboard shortcuts ────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const rescheduleModal = document.getElementById('reschedule-modal-backdrop');
    if (rescheduleModal && rescheduleModal.style.display !== 'none') {
      View.closeRescheduleModal();
      return;
    }
    const genGroceryModal = document.getElementById('generate-grocery-modal-backdrop');
    if (genGroceryModal && genGroceryModal.style.display !== 'none') {
      View.closeGenerateGroceryModal();
      return;
    }
    const pantryModal = document.getElementById('pantry-modal-backdrop');
    if (pantryModal && pantryModal.style.display !== 'none') {
      View.closePantryModal();
      return;
    }
    const groceryModal = document.getElementById('grocery-modal-backdrop');
    if (groceryModal && groceryModal.style.display !== 'none') {
      View.closeGroceryModal();
      return;
    }
    const mealModal = document.getElementById('meal-modal-backdrop');
    if (mealModal && mealModal.style.display !== 'none') {
      View.closeMealModal();
      return;
    }
    const detailModal = document.getElementById('detail-backdrop');
    if (detailModal && detailModal.style.display !== 'none') {
      View.closeDetailModal();
      return;
    }
    const recipeModal = document.getElementById('modal-backdrop');
    if (recipeModal && recipeModal.style.display !== 'none') {
      View.closeModal();
      return;
    }
    const dayModal = document.getElementById('day-meals-backdrop');
    if (dayModal && dayModal.style.display !== 'none') {
      View.closeDayMealsModal();
    }
  }
});

// ── Init ──────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    loadRecipes();
    loadCalendar();
  });
} else {
  loadRecipes();
  loadCalendar();
}

async function openStructuredEdit(id) {
  try {
    const data = await apiFetch(`/api/recipes/${id}/ingredients`);
    View.openEditModal(id, recipes, data.ingredients || []);
  } catch (err) { View.showToast('Could not load recipe ingredients: ' + err.message); }
}
document.getElementById('add-ingredient-row').addEventListener('click', () => View.addRecipeIngredientRow());

const measurementUnits = {"g": ["mass", 1.0], "gram": ["mass", 1.0], "grams": ["mass", 1.0], "kg": ["mass", 1000.0], "kilogram": ["mass", 1000.0], "kilograms": ["mass", 1000.0], "mg": ["mass", 0.001], "oz": ["mass", 28.349523125], "ounce": ["mass", 28.349523125], "ounces": ["mass", 28.349523125], "lb": ["mass", 453.59237], "lbs": ["mass", 453.59237], "pound": ["mass", 453.59237], "pounds": ["mass", 453.59237], "ml": ["volume", 1.0], "milliliter": ["volume", 1.0], "milliliters": ["volume", 1.0], "l": ["volume", 1000.0], "liter": ["volume", 1000.0], "liters": ["volume", 1000.0], "tsp": ["volume", 4.92892159375], "teaspoon": ["volume", 4.92892159375], "teaspoons": ["volume", 4.92892159375], "tbsp": ["volume", 14.78676478125], "tablespoon": ["volume", 14.78676478125], "tablespoons": ["volume", 14.78676478125], "cup": ["volume", 236.5882365], "cups": ["volume", 236.5882365], "each": ["count", 1.0], "ea": ["count", 1.0], "piece": ["count", 1.0], "pieces": ["count", 1.0], "whole": ["count", 1.0], "pcs": ["count", 1.0], "pc": ["count", 1.0], "count": ["count", 1.0]};
function measurementFactor(from,to) { const a=(from||"each").trim().toLowerCase(), b=(to||"each").trim().toLowerCase(); if(a===b)return 1; const x=measurementUnits[a],y=measurementUnits[b]; return x&&y&&x[0]===y[0]?x[1]/y[1]:null; }

function refreshRecipeFilters(){
 for(const [id,key,title] of [['recipe-category-filter','category','All categories'],['recipe-tag-filter','tags','All tags'],['recipe-diet-filter','dietary','All diets']]){
 const el=document.getElementById(id); if(!el)continue; const old=el.value;
 const vals=[...new Set(recipes.flatMap(r=>key==='category'?[r[key]||'']:(r[key]||'').split(',')).map(v=>v.trim().toLowerCase()).filter(Boolean))].sort();
 el.replaceChildren(new Option(title,''),...vals.map(v=>new Option(v,v))); if(vals.includes(old))el.value=old;
 }
}
for(const id of ['recipe-category-filter','recipe-tag-filter','recipe-diet-filter']) document.getElementById(id)?.addEventListener('change',()=>handleSearch(document.getElementById('search-input').value));
