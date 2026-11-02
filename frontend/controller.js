// ── controller.js — Event handlers & API calls (Controller layer) ─

const API_BASE = 'http://localhost:8080';

// ── State ─────────────────────────────────────────────────────────
let recipes         = [];
let calendarMeals   = {};
let activeMealType  = '';
let mealSearchQuery = '';
let searchRequestId = 0;

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

function getTodayDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
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
      render(recipes, false);
    }
  } catch (err) {
    showToast('Could not load recipes: ' + err.message);
  }
}

// ── Load calendar ─────────────────────────────────────────────────
async function loadCalendar() {
  try {
    const today = getTodayDateString();
    const data = await apiFetch(`/api/calendar?date=${today}`);
    calendarMeals = {};
    if (data && Array.isArray(data.meals)) {
      data.meals.forEach(m => {
        calendarMeals[m.meal_type] = m;
      });
    }
    renderCalendar();
  } catch (err) {
    showToast('Could not load calendar: ' + err.message);
  }
}

// ── Submit add or edit ────────────────────────────────────────────
async function submitRecipe(e) {
  e.preventDefault();

  const editId      = document.getElementById('modal-edit-id').value;
  const name        = document.getElementById('f-name').value.trim();
  const ingredients = document.getElementById('f-ingredients').value
                        .split('\n').map(s => s.trim()).filter(Boolean);
  const instructions = document.getElementById('f-instructions').value
                        .split('\n').map(s => s.trim()).filter(Boolean);

  const payload = { name, ingredients, instructions };

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
      const searchInput = document.getElementById('search-input');
      if (searchInput && searchInput.value.trim()) {
        handleSearch(searchInput.value);
      } else {
        render(recipes, false);
      }
      loadCalendar();
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
      const searchInput = document.getElementById('search-input');
      if (searchInput && searchInput.value.trim()) {
        handleSearch(searchInput.value);
      } else {
        render(recipes, false);
      }
      showToast(`"${created.name}" added!`);
    }
  } catch (err) {
    showToast('Could not save recipe: ' + err.message);
  }
}

// ── Remove recipe ─────────────────────────────────────────────────
async function removeRecipe(id) {
  const card = document.getElementById(`card-${id}`);
  if (!card) return;

  card.style.transition = 'opacity .2s, transform .2s';
  card.style.opacity    = '0';
  card.style.transform  = 'scale(.95)';

  try {
    await apiFetch(`/api/recipes/${id}`, { method: 'DELETE' });
    setTimeout(() => {
      recipes = recipes.filter(r => r.id !== Number(id));
      const searchInput = document.getElementById('search-input');
      if (searchInput && searchInput.value.trim()) {
        handleSearch(searchInput.value);
      } else {
        render(recipes, false);
      }
      loadCalendar();
      showToast('Recipe removed.');
    }, 200);
  } catch (err) {
    card.style.opacity   = '1';
    card.style.transform = 'scale(1)';
    showToast('Could not remove recipe: ' + err.message);
  }
}

// ── Edit button from detail modal ─────────────────────────────────
function editFromDetail() {
  const id = document.getElementById('detail-recipe-id').value;
  closeDetailModal();
  openEditModal(id);
}

// ── Search in Recipes (Ingredient & Name search via backend) ──────
async function handleSearch(val) {
  const query = val.trim();
  const requestId = ++searchRequestId;

  if (!query) {
    render(recipes, false);
    return;
  }

  try {
    const data = await apiFetch(`/api/recipes/search?q=${encodeURIComponent(query)}`);
    if (requestId !== searchRequestId) return;
    const results = Array.isArray(data) ? data : (data && Array.isArray(data.recipes) ? data.recipes : []);
    render(results, true);
  } catch (err) {
    if (requestId !== searchRequestId) return;
    showToast('Could not search recipes: ' + err.message);
  }
}

// ── Page navigation ───────────────────────────────────────────────
function navigateTo(page) {
  const isRecipes = page === 'recipes';

  document.getElementById('recipes-view').style.display =
    isRecipes ? 'block' : 'none';

  document.getElementById('calendar-view').style.display =
    isRecipes ? 'none' : 'block';

  document.querySelector('.nav-search').style.display =
    isRecipes ? 'flex' : 'none';

  document.querySelectorAll('.nav-item').forEach(link => {
    link.classList.toggle(
      'active',
      link.dataset.page === page
    );
  });

  if (!isRecipes) {
    document.getElementById('calendar-date').textContent =
      new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
    loadCalendar();
  }

  window.scrollTo(0, 0);
}

// ── Calendar meal selector & assignment ───────────────────────────
async function openMealSelector(mealType) {
  activeMealType = mealType;
  mealSearchQuery = '';
  if (!recipes || recipes.length === 0) {
    try {
      const data = await apiFetch('/api/recipes');
      recipes = Array.isArray(data) ? data : (data && Array.isArray(data.recipes) ? data.recipes : []);
    } catch (_) {
      // If fetching fails, we continue with empty list
    }
  }
  openMealSelectorModal(mealType, recipes);
}

function handleMealRecipeSearch(val) {
  mealSearchQuery = val.trim().toLowerCase();
  let filtered = recipes;
  if (mealSearchQuery) {
    filtered = filtered.filter(r =>
      r.name.toLowerCase().includes(mealSearchQuery) ||
      (r.ingredients && r.ingredients.some(ing => ing.toLowerCase().includes(mealSearchQuery)))
    );
  }
  renderMealPickerList(filtered);
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
    closeMealModal();
    renderCalendar();
    const recipeName = (updated && updated.recipe && updated.recipe.name) ? updated.recipe.name : 'Recipe';
    const displayType = mealType.charAt(0).toUpperCase() + mealType.slice(1);
    showToast(`"${recipeName}" assigned to ${displayType}!`);
  } catch (err) {
    showToast('Could not assign meal: ' + err.message);
  }
}

async function removeMeal(mealType) {
  const today = getTodayDateString();
  try {
    await apiFetch(`/api/calendar/meals?date=${today}&meal_type=${mealType}`, {
      method: 'DELETE',
    });
    delete calendarMeals[mealType];
    renderCalendar();
    const displayType = mealType.charAt(0).toUpperCase() + mealType.slice(1);
    showToast(`Removed recipe from ${displayType}.`);
  } catch (err) {
    showToast('Could not remove meal: ' + err.message);
  }
}

// ── Keyboard shortcuts ────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
    closeDetailModal();
    closeMealModal();
  }
});

// ── Init ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadRecipes();
  loadCalendar();
});
