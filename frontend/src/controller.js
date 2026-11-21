// ── controller.js — Event handlers & API calls (Controller layer) ─

import * as View from './view.js';
import { assessRecipeAvailability, buildShoppingList } from './shopping-list.js';
import { formatRecipeIngredient } from './measurements.js';

// ── State and application coordination (Controller layer) ─────────
let recipes             = [];
let pantryItems         = [];
let pantryLoaded        = false;
let pantryUnitSystem    = localStorage.getItem('pantry-unit-system') === 'us' ? 'us' : 'metric';
let calendarDays        = [];
let calendarMonth       = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let activeMealType      = '';
let activeMealDate      = '';
let searchRequestId     = 0;
let mealSearchRequestId = 0;
let calendarRequestId   = 0;
let shoppingSummaryRequestId = 0;
let pantryRequestId = 0;
// Request IDs prevent stale asynchronous responses from overwriting newer state.

function showErrorToast(message) {
  View.showToast(message, true);
}

// ── API helper ────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  // Centralize HTTP error handling so callers can focus on state updates.
  const res = await fetch(path, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getEditableDateBounds() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 6);
  return { start: formatDate(start), end: formatDate(end) };
}

function isEditableDate(date) {
  const bounds = getEditableDateBounds();
  return date >= bounds.start && date <= bounds.end;
}

function renderCalendar() {
  const bounds = getEditableDateBounds();
  View.renderCalendar(calendarDays, calendarMonth, bounds.start, bounds.end);
}

function renderRecipeCards(recipeList = recipes) {
  const prepared = recipeList.map(recipe => ({
    ...recipe,
    availability: pantryLoaded
      ? assessRecipeAvailability(recipe.ingredients, pantryItems)
      : { status: 'unknown', label: 'Checking pantry' },
  }));
  View.render(prepared);
}

function refreshRecipeCards() {
  const searchInput = document.getElementById('search-input');
  if (searchInput && searchInput.value.trim()) {
    handleSearch(searchInput.value);
  } else {
    renderRecipeCards();
  }
}

function changeCalendarMonth(offset) {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + offset, 1);
  calendarDays = [];
  renderCalendar();
  loadCalendar();
}

function goToCurrentMonth() {
  const today = new Date();
  calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  calendarDays = [];
  renderCalendar();
  loadCalendar();
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
      renderRecipeCards();
    }
  } catch (err) {
    showErrorToast('Could not load recipes: ' + err.message);
  }
}

// ── Load calendar ─────────────────────────────────────────────────
async function loadCalendar() {
  const requestId = ++calendarRequestId;
  try {
    const start = formatDate(calendarMonth);
    const days = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
    const data = await apiFetch(`/api/calendar?start=${start}&days=${days}`);
    if (requestId !== calendarRequestId) return;
    calendarDays = data && Array.isArray(data.days) ? data.days : [];
    renderCalendar();
  } catch (err) {
    if (requestId === calendarRequestId) {
      showErrorToast('Could not load calendar: ' + err.message);
    }
  }
}

async function loadShoppingSummary() {
  const requestId = ++shoppingSummaryRequestId;
  const bounds = getEditableDateBounds();
  try {
    const [calendarData, pantryData] = await Promise.all([
      apiFetch(`/api/calendar?start=${bounds.start}&days=7`),
      apiFetch('/api/pantry'),
    ]);
    if (requestId !== shoppingSummaryRequestId) return;
    pantryItems = Array.isArray(pantryData) ? pantryData : [];
    pantryLoaded = true;
    refreshRecipeCards();
    const days = calendarData && Array.isArray(calendarData.days) ? calendarData.days : [];
    View.renderShoppingSummary(buildShoppingList(days, pantryItems));
  } catch (err) {
    if (requestId === shoppingSummaryRequestId) {
      showErrorToast('Could not load shopping list: ' + err.message);
    }
  }
}

