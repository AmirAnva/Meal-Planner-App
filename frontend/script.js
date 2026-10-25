// ── API base URL ────────────────────────────────────────────────
const API_BASE = 'http://localhost:8080';

// ── State ───────────────────────────────────────────────────────
let recipes     = [];
let activeTag   = 'all';
let searchQuery = '';
let toastTimer;

// ── Emoji helper ────────────────────────────────────────────────
const TAG_EMOJIS = { breakfast: '🥣', lunch: '🥗', dinner: '🍽️', quick: '⚡', snack: '🍿' };

function emojiForTags(tags) {
  if (!tags || !tags.length) return '🍴';
  return TAG_EMOJIS[tags[0]] || '🍴';
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

  let filtered = activeTag === 'all'
    ? recipes
    : recipes.filter(r => (r.tags || []).includes(activeTag));

  if (searchQuery) {
    filtered = filtered.filter(r =>
      r.name.toLowerCase().includes(searchQuery) ||
      (r.tags || []).some(t => t.includes(searchQuery))
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
  const badgeClass = r.source === 'personal' ? 'badge-personal' : 'badge-external';
  const badgeLabel = r.source === 'personal' ? 'Personal' : 'External';
  const emoji      = r.emoji || emojiForTags(r.tags);

  const imageBlock = r.image
    ? `<img class="card-image" src="${r.image}" alt="${r.name}"
         onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" />
       <div class="card-image-placeholder" style="display:none">${emoji}</div>`
    : `<div class="card-image-placeholder">${emoji}</div>`;

  const tagList = r.tags && r.tags.length
    ? r.tags.map(t => `<span class="card-tag">${t}</span>`).join('')
    : `<span class="card-tag" style="color:#bbb">no tags</span>`;

  return `
    <div class="recipe-card" id="card-${r.id}" onclick="openDetailModal(${r.id})" title="Click to view recipe details">
      <button class="card-remove" onclick="event.stopPropagation(); removeRecipe(${r.id})" title="Remove">&#x2715;</button>
      <span class="card-badge ${badgeClass}">${badgeLabel}</span>
      ${imageBlock}
      <div class="card-body">
        <div class="card-name">${r.name}</div>
        <div class="card-tags">${tagList}</div>
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
  document.getElementById('f-image').value        = '';
  document.getElementById('f-ingredients').value  = '';
  document.getElementById('f-instructions').value = '';
  document.querySelector('input[name="source"][value="personal"]').checked = true;
  document.querySelectorAll('.modal-body input[type="checkbox"]')
    .forEach(cb => (cb.checked = false));
}

function backdropClick(e) {
  if (e.target === e.currentTarget) closeModal();
}

async function submitRecipe(e) {
  e.preventDefault();

  const name         = document.getElementById('f-name').value.trim();
  const image        = document.getElementById('f-image').value.trim();
  const source       = document.querySelector('input[name="source"]:checked').value;
  const tags         = [...document.querySelectorAll('.modal-body input[type="checkbox"]:checked')]
                         .map(cb => cb.value);
  const emoji        = emojiForTags(tags);
  const ingredients  = document.getElementById('f-ingredients').value
                         .split('\n').map(s => s.trim()).filter(Boolean);
  const instructions = document.getElementById('f-instructions').value
                         .split('\n').map(s => s.trim()).filter(Boolean);

  // Full Recipe data structure matching the Go backend model:
  // type Recipe struct { ID, Name, Image, Emoji, Source, Tags, Ingredients, Instructions }
  const payload = {
    name,
    image,
    emoji,
    source,
    tags,
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

  const emoji = r.emoji || emojiForTags(r.tags);
  const badgeClass = r.source === 'personal' ? 'badge-personal' : 'badge-external';
  const badgeLabel = r.source === 'personal' ? 'Personal' : 'External';

  document.getElementById('d-name').textContent = r.name;

  const imageHero = r.image
    ? `<div class="detail-hero-wrap">
         <img class="detail-hero-image" src="${r.image}" alt="${r.name}"
              onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" />
         <div class="detail-hero-placeholder" style="display:none">${emoji}</div>
       </div>`
    : `<div class="detail-hero-wrap">
         <div class="detail-hero-placeholder">${emoji}</div>
       </div>`;

  const tagsList = r.tags && r.tags.length
    ? r.tags.map(t => `<span class="card-tag">${t}</span>`).join('')
    : `<span class="card-tag" style="color:#aaa">No tags</span>`;

  const ingredientsList = r.ingredients && r.ingredients.length
    ? `<ul class="detail-list">${r.ingredients.map(ing => `<li>${ing}</li>`).join('')}</ul>`
    : `<p class="detail-empty">No ingredients listed.</p>`;

  const instructionsList = r.instructions && r.instructions.length
    ? `<ol class="detail-list detail-instructions">${r.instructions.map(step => `<li>${step}</li>`).join('')}</ol>`
    : `<p class="detail-empty">No instructions provided.</p>`;

  document.getElementById('d-body').innerHTML = `
    ${imageHero}
    <div class="detail-meta">
      <span class="card-badge ${badgeClass}">${badgeLabel}</span>
      <div class="detail-tags">${tagsList}</div>
    </div>

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

// ── Filter & search ─────────────────────────────────────────────
function filterTag(btn) {
  document.querySelectorAll('.tag-pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  activeTag = btn.dataset.tag;
  render();
}

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
