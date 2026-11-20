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

// ── Load recipes ──────────────────────────────────────────────────
async function loadRecipes() {
  try {
    const data = await apiFetch('/api/recipes');
    recipes = Array.isArray(data) ? data : (data && Array.isArray(data.recipes) ? data.recipes : []);
    const searchInput = document.getElementById('search-input');
    if (searchInput && searchInput.value.trim()) {
      handleSearch(searchInput.value);
    } else {
      View.render(recipes);
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
      monthMealsByDate
    });

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

  const { editId, payload } = View.readRecipeForm();

  try {
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
        View.render(recipes);
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
        View.render(recipes);
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
        View.render(recipes);
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
    View.render(recipes);
    return;
  }

  try {
    const data = await apiFetch(`/api/recipes/search?q=${encodeURIComponent(query)}`);
    if (requestId !== searchRequestId) return;
    const results = Array.isArray(data) ? data : (data && Array.isArray(data.recipes) ? data.recipes : []);
    View.render(results);
  } catch (err) {
    if (requestId !== searchRequestId) return;
    View.showToast('Could not search recipes: ' + err.message);
  }
}

// ── Page navigation ───────────────────────────────────────────────
function navigateTo(page) {
  const isRecipes = page === 'recipes';

  const recipesView = document.getElementById('recipes-view');
  if (recipesView) recipesView.style.display = isRecipes ? 'block' : 'none';

  const calendarView = document.getElementById('calendar-view');
  if (calendarView) calendarView.style.display = isRecipes ? 'none' : 'block';

  document.querySelectorAll('.nav-item').forEach(link => {
    link.classList.toggle(
      'active',
      link.dataset.page === page || (isRecipes && link.id === 'recipes-nav') || (!isRecipes && link.id === 'calendar-nav')
    );
  });

  if (!isRecipes) {
    loadCalendar(currentYear, currentMonth);
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
  });
} else {
  loadRecipes();
  loadCalendar();
}
