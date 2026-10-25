// ── API base URL ────────────────────────────────────────────────
const API_BASE = 'http://localhost:8080';

// ── State ───────────────────────────────────────────────────────
let recipes     = [];
let searchQuery = '';
let toastTimer;

// ── Helpers ─────────────────────────────────────────────────────
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── API helpers ─────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const res = await fetch(API_BASE + path, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  // 204 No Content has no body
  if (res.status === 204) return null;
  return res.json();
}

// ── Load recipes from backend ────────────────────────────────────
async function loadRecipes() {
  try {
    const data = await apiFetch('/api/recipes');
    // Support both direct array [] and RecipeBook object { recipes: [...] }
    recipes = Array.isArray(data) ? data : (data && Array.isArray(data.recipes) ? data.recipes : []);
    render();
  } catch (err) {
    showToast('Could not load recipes: ' + err.message);
  }
}

// ── Render ──────────────────────────────────────────────────────
function render() {
  const grid  = document.getElementById('recipe-grid');
  const empty = document.getElementById('empty-state');

  let filtered = recipes;

  if (searchQuery) {
    filtered = filtered.filter(r =>
      r.name.toLowerCase().includes(searchQuery)
    );
  }

  if (filtered.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  grid.innerHTML = filtered.map(cardHTML).join('');
}

function cardHTML(r) {
  const ingCount  = (r.ingredients && r.ingredients.length) ? r.ingredients.length : 0;
  const stepCount = (r.instructions && r.instructions.length) ? r.instructions.length : 0;

  let metaText = 'Click to view details';
  if (ingCount > 0 || stepCount > 0) {
    const parts = [];
    if (ingCount > 0) parts.push(`${ingCount} ingredient${ingCount === 1 ? '' : 's'}`);
    if (stepCount > 0) parts.push(`${stepCount} step${stepCount === 1 ? '' : 's'}`);
    metaText = parts.join(' • ');
  }

  return `
    <div class="recipe-card" id="card-${r.id}" onclick="openDetailModal(${r.id})" title="Click to view recipe details">
      <button class="card-remove" onclick="event.stopPropagation(); removeRecipe(${r.id})" title="Remove recipe">&#x2715;</button>
      <div class="card-body">
        <div class="card-name">${escapeHTML(r.name)}</div>
        <div class="card-meta">${metaText}</div>
      </div>
    </div>`;
}

// ── Add recipe modal ────────────────────────────────────────────
function openModal() {
  document.getElementById('modal-backdrop').style.display = 'flex';
  document.getElementById('f-name').focus();
}

function closeModal() {
  document.getElementById('modal-backdrop').style.display = 'none';
  document.getElementById('f-name').value         = '';
  document.getElementById('f-ingredients').value  = '';
  document.getElementById('f-instructions').value = '';
}

function backdropClick(e) {
  if (e.target === e.currentTarget) closeModal();
}

async function submitRecipe(e) {
  e.preventDefault();

  const name         = document.getElementById('f-name').value.trim();
  const ingredients  = document.getElementById('f-ingredients').value
                         .split('\n').map(s => s.trim()).filter(Boolean);
  const instructions = document.getElementById('f-instructions').value
                         .split('\n').map(s => s.trim()).filter(Boolean);

  const payload = {
    name,
    source: 'personal',
    tags: [],
    ingredients,
    instructions,
  };

  try {
    const created = await apiFetch('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    recipes.push(created);
    closeModal();
    render();
    showToast(`"${created.name}" added!`);
  } catch (err) {
    showToast('Could not add recipe: ' + err.message);
  }
}

// ── Detail modal ────────────────────────────────────────────────
function openDetailModal(id) {
  const r = recipes.find(x => x.id === Number(id));
  if (!r) return;

  document.getElementById('d-name').textContent = r.name;

  const ingredientsList = r.ingredients && r.ingredients.length
    ? `<ul class="detail-list">${r.ingredients.map(ing => `<li>${escapeHTML(ing)}</li>`).join('')}</ul>`
    : `<p class="detail-empty">No ingredients listed.</p>`;

  const instructionsList = r.instructions && r.instructions.length
    ? `<ol class="detail-list detail-instructions">${r.instructions.map(step => `<li>${escapeHTML(step)}</li>`).join('')}</ol>`
    : `<p class="detail-empty">No instructions provided.</p>`;

  document.getElementById('d-body').innerHTML = `
    <div class="detail-section">
      <h3 class="detail-section-title">Ingredients</h3>
      ${ingredientsList}
    </div>

    <div class="detail-section">
      <h3 class="detail-section-title">Instructions</h3>
      ${instructionsList}
    </div>
  `;

  document.getElementById('detail-backdrop').style.display = 'flex';
}

function closeDetailModal() {
  const backdrop = document.getElementById('detail-backdrop');
  if (backdrop) backdrop.style.display = 'none';
}

function backdropDetailClick(e) {
  if (e.target === e.currentTarget) closeDetailModal();
}

// ── Remove recipe ───────────────────────────────────────────────
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
    // Restore card if the delete failed
    card.style.opacity   = '1';
    card.style.transform = 'scale(1)';
    showToast('Could not remove recipe: ' + err.message);
  }
}

// ── Search ──────────────────────────────────────────────────────
function handleSearch(val) {
  searchQuery = val.trim().toLowerCase();
  render();
}

// ── Toast ───────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

// ── Keyboard ────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
    closeDetailModal();
  }
});

// ── Init ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', loadRecipes);