async function loadPantry() {
  const requestId = ++pantryRequestId;
  try {
    const data = await apiFetch('/api/pantry');
    if (requestId !== pantryRequestId) return;
    pantryItems = Array.isArray(data) ? data : [];
    pantryLoaded = true;
    renderPantry();
    refreshRecipeCards();
  } catch (err) {
    if (requestId === pantryRequestId) {
      showErrorToast('Could not load pantry: ' + err.message);
    }
  }
}

function renderPantry() {
  View.renderPantry(pantryItems, pantryUnitSystem);
}

async function submitPantryItem(e) {
  e.preventDefault();
  const form = e.currentTarget && e.currentTarget !== document ? e.currentTarget : e.target;
  const ingredient = form.elements.ingredient.value.trim();
  if (!ingredient) {
    showErrorToast('Enter an ingredient to add it to your pantry.');
    return;
  }

  try {
    const created = await apiFetch('/api/pantry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ingredient,
        quantity: Number(form.elements.quantity.value),
        unit: form.elements.unit.value,
      }),
    });
    pantryRequestId += 1;
    pantryItems.push(created);
    pantryLoaded = true;
    form.reset();
    renderPantry();
    refreshRecipeCards();
    loadShoppingSummary();
    form.elements.ingredient.focus();
    View.showToast(`"${created.ingredient}" added to your pantry.`);
  } catch (err) {
    showErrorToast('Could not add pantry item: ' + err.message);
  }
}

async function updatePantryItem(e, id) {
  e.preventDefault();
  const form = e.currentTarget && e.currentTarget !== document ? e.currentTarget : e.target;
  try {
    const updated = await apiFetch(`/api/pantry/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quantity: Number(form.elements.quantity.value),
        unit: form.elements.unit.value,
      }),
    });
    pantryRequestId += 1;
    pantryItems = pantryItems.map(item => item.id === updated.id ? updated : item);
    pantryLoaded = true;
    renderPantry();
    refreshRecipeCards();
    loadShoppingSummary();
    View.showToast(`Updated "${updated.ingredient}".`);
  } catch (err) {
    showErrorToast('Could not update pantry quantity: ' + err.message);
  }
}

async function removePantryItem(id) {
  try {
    await apiFetch(`/api/pantry/${id}`, { method: 'DELETE' });
    pantryRequestId += 1;
    pantryItems = pantryItems.filter(item => item.id !== Number(id));
    pantryLoaded = true;
    renderPantry();
    refreshRecipeCards();
    loadShoppingSummary();
    View.showToast('Ingredient removed from your pantry.');
  } catch (err) {
    showErrorToast('Could not remove pantry item: ' + err.message);
  }
}

function setPantryUnitSystem(system) {
  if (system !== 'metric' && system !== 'us') return;
  pantryUnitSystem = system;
  localStorage.setItem('pantry-unit-system', system);
  renderPantry();
}

function readRecipeForm() {
  const editId = document.getElementById('modal-edit-id').value;
  const name = document.getElementById('f-name').value.trim();
  const ingredients = [];
  const rows = document.querySelectorAll('#f-ingredients-list .recipe-ingredient-row');
  for (const row of rows) {
    const ingredient = row.querySelector('[data-ingredient]').value.trim();
    const quantity = row.querySelector('[data-quantity]').value.trim();
    const unit = row.querySelector('[data-unit]').value;
    if (!ingredient) {
      if (quantity) return { error: 'Enter an ingredient for each quantity.' };
      continue;
    }
    if (quantity && (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0)) {
      return { error: 'Ingredient quantities must be greater than zero.' };
    }
    ingredients.push(formatRecipeIngredient(ingredient, quantity, unit));
  }
  const instructions = document.getElementById('f-instructions').value
    .split('\n').map(value => value.trim()).filter(Boolean);
  return { editId, payload: { name, ingredients, instructions } };
}

// ── Submit add or edit ────────────────────────────────────────────
async function submitRecipe(e) {
  e.preventDefault();

  const formData = readRecipeForm();
  if (formData.error) {
    showErrorToast(formData.error);
    return;
  }
  const { editId, payload } = formData;

  try {
    if (editId) {
      // Edit existing recipe
      const updated = await apiFetch(`/api/recipes/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      recipes = recipes.map(r => r.id === updated.id ? updated : r);
      loadShoppingSummary();
      View.closeModal();
      const searchInput = document.getElementById('search-input');
      if (searchInput && searchInput.value.trim()) {
        handleSearch(searchInput.value);
      } else {
        renderRecipeCards();
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
        renderRecipeCards();
      }
      View.showToast(`"${created.name}" added!`);
    }
  } catch (err) {
    showErrorToast('Could not save recipe: ' + err.message);
  }
}

