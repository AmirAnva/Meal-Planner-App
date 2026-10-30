// ── controller.js — Event handlers & API calls (Controller layer) ─

const API_BASE = 'http://localhost:8080';

// ── State ─────────────────────────────────────────────────────────
let recipes     = [];
let searchQuery = '';

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
