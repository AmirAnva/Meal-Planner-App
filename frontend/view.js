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
    document.getElementById('recipes-view').style.display = 'none';
    document.getElementById('calendar-view').style.display = 'block';
    document.getElementById('calendar-nav').classList.add('active');
    document.getElementById('recipes-nav').classList.remove('active');
    loadCalendar();
  }

  function showRecipes() {
    document.getElementById('calendar-view').style.display = 'none';
    document.getElementById('recipes-view').style.display = 'block';
    document.getElementById('calendar-nav').classList.remove('active');
    document.getElementById('recipes-nav').classList.add('active');
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
  const card = document.getElementById(`card-${id}`);
  if (!card) return;

  card.style.transition = 'opacity .2s, transform .2s';
  card.style.opacity    = '0';
  card.style.transform  = 'scale(.95)';

  try {
    await apiFetch(`/api/recipes/${id}`, { method: 'DELETE' });
    setTimeout(() => {
      recipes = recipes.filter(r => r.id !== Number(id));
      render();
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

// ── Search ────────────────────────────────────────────────────────
function handleSearch(val) {
  searchQuery = val.trim().toLowerCase();
  render();
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
