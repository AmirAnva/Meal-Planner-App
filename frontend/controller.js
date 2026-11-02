// ── controller.js — Event handlers & API calls (Controller layer) ─

const API_BASE = 'http://localhost:8080';

// ── State ─────────────────────────────────────────────────────────
let recipes     = [];
let searchQuery = '';
let calendarDays = [];
let calendarStart = new Date();

// ── API helper ────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const res = await fetch(API_BASE + path, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── Load recipes ──────────────────────────────────────────────────
async function loadRecipes() {
  try {
    const data = await apiFetch('/api/recipes');
    recipes = Array.isArray(data) ? data : (data && Array.isArray(data.recipes) ? data.recipes : []);
    render();
  } catch (err) {
    showToast('Could not load recipes: ' + err.message);
  }
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function loadCalendar() {
  try {
    calendarStart = new Date();
    const data = await apiFetch(`/api/calendar?start=${formatDate(calendarStart)}&days=7`);
    calendarDays = data.days || [];
    renderCalendar();
  } catch (err) {
    showToast('Could not load calendar: ' + err.message);
  }
}

async function assignMeal(date, mealType, recipeId) {
  try {
    if (!recipeId) {
      await apiFetch(`/api/calendar/meals?date=${date}&meal_type=${mealType}`, { method: 'DELETE' });
    } else {
      await apiFetch('/api/calendar/meals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, meal_type: mealType, recipe_id: Number(recipeId) }),
      });
    }
    await loadCalendar();
  } catch (err) {
    if (!recipeId && err.message === 'meal not found') return;
    showToast('Could not update meal: ' + err.message);
  }
}

function showCalendar() {
  setActiveView('calendar');
  loadCalendar();
}

function showRecipes() {
  setActiveView('recipes');
}

// ── Submit add or edit ────────────────────────────────────────────
async function submitRecipe(e) {
  e.preventDefault();

  const { editId, payload } = readRecipeForm();

  try {
    if (editId) {
      // Edit existing recipe
      const updated = await apiFetch(`/api/recipes/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      recipes = recipes.map(r => r.id === updated.id ? updated : r);
      closeModal();
      render();
      showToast(`"${updated.name}" updated!`);
    } else {
      // Create new recipe
      const created = await apiFetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      recipes.push(created);
      closeModal();
      render();
      showToast(`"${created.name}" added!`);
    }
  } catch (err) {
    showToast('Could not save recipe: ' + err.message);
  }
}

// ── Remove recipe ─────────────────────────────────────────────────
async function removeRecipe(id) {
  if (!animateRecipeRemoval(id)) return;

  try {
    await apiFetch(`/api/recipes/${id}`, { method: 'DELETE' });
    recipes = recipes.filter(r => r.id !== Number(id));
    render();
    showToast('Recipe removed.');
  } catch (err) {
    restoreRecipeCard(id);
    showToast('Could not remove recipe: ' + err.message);
  }
}

// ── Edit button from detail modal ─────────────────────────────────
function editFromDetail() {
  const id = getDetailRecipeId();
  closeDetailModal();
  openEditModal(id);
}

// ── Search ────────────────────────────────────────────────────────
async function handleSearch(val) {
  searchQuery = val.trim();
  try {
    const data = await apiFetch(`/api/recipes/search?q=${encodeURIComponent(searchQuery)}`);
    recipes = Array.isArray(data) ? data : [];
    render();
  } catch (err) {
    showToast('Could not search recipes: ' + err.message);
  }
}

// ── Keyboard shortcuts ────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
    closeDetailModal();
  }
});

// ── Init ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', loadRecipes);
