// ── controller.js — Event handlers & API calls (Controller layer) ─

import * as View from './view.js';
import { assessRecipeAvailability, buildShoppingList } from './shopping-list.js';
import {
  getEditableDateBounds,
  getMealEditWarning,
  getShoppingSummaryRange,
} from './calendar-range.js';

// ── State ─────────────────────────────────────────────────────────
let recipes             = [];
let pantryItems         = [];
let pantryLoaded        = false;
let pantryUnitSystem    = localStorage.getItem('pantry-unit-system') === 'us' ? 'us' : 'metric';
let currentYear         = new Date().getFullYear();
let currentMonth        = new Date().getMonth() + 1; // 1-12
let selectedDate        = '';
let monthMealsByDate    = {};
let activeMealType      = '';
let activeMealDate      = '';
let searchRequestId     = 0;
let mealSearchRequestId = 0;
let calendarRequestId   = 0;
let calendarAbortController = null;
let shoppingSummaryRequestId = 0;
let pantryRequestId     = 0;
let isSavingMeal        = false;
let isRemovingMeal      = false;

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
    const daysCount = new Date(year, month, 0).getDate();
    const startDate = formatDateString(year, month, 1);
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

    View.renderMonthGrid({
      year,
      month,
      selectedDate,
      monthMealsByDate,
      editableDateBounds: getEditableDateBounds(),
    });

    const selectedDayMeals = monthMealsByDate[selectedDate] || {};
    View.renderCalendar(selectedDayMeals, !getMealEditWarning(selectedDate));
    return true;
  } catch (err) {
    if (err.name === 'AbortError' || requestId !== calendarRequestId) return false;
    View.showToast('Could not load calendar: ' + err.message);
    return false;
  }
}

async function loadShoppingSummary() {
  const requestId = ++shoppingSummaryRequestId;
  const range = getShoppingSummaryRange();
  try {
    const [currentMonthData, nextMonthData, pantryData] = await Promise.all([
      apiFetch(`/api/calendar?start=${range.requests[0].start}&days=${range.requests[0].days}`, { cache: 'no-store' }),
      apiFetch(`/api/calendar?start=${range.requests[1].start}&days=${range.requests[1].days}`, { cache: 'no-store' }),
      apiFetch('/api/pantry-items', { cache: 'no-store' }),
    ]);
    if (requestId !== shoppingSummaryRequestId) return;
    pantryItems = Array.isArray(pantryData) ? pantryData : [];
    pantryLoaded = true;
    refreshRecipeCards();
    const days = [
      ...(currentMonthData && Array.isArray(currentMonthData.days) ? currentMonthData.days : []),
      ...(nextMonthData && Array.isArray(nextMonthData.days) ? nextMonthData.days : []),
    ];
    View.renderShoppingSummary(buildShoppingList(days, pantryItems), range.start, range.end);
  } catch (err) {
    if (requestId === shoppingSummaryRequestId) {
      View.showToast('Could not load shopping list: ' + err.message);
    }
  }
}

async function loadPantry() {
  const requestId = ++pantryRequestId;
  try {
    const data = await apiFetch('/api/pantry-items');
    if (requestId !== pantryRequestId) return;
    pantryItems = Array.isArray(data) ? data : [];
    pantryLoaded = true;
    View.renderPantry(pantryItems, pantryUnitSystem);
    refreshRecipeCards();
  } catch (err) {
    if (requestId === pantryRequestId) {
      View.showToast('Could not load pantry: ' + err.message);
    }
  }
}

async function submitPantryItem(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const ingredient = form.elements.ingredient.value.trim();
  const quantity = Number(form.elements.quantity.value);
  const unit = form.elements.unit.value;
  try {
    const saved = await apiFetch('/api/pantry-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingredient, quantity, unit }),
    });
    pantryRequestId += 1;
    const existing = pantryItems.find(item => item.ingredient_id === saved.ingredient_id);
    pantryItems = existing
      ? pantryItems.map(item => item.ingredient_id === saved.ingredient_id ? saved : item)
      : [...pantryItems, saved];
    pantryLoaded = true;
    form.reset();
    View.renderPantry(pantryItems, pantryUnitSystem);
    refreshRecipeCards();
    loadShoppingSummary();
    form.elements.ingredient.focus();
    View.showToast(existing ? 'Pantry quantity updated.' : 'Ingredient added to your pantry.');
  } catch (err) {
    View.showToast('Could not add pantry item: ' + err.message);
  }
}