// ── Remove recipe ─────────────────────────────────────────────────
async function removeRecipe(id) {
  if (!View.animateRecipeRemoval(id)) return;

  try {
    await apiFetch(`/api/recipes/${id}`, { method: 'DELETE' });
    setTimeout(() => {
      recipes = recipes.filter(r => r.id !== Number(id));
      loadShoppingSummary();
      const searchInput = document.getElementById('search-input');
      if (searchInput && searchInput.value.trim()) {
        handleSearch(searchInput.value);
      } else {
        renderRecipeCards();
      }
      loadCalendar();
      View.showToast('Recipe removed.');
    }, 200);
  } catch (err) {
    View.restoreRecipeCard(id);
    showErrorToast('Could not remove recipe: ' + err.message);
  }
}

// ── Edit button from detail modal ─────────────────────────────────
function editFromDetail() {
  const id = View.getDetailRecipeId();
  View.closeDetailModal();
  View.openEditModal(id, recipes);
}

// ── Search in Recipes ─────────────────────────────────────────────
async function handleSearch(val) {
  const query = val.trim();
  const requestId = ++searchRequestId;

  if (!query) {
    renderRecipeCards();
    return;
  }

  try {
    const data = await apiFetch(`/api/recipes/search?q=${encodeURIComponent(query)}`);
    if (requestId !== searchRequestId) return;
    const results = Array.isArray(data) ? data : (data && Array.isArray(data.recipes) ? data.recipes : []);
    renderRecipeCards(results);
  } catch (err) {
    if (requestId !== searchRequestId) return;
    showErrorToast('Could not search recipes: ' + err.message);
  }
}

// ── Page navigation ───────────────────────────────────────────────
function navigateTo(page) {
  const isRecipes = page === 'recipes';
  const isCalendar = page === 'calendar';
  const isPantry = page === 'pantry';
  View.navigateTo(page);

  if (isCalendar) {
    loadCalendar();
    loadShoppingSummary();
  }
  if (isPantry) loadPantry();

  window.scrollTo(0, 0);
}

function showCalendar() {
  navigateTo('calendar');
}

function showRecipes() {
  navigateTo('recipes');
}

// ── Calendar meal selector & assignment ───────────────────────────
async function openMealSelector(mealType, date) {
  if (!isEditableDate(date) || !calendarDays.some(day => day.date === date)) {
    showErrorToast('Only the next seven days, including today, can be edited.');
    return;
  }
  activeMealType = mealType;
  activeMealDate = date;
  if (!recipes || recipes.length === 0) {
    try {
      const data = await apiFetch('/api/recipes');
      recipes = Array.isArray(data) ? data : (data && Array.isArray(data.recipes) ? data.recipes : []);
    } catch (_) {
      // Continue with empty list if fails
    }
  }
  View.openMealSelectorModal(mealType, recipes);
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
    showErrorToast('Could not search recipes: ' + err.message);
  }
}

