// ── view.js — DOM rendering (View layer) ────────────────────────

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Recipe grid ─────────────────────────────────────────────────
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

// ── Add/Edit modal ───────────────────────────────────────────────
function openModal() {
  document.getElementById('modal-title').textContent = 'Add New Recipe';
  document.getElementById('modal-backdrop').style.display = 'flex';
  document.getElementById('modal-edit-id').value = '';
  document.getElementById('f-name').value         = '';
  document.getElementById('f-ingredients').value  = '';
  document.getElementById('f-instructions').value = '';
  document.getElementById('f-name').focus();
}

function openEditModal(id) {
  const r = recipes.find(x => x.id === Number(id));
  if (!r) return;

  document.getElementById('modal-title').textContent = 'Edit Recipe';
  document.getElementById('modal-edit-id').value     = r.id;
  document.getElementById('f-name').value            = r.name;
  document.getElementById('f-ingredients').value     = (r.ingredients || []).join('\n');
  document.getElementById('f-instructions').value   = (r.instructions || []).join('\n');
  document.getElementById('modal-backdrop').style.display = 'flex';
  document.getElementById('f-name').focus();
}

function closeModal() {
  document.getElementById('modal-backdrop').style.display = 'none';
  document.getElementById('modal-edit-id').value = '';
  document.getElementById('f-name').value         = '';
  document.getElementById('f-ingredients').value  = '';
  document.getElementById('f-instructions').value = '';
}

function backdropClick(e) {
  if (e.target === e.currentTarget) closeModal();
}

// ── Detail modal ─────────────────────────────────────────────────
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

  document.getElementById('detail-recipe-id').value = r.id;
  document.getElementById('detail-backdrop').style.display = 'flex';
}

function closeDetailModal() {
  const backdrop = document.getElementById('detail-backdrop');
  if (backdrop) backdrop.style.display = 'none';
}

function backdropDetailClick(e) {
  if (e.target === e.currentTarget) closeDetailModal();
}

// ── Toast ────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

