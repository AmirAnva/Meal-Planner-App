// ── controller.js — Event handlers & API calls (Controller layer) ─

import * as View from './view.js';

// ── State ─────────────────────────────────────────────────────────
let recipes             = [];
let calendarMeals       = {};
let activeMealType      = '';
let searchRequestId     = 0;
let mealSearchRequestId = 0;

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

function getTodayDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
      View.render(recipes);
    }
  } catch (err) {
    View.showToast('Could not load recipes: ' + err.message);
  }
}

// ── Load calendar ─────────────────────────────────────────────────
async function loadCalendar() {
  try {
    const today = getTodayDateString();
    const data = await apiFetch(`/api/calendar?start=${today}&days=1`);
    calendarMeals = {};
    if (data && Array.isArray(data.days) && data.days.length > 0) {
      const todayDay = data.days[0];
      if (Array.isArray(todayDay.meals)) {
        todayDay.meals.forEach(m => {
          calendarMeals[m.meal_type] = m;
        });
      }
    } else if (data && Array.isArray(data.meals)) {
      data.meals.forEach(m => {
        calendarMeals[m.meal_type] = m;
      });
    }
    View.renderCalendar(calendarMeals);
  } catch (err) {
    View.showToast('Could not load calendar: ' + err.message);
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
    const dateElem = document.getElementById('calendar-date');
    if (dateElem) {
      dateElem.textContent = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
    }
    loadCalendar();
  }

  window.scrollTo(0, 0);
}

function showCalendar() {
  navigateTo('calendar');
}

function showRecipes() {
  navigateTo('recipes');
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
    View.showToast('Could not search recipes: ' + err.message);
  }
}

async function selectRecipeForMeal(recipeId) {
  const mealType = activeMealType || document.getElementById('selected-meal-type').value;
  if (!mealType) return;

  const payload = {
    date: getTodayDateString(),
    meal_type: mealType,
    recipe_id: Number(recipeId),
  };

  try {
    const updated = await apiFetch('/api/calendar/meals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    calendarMeals[mealType] = updated;
    View.closeMealModal();
    View.renderCalendar(calendarMeals);
    const recipeName = (updated && updated.recipe && updated.recipe.name) ? updated.recipe.name : 'Recipe';
    const displayType = mealType.charAt(0).toUpperCase() + mealType.slice(1);
    View.showToast(`"${recipeName}" assigned to ${displayType}!`);
  } catch (err) {
    View.showToast('Could not assign meal: ' + err.message);
  }
}

async function removeMeal(mealType) {
  const today = getTodayDateString();
  try {
    await apiFetch(`/api/calendar/meals?date=${today}&meal_type=${mealType}`, {
      method: 'DELETE',
    });
    delete calendarMeals[mealType];
    View.renderCalendar(calendarMeals);
    const displayType = mealType.charAt(0).toUpperCase() + mealType.slice(1);
    View.showToast(`Removed recipe from ${displayType}.`);
  } catch (err) {
    View.showToast('Could not remove meal: ' + err.message);
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
  openDetailModal: (id) => View.openDetailModal(id, recipes, calendarMeals),
  closeDetailModal: View.closeDetailModal,
  backdropClick: View.backdropClick,
  backdropDetailClick: View.backdropDetailClick,
  backdropMealClick: View.backdropMealClick,
  openMealSelector,
  handleMealRecipeSearch,
  selectRecipeForMeal,
  removeMeal,
  closeMealModal: View.closeMealModal,
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
  });
} else {
  loadRecipes();
  loadCalendar();
}