async function selectRecipeForMeal(recipeId) {
  const mealType = activeMealType || document.getElementById('selected-meal-type').value;
  if (!mealType || !isEditableDate(activeMealDate)) {
    showErrorToast('Only the next seven days, including today, can be edited.');
    return;
  }
  const day = calendarDays.find(calendarDay => calendarDay.date === activeMealDate);
  if (!day) {
    showErrorToast('Could not assign meal: the selected date is not in the displayed month.');
    return;
  }

  const payload = {
    date: activeMealDate,
    meal_type: mealType,
    recipe_id: Number(recipeId),
  };

  try {
    const updated = await apiFetch('/api/calendar/meals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    day.meals = Array.isArray(day.meals) ? day.meals : [];
    day.meals = day.meals.filter(meal => meal.meal_type !== mealType);
    day.meals.push(updated);
    View.closeMealModal();
    renderCalendar();
    loadShoppingSummary();
    const recipeName = (updated && updated.recipe && updated.recipe.name) ? updated.recipe.name : 'Recipe';
    const displayType = mealType.charAt(0).toUpperCase() + mealType.slice(1);
    View.showToast(`"${recipeName}" assigned to ${displayType}!`);
  } catch (err) {
    showErrorToast('Could not assign meal: ' + err.message);
  }
}

async function removeMeal(mealType, date) {
  if (!isEditableDate(date)) {
    showErrorToast('Only the next seven days, including today, can be edited.');
    return;
  }
  const day = calendarDays.find(calendarDay => calendarDay.date === date);
  if (!day) {
    showErrorToast('Could not remove meal: the selected date is not in the displayed month.');
    return;
  }
  try {
    await apiFetch(`/api/calendar/meals?date=${date}&meal_type=${mealType}`, {
      method: 'DELETE',
    });
    day.meals = (day.meals || []).filter(meal => meal.meal_type !== mealType);
    renderCalendar();
    loadShoppingSummary();
    const displayType = mealType.charAt(0).toUpperCase() + mealType.slice(1);
    View.showToast(`Removed recipe from ${displayType}.`);
  } catch (err) {
    showErrorToast('Could not remove meal: ' + err.message);
  }
}

// ── Bind event handlers to window for inline HTML attributes ───────
Object.assign(window, {
  navigateTo,
  showCalendar,
  showRecipes,
  changeCalendarMonth,
  goToCurrentMonth,
  handleSearch,
  openModal: View.openModal,
  closeModal: View.closeModal,
  submitRecipe,
  submitPantryItem,
  updatePantryItem,
  removePantryItem,
  setPantryUnitSystem,
  openEditModal: (id) => View.openEditModal(id, recipes),
  removeRecipe,
  editFromDetail,
  openDetailModal: (id) => View.openDetailModal(id, recipes, calendarDays),
  closeDetailModal: View.closeDetailModal,
  backdropClick: View.backdropClick,
  backdropDetailClick: View.backdropDetailClick,
  backdropMealClick: View.backdropMealClick,
  openMealSelector,
  handleMealRecipeSearch,
  selectRecipeForMeal,
  removeMeal,
  closeMealModal: View.closeMealModal,
  addRecipeIngredientRow: View.addRecipeIngredientRow,
  removeRecipeIngredientRow: View.removeRecipeIngredientRow,
  dismissToast: View.dismissToast,
});

View.bindViewEvents({
  navigateTo,
  changeCalendarMonth,
  goToCurrentMonth,
  openModal: View.openModal,
  closeModal: View.closeModal,
  closeDetailModal: View.closeDetailModal,
  submitRecipe,
  submitPantryItem,
  updatePantryItem,
  removePantryItem,
  setPantryUnitSystem,
  openDetailModal: (id) => View.openDetailModal(id, recipes, calendarDays),
  removeRecipe,
  editFromDetail,
  openMealSelector,
  removeMeal,
  closeMealModal: View.closeMealModal,
  selectRecipeForMeal,
  createRecipeModal: View.openModal,
  addRecipeIngredientRow: View.addRecipeIngredientRow,
  removeRecipeIngredientRow: View.removeRecipeIngredientRow,
  dismissToast: View.dismissToast,
  handleSearch,
  handleMealRecipeSearch,
  backdropClick: View.backdropClick,
  backdropDetailClick: View.backdropDetailClick,
  backdropMealClick: View.backdropMealClick,
});

// ── Keyboard shortcuts ────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    View.closeModal();
    View.closeDetailModal();
    View.closeMealModal();
  }
});

// ── Init ──────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    loadRecipes();
    loadCalendar();
    loadPantry();
  });
} else {
  loadRecipes();
  loadCalendar();
  loadPantry();
}
