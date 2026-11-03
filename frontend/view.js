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
function render(recipeList = recipes) {
  const grid  = document.getElementById('recipe-grid');
  const empty = document.getElementById('empty-state');
  if (!grid || !empty) return;

  const filtered = recipeList;

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

// ── Calendar rendering ───────────────────────────────────────────
function renderCalendar() {
  const mealTypes = ['breakfast', 'lunch', 'dinner'];
  mealTypes.forEach(type => {
    const meal = calendarMeals[type];
    const recipeElem = document.getElementById(`${type}-recipe`);
    const actionsElem = document.getElementById(`${type}-actions`);

    if (meal && meal.recipe && meal.recipe.name) {
      const r = meal.recipe;
      const ingCount = (r.ingredients && r.ingredients.length) ? r.ingredients.length : 0;
      const stepCount = (r.instructions && r.instructions.length) ? r.instructions.length : 0;
      let meta = '';
      if (ingCount > 0 || stepCount > 0) {
        const parts = [];
        if (ingCount > 0) parts.push(`${ingCount} ingredient${ingCount === 1 ? '' : 's'}`);
        if (stepCount > 0) parts.push(`${stepCount} step${stepCount === 1 ? '' : 's'}`);
        meta = parts.join(' • ');
      }

      if (recipeElem) {
        recipeElem.innerHTML = `
          <div>
            <span class="meal-recipe-title" onclick="openDetailModal(${r.id})" title="Click to view recipe details">
              ${escapeHTML(r.name)}
            </span>
            ${meta ? `<div class="meal-recipe-sub">${escapeHTML(meta)}</div>` : ''}
          </div>
        `;
      }

      if (actionsElem) {
        actionsElem.innerHTML = `
          <button class="btn-add" onclick="openMealSelector('${type}')">Change Recipe</button>
          <button class="btn-secondary" onclick="removeMeal('${type}')">Remove</button>
        `;
      }
    } else {
      if (recipeElem) {
        recipeElem.innerHTML = `<p style="color: #777;">No recipe assigned</p>`;
      }
      if (actionsElem) {
        actionsElem.innerHTML = `
          <button class="btn-add" onclick="openMealSelector('${type}')">
            Add Recipe
          </button>
        `;
      }
    }
  });
}

// ── Meal Selector Modal ──────────────────────────────────────────
function openMealSelectorModal(mealType, recipesList) {
  const backdrop = document.getElementById('meal-modal-backdrop');
  if (!backdrop) return;

  const displayType = mealType.charAt(0).toUpperCase() + mealType.slice(1);
  const titleElem = document.getElementById('meal-modal-title');
  if (titleElem) titleElem.textContent = `Assign Recipe for ${displayType}`;

  const typeInput = document.getElementById('selected-meal-type');
  if (typeInput) typeInput.value = mealType;

  const searchInput = document.getElementById('meal-recipe-search');
  if (searchInput) searchInput.value = '';

  renderMealPickerList(recipesList);
  backdrop.style.display = 'flex';
  if (searchInput) searchInput.focus();
}

function renderMealPickerList(recipesList) {
  const container = document.getElementById('meal-picker-list');
  if (!container) return;

  if (!recipesList || recipesList.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 2rem 1rem;">
        <p style="margin-bottom: 0.85rem;">No recipes available to assign.</p>
        <button type="button" class="btn-add" onclick="closeMealModal(); navigateTo('recipes'); openModal();">
          Create New Recipe
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = recipesList.map(r => {
    const ingCount = (r.ingredients && r.ingredients.length) ? r.ingredients.length : 0;
    const metaText = ingCount > 0 ? `${ingCount} ingredient${ingCount === 1 ? '' : 's'}` : 'No ingredients listed';

    return `
      <div class="meal-picker-item" onclick="selectRecipeForMeal(${r.id})">
        <div class="meal-picker-item-info">
          <div class="meal-picker-item-name">${escapeHTML(r.name)}</div>
          <div class="meal-picker-item-meta">${escapeHTML(metaText)}</div>
        </div>
        <button type="button" class="btn-add btn-select-meal" onclick="event.stopPropagation(); selectRecipeForMeal(${r.id})">
          Select
        </button>
      </div>
    `;
  }).join('');
}

function closeMealModal() {
  const backdrop = document.getElementById('meal-modal-backdrop');
  if (backdrop) backdrop.style.display = 'none';
  const typeInput = document.getElementById('selected-meal-type');
  if (typeInput) typeInput.value = '';
}

function backdropMealClick(e) {
  if (e.target === e.currentTarget) closeMealModal();
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
  const backdrop = document.getElementById('modal-backdrop');
  if (backdrop) backdrop.style.display = 'none';
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
  let r = recipes.find(x => x.id === Number(id));
  if (!r) {
    // Check in today's assigned meals
    for (const type of ['breakfast', 'lunch', 'dinner']) {
      if (calendarMeals[type] && calendarMeals[type].recipe && calendarMeals[type].recipe.id === Number(id)) {
        r = calendarMeals[type].recipe;
        break;
      }
    }
  }
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
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

function setActiveView(view) {
  if (typeof navigateTo === 'function') {
    navigateTo(view);
  }
}

function animateRecipeRemoval(id) {
  const card = document.getElementById(`card-${id}`);
  if (!card) return false;
  card.style.transition = 'opacity .2s, transform .2s';
  card.style.opacity = '0';
  card.style.transform = 'scale(.95)';
  return true;
}

function restoreRecipeCard(id) {
  const card = document.getElementById(`card-${id}`);
  if (!card) return;
  card.style.opacity = '1';
  card.style.transform = 'scale(1)';
}

function readRecipeForm() {
  const editId = document.getElementById('modal-edit-id').value;
  const name = document.getElementById('f-name').value.trim();
  const ingredients = document.getElementById('f-ingredients').value
    .split('\n').map(value => value.trim()).filter(Boolean);
  const instructions = document.getElementById('f-instructions').value
    .split('\n').map(value => value.trim()).filter(Boolean);
  return { editId, payload: { name, ingredients, instructions } };
}

function getDetailRecipeId() {
  return document.getElementById('detail-recipe-id').value;
}