async function updatePantryItem(event, id) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const updated = await apiFetch(`/api/pantry-items/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quantity: Number(form.elements.quantity.value),
        unit: form.elements.unit.value,
      }),
    });
    pantryRequestId += 1;
    pantryItems = pantryItems.map(item => item.ingredient_id === updated.ingredient_id ? updated : item);
    View.renderPantry(pantryItems, pantryUnitSystem);
    refreshRecipeCards();
    loadShoppingSummary();
    View.showToast('Pantry quantity updated.');
  } catch (err) {
    View.showToast('Could not update pantry quantity: ' + err.message);
  }
}

async function removePantryItem(id) {
  try {
    await apiFetch(`/api/pantry-items/${id}`, { method: 'DELETE' });
    pantryRequestId += 1;
    pantryItems = pantryItems.filter(item => item.ingredient_id !== Number(id));
    View.renderPantry(pantryItems, pantryUnitSystem);
    refreshRecipeCards();
    loadShoppingSummary();
    View.showToast('Ingredient removed from your pantry.');
  } catch (err) {
    View.showToast('Could not remove pantry item: ' + err.message);
  }
}

function setPantryUnitSystem(system) {
  if (system !== 'metric' && system !== 'us') return;
  pantryUnitSystem = system;
  localStorage.setItem('pantry-unit-system', system);
  View.renderPantry(pantryItems, pantryUnitSystem);
}

// ── Submit add or edit ────────────────────────────────────────────
async function submitRecipe(e) {
  e.preventDefault();

  const formData = View.readRecipeForm();
  if (formData.error) {
    View.showToast(formData.error);
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
      loadShoppingSummary();
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
    View.showToast('Could not remove recipe: ' + err.message);
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
    View.showToast('Could not search recipes: ' + err.message);
  }
}

// ── Page navigation ───────────────────────────────────────────────
function navigateTo(page) {
  const views = ['recipes', 'calendar', 'pantry'];
  views.forEach(view => {
    const element = document.getElementById(`${view}-view`);
    if (element) element.style.display = page === view ? 'block' : 'none';
  });

  document.querySelectorAll('.nav-item').forEach(link => {
    link.classList.toggle('active', link.dataset.page === page);
  });

  if (page === 'calendar') {
    loadCalendar(currentYear, currentMonth);
    loadShoppingSummary();
  } else if (page === 'pantry') {
    loadPantry();
  }

  window.scrollTo(0, 0);
}

function showCalendar() {
  navigateTo('calendar');
}

function showRecipes() {
  navigateTo('recipes');
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

async function goToToday() {
  const now = new Date();
  selectedDate = getTodayDateString();
  activeMealDate = selectedDate;
  const ok = await loadCalendar(now.getFullYear(), now.getMonth() + 1);
  if (!ok) return;
  View.highlightSelectedDay(selectedDate);
  const todayMeals = monthMealsByDate[selectedDate] || {};
  View.openDayMealsModal(selectedDate, todayMeals, true);
}

function selectCalendarDay(dateStr) {
  selectedDate = dateStr;
  activeMealDate = dateStr;
  View.highlightSelectedDay(dateStr);
  const selectedDayMeals = monthMealsByDate[selectedDate] || {};
  const warning = getMealEditWarning(dateStr);
  View.openDayMealsModal(dateStr, selectedDayMeals, !warning, warning);
  if (warning) View.showToast(warning);
}

// ── Calendar meal selector & assignment ───────────────────────────
async function openMealSelector(mealType) {
  activeMealDate = selectedDate;
  const warning = getMealEditWarning(activeMealDate);
  if (warning) {
    View.showToast(warning);
    return;
  }
  activeMealType = mealType;
  if (!recipes || recipes.length === 0) {
    try {
      const data = await apiFetch('/api/recipes');
      recipes = Array.isArray(data) ? data : (data && Array.isArray(data.recipes) ? data.recipes : []);
    } catch (_) {
      // Continue with empty list if fails
    }
  }
  View.openMealSelectorModal(mealType, recipes, activeMealDate);
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
  const date = activeMealDate || selectedDate;
  const warning = getMealEditWarning(date);
  if (warning) {
    View.showToast(warning);
    return;
  }

  isSavingMeal = true;
  const payload = {
    date,
    meal_type: mealType,
    recipe_id: Number(recipeId),
  };

  try {
    const updated = await apiFetch('/api/calendar/meals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!monthMealsByDate[date]) {
      monthMealsByDate[date] = {};
    }
    monthMealsByDate[date][mealType] = updated;

    View.closeMealModal();
    View.renderCalendar(monthMealsByDate[date], !getMealEditWarning(date));
    View.updateDayCellMeals(date, monthMealsByDate[date]);
    loadShoppingSummary();

    const recipeName = (updated && updated.recipe && updated.recipe.name) ? updated.recipe.name : 'Recipe';
    const displayType = mealType.charAt(0).toUpperCase() + mealType.slice(1);
    View.showToast(`"${recipeName}" assigned to ${displayType}!`);
  } catch (err) {
    View.showToast('Could not assign meal: ' + err.message);
  } finally {
    isSavingMeal = false;
  }
}

async function removeMeal(mealType, date = activeMealDate || selectedDate) {
  if (isRemovingMeal) return;
  const warning = getMealEditWarning(date);
  if (warning) {
    View.showToast(warning);
    return;
  }
  isRemovingMeal = true;
  try {
    await apiFetch(`/api/calendar/meals?date=${date}&meal_type=${mealType}`, {
      method: 'DELETE',
    });

    if (monthMealsByDate[date]) {
      delete monthMealsByDate[date][mealType];
    }

    View.renderCalendar(monthMealsByDate[date] || {}, !getMealEditWarning(date));
    View.updateDayCellMeals(date, monthMealsByDate[date] || {});
    loadShoppingSummary();

    const displayType = mealType.charAt(0).toUpperCase() + mealType.slice(1);
    View.showToast(`Removed recipe from ${displayType}.`);
  } catch (err) {
    View.showToast('Could not remove meal: ' + err.message);
  } finally {
    isRemovingMeal = false;
  }
}

// ── Bind event handlers to window for inline HTML attributes ───────
Object.assign(window, {
  navigateTo,
  showCalendar,
  showRecipes,
  submitPantryItem,
  updatePantryItem,
  removePantryItem,
  setPantryUnitSystem,
  addRecipeIngredientRow: View.addRecipeIngredientRow,
  removeRecipeIngredientRow: View.removeRecipeIngredientRow,
  handleSearch,
  openModal: View.openModal,
  closeModal: View.closeModal,
  submitRecipe,
  openEditModal: (id) => View.openEditModal(id, recipes),
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
});

// ── Keyboard shortcuts ────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
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
    loadPantry();
    loadShoppingSummary();
  });
} else {
  loadRecipes();
  loadCalendar();
  loadPantry();
  loadShoppingSummary();
}
