// ── view.js — DOM rendering and view event binding (View layer) ──

import {
  displayPantryQuantity,
  normalizeUnit,
  parseRecipeIngredientFields,
  pantryUnitOptions,
} from './measurements.js';

export function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pantryUnitSelect(selectedUnit) {
  return pantryUnitOptions.map(([value, label]) => `
    <option value="${escapeHTML(value)}" ${value === selectedUnit ? 'selected' : ''}>${escapeHTML(label)}</option>
  `).join('');
}

// ── Recipe grid ─────────────────────────────────────────────────
export function render(recipeList = []) {
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
  grid.innerHTML = filtered.map(recipe => cardHTML(recipe)).join('');
}

export function renderPantry(items = [], unitSystem = 'metric') {
  const list = document.getElementById('pantry-list');
  const empty = document.getElementById('pantry-empty-state');
  if (!list || !empty) return;

  document.querySelectorAll('[data-unit-system]').forEach(button => {
    const selected = button.dataset.unitSystem === unitSystem;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });

  if (items.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  list.innerHTML = items.map(item => `
    <div class="pantry-item">
      <div class="pantry-item-heading">
        <span class="pantry-item-name">${escapeHTML(item.ingredient)}</span>
        <span class="pantry-item-amount">${escapeHTML(displayPantryQuantity(item, unitSystem))}</span>
        <button type="button" class="pantry-item-remove" data-action="remove-pantry" data-id="${Number(item.id)}" aria-label="Remove ${escapeHTML(item.ingredient)} from pantry">
          Remove
        </button>
      </div>
      <form class="pantry-quantity-form" data-submit="pantry-quantity" data-id="${Number(item.id)}">
        <label>
          Quantity
          <input class="form-input" name="quantity" type="number" min="0.001" step="any" value="${Number(item.quantity) > 0 ? Number(item.quantity) : ''}" required />
        </label>
        <label>
          Unit
          <select class="form-input" name="unit" required>${pantryUnitSelect(normalizeUnit(item.unit) || 'g')}</select>
        </label>
        <button type="submit" class="pantry-item-save">Save quantity</button>
      </form>
    </div>
  `).join('');
}

export function cardHTML(r) {
  const ingCount  = (r.ingredients && r.ingredients.length) ? r.ingredients.length : 0;
  const stepCount = (r.instructions && r.instructions.length) ? r.instructions.length : 0;

  let metaText = 'Click to view details';
  if (ingCount > 0 || stepCount > 0) {
    const parts = [];
    if (ingCount > 0) parts.push(`${ingCount} ingredient${ingCount === 1 ? '' : 's'}`);
    if (stepCount > 0) parts.push(`${stepCount} step${stepCount === 1 ? '' : 's'}`);
    metaText = parts.join(' • ');
  }

  const availability = r.availability || { status: 'unknown', label: 'Checking pantry' };
  return `
    <div class="recipe-card availability-${availability.status}" id="card-${r.id}" data-action="open-detail" data-id="${r.id}" title="Click to view recipe details">
      <button type="button" class="card-remove" data-action="remove-recipe" data-id="${r.id}" title="Remove recipe">&#x2715;</button>
      <div class="card-body">
        <div class="card-name">${escapeHTML(r.name)}</div>
        <div class="recipe-availability">${escapeHTML(availability.label)}</div>
        <div class="card-meta">${metaText}</div>
      </div>
    </div>`;
}

// ── Calendar rendering ───────────────────────────────────────────
function calendarDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function calendarMealHTML(meal, type, date, editable) {
  const label = { breakfast: 'B', lunch: 'L', dinner: 'D' }[type];
  const recipe = meal && meal.recipe ? meal.recipe : null;
  const recipeDisplay = recipe
    ? `<button type="button" class="calendar-recipe-link" data-action="open-detail" data-id="${Number(recipe.id)}" title="View ${escapeHTML(recipe.name)}">${escapeHTML(recipe.name)}</button>`
    : '<span class="calendar-empty-meal">—</span>';
  const actions = editable
    ? `<button type="button" class="calendar-meal-action" data-action="open-meal" data-meal-type="${type}" data-date="${date}" aria-label="${recipe ? 'Change' : 'Add'} ${type} on ${date}">${recipe ? 'Edit' : '+'}</button>${recipe ? `<button type="button" class="calendar-meal-remove" data-action="remove-meal" data-meal-type="${type}" data-date="${date}" aria-label="Remove ${type} on ${date}">&times;</button>` : ''}`
    : '';

  return `
    <div class="calendar-meal-row">
      <span class="calendar-meal-type" title="${type}">${label}</span>
      ${recipeDisplay}
      ${actions}
    </div>
  `;
}

export function renderCalendar(calendarDays = [], month = new Date(), editableStart = '', editableEnd = '') {
  const title = document.getElementById('calendar-month-title');
  const grid = document.getElementById('calendar-grid');
  if (!grid) return;

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const daysByDate = new Map(calendarDays.map(day => [day.date, day]));

  if (title) {
    title.textContent = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  const today = calendarDateString(new Date());
  const mealTypes = ['breakfast', 'lunch', 'dinner'];
  const cells = [];

  for (let index = 0; index < cellCount; index += 1) {
    const dayNumber = index - firstWeekday + 1;
    if (dayNumber < 1 || dayNumber > daysInMonth) {
      cells.push('<div class="calendar-day-placeholder" aria-hidden="true"></div>');
      continue;
    }

    const date = calendarDateString(new Date(year, monthIndex, dayNumber));
    const editable = date >= editableStart && date <= editableEnd;
    const isToday = date === today;
    const day = daysByDate.get(date) || { meals: [] };
    const mealsByType = new Map((day.meals || []).map(meal => [meal.meal_type, meal]));
    const dayLabel = new Date(year, monthIndex, dayNumber).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

    cells.push(`
      <article class="calendar-day ${editable ? 'is-editable' : 'is-readonly'}${isToday ? ' is-today' : ''}" aria-label="${dayLabel}${editable ? ', editable during the next seven days' : ', view only'}">
        <div class="calendar-day-number">${dayNumber}</div>
        <div class="calendar-day-meals">
          ${mealTypes.map(type => calendarMealHTML(mealsByType.get(type), type, date, editable)).join('')}
        </div>
      </article>
    `);
  }

  grid.innerHTML = cells.join('');
}

export function renderShoppingSummary(summary) {
  const content = document.getElementById('shopping-summary-content');
  const count = document.getElementById('shopping-summary-count');
  if (!content || !count) return;

  const { items = [], plannedMealCount = 0, checkedIngredientCount = 0 } = summary;
  const buyCount = items.filter(item => item.status === 'missing' || item.status === 'short').length;
  const checkCount = items.filter(item => item.status === 'check').length;
  count.textContent = `${buyCount} to buy · ${checkCount} to check`;

  if (plannedMealCount === 0) {
    content.innerHTML = '<p class="shopping-summary-empty">No meals are scheduled for the next seven days.</p>';
    return;
  }
  if (checkedIngredientCount === 0) {
    content.innerHTML = '<p class="shopping-summary-empty">The scheduled recipes do not list any ingredients yet.</p>';
    return;
  }
  if (items.length === 0) {
    content.innerHTML = '<p class="shopping-summary-empty">You have enough of the listed ingredients for these meals.</p>';
    return;
  }

  content.innerHTML = `
    <ul class="shopping-summary-list">
      ${items.map(item => `
        <li class="shopping-summary-item status-${item.status}">
          <div class="shopping-summary-item-heading">
            <strong>${escapeHTML(item.ingredient)}</strong>
            <span class="shopping-summary-status">${shoppingStatusLabel(item.status)}</span>
          </div>
          <span class="shopping-summary-amount">
            ${shoppingAmountMessage(item)}
          </span>
          <span class="shopping-summary-uses">
            ${item.uses.map(use => `${escapeHTML(use.recipe)} · ${shoppingDateLabel(use.date)}`).join('; ')}
          </span>
        </li>
      `).join('')}
    </ul>
  `;
}

function shoppingStatusLabel(status) {
  return {
    missing: 'Missing',
    short: 'Not enough',
    check: 'Check amount',
  }[status] || 'Check';
}

function shoppingAmountMessage(item) {
  const format = value => new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(value);
  if (item.status === 'short') {
    return `Need ${format(item.needed)} ${escapeHTML(item.unit)}; have ${format(item.available)} ${escapeHTML(item.unit)}; short ${format(item.shortage)} ${escapeHTML(item.unit)}.`;
  }
  if (item.status === 'missing') {
    return item.needed === null
      ? 'Not in pantry; recipe amount could not be read.'
      : `Need ${format(item.needed)} ${escapeHTML(item.unit)}.`;
  }
  return 'Could not compare recipe and pantry amounts; check the ingredient units and quantities.';
}

function shoppingDateLabel(date) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

// ── Meal Selector Modal ──────────────────────────────────────────
export function openMealSelectorModal(mealType, recipesList = []) {
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

export function renderMealPickerList(recipesList = []) {
  const container = document.getElementById('meal-picker-list');
  if (!container) return;

  if (!recipesList || recipesList.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 2rem 1rem;">
        <p style="margin-bottom: 0.85rem;">No recipes available to assign.</p>
        <button type="button" class="btn-add" data-action="create-from-meal">
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
      <div class="meal-picker-item" data-action="select-meal" data-id="${r.id}">
        <div class="meal-picker-item-info">
          <div class="meal-picker-item-name">${escapeHTML(r.name)}</div>
          <div class="meal-picker-item-meta">${escapeHTML(metaText)}</div>
        </div>
        <button type="button" class="btn-add btn-select-meal" data-action="select-meal" data-id="${r.id}">
          Select
        </button>
      </div>
    `;
  }).join('');
}

export function closeMealModal() {
  const backdrop = document.getElementById('meal-modal-backdrop');
  if (backdrop) backdrop.style.display = 'none';
  const typeInput = document.getElementById('selected-meal-type');
  if (typeInput) typeInput.value = '';
}

export function backdropMealClick(e) {
  if (e.target === e.currentTarget) closeMealModal();
}

// ── Add/Edit modal ───────────────────────────────────────────────
function recipeIngredientRowHTML(fields = {}) {
  const selectedUnit = normalizeUnit(fields.unit) || 'g';
  return `
    <div class="recipe-ingredient-row">
      <label class="recipe-ingredient-field recipe-ingredient-name">
        <span>Ingredient</span>
        <input class="form-input" data-ingredient type="text" value="${escapeHTML(fields.ingredient || '')}" placeholder="e.g. flour" />
      </label>
      <label class="recipe-ingredient-field recipe-ingredient-quantity">
        <span>Quantity</span>
        <input class="form-input" data-quantity type="number" min="0.001" step="any" value="${escapeHTML(fields.quantity || '')}" placeholder="e.g. 2" />
      </label>
      <label class="recipe-ingredient-field recipe-ingredient-unit">
        <span>Unit</span>
        <select class="form-input" data-unit>${pantryUnitSelect(selectedUnit)}</select>
      </label>
      <button type="button" class="recipe-ingredient-remove" data-action="remove-ingredient" aria-label="Remove ingredient">&times;</button>
    </div>
  `;
}

function renderRecipeIngredientRows(ingredients = []) {
  const container = document.getElementById('f-ingredients-list');
  if (!container) return;
  const rows = ingredients.map(parseRecipeIngredientFields);
  if (rows.length === 0) rows.push({ ingredient: '', quantity: '', unit: 'g' });
  container.innerHTML = rows.map(recipeIngredientRowHTML).join('');
}

export function addRecipeIngredientRow() {
  const container = document.getElementById('f-ingredients-list');
  if (!container) return;
  container.insertAdjacentHTML('beforeend', recipeIngredientRowHTML());
  container.lastElementChild.querySelector('[data-ingredient]').focus();
}

export function removeRecipeIngredientRow(button) {
  const container = document.getElementById('f-ingredients-list');
  const row = button.closest('.recipe-ingredient-row');
  if (!container || !row) return;
  if (container.children.length === 1) {
    row.querySelector('[data-ingredient]').value = '';
    row.querySelector('[data-quantity]').value = '';
    row.querySelector('[data-unit]').value = 'g';
    return;
  }
  row.remove();
}

export function openModal() {
  document.getElementById('modal-title').textContent = 'Add New Recipe';
  document.getElementById('modal-backdrop').style.display = 'flex';
  document.getElementById('modal-edit-id').value = '';
  document.getElementById('f-name').value         = '';
  renderRecipeIngredientRows();
  document.getElementById('f-instructions').value = '';
  document.getElementById('f-name').focus();
}

export function openEditModal(id, recipeList = []) {
  const r = recipeList.find(x => x.id === Number(id));
  if (!r) return;

  document.getElementById('modal-title').textContent = 'Edit Recipe';
  document.getElementById('modal-edit-id').value     = r.id;
  document.getElementById('f-name').value            = r.name;
  renderRecipeIngredientRows(r.ingredients || []);
  document.getElementById('f-instructions').value   = (r.instructions || []).join('\n');
  document.getElementById('modal-backdrop').style.display = 'flex';
  document.getElementById('f-name').focus();
}

export function closeModal() {
  const backdrop = document.getElementById('modal-backdrop');
  if (backdrop) backdrop.style.display = 'none';
  document.getElementById('modal-edit-id').value = '';
  document.getElementById('f-name').value         = '';
  renderRecipeIngredientRows();
  document.getElementById('f-instructions').value = '';
}

export function backdropClick(e) {
  if (e.target === e.currentTarget) closeModal();
}

// ── Detail modal ─────────────────────────────────────────────────
export function openDetailModal(id, recipeList = [], calendarDays = []) {
  let r = recipeList.find(x => x.id === Number(id));
  if (!r) {
    for (const day of calendarDays) {
      const meal = (day.meals || []).find(item => item.recipe && item.recipe.id === Number(id));
      if (meal) {
        r = meal.recipe;
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

export function closeDetailModal() {
  const backdrop = document.getElementById('detail-backdrop');
  if (backdrop) backdrop.style.display = 'none';
}

export function backdropDetailClick(e) {
  if (e.target === e.currentTarget) closeDetailModal();
}

// ── Toast ────────────────────────────────────────────────────────
let toastTimer;
export function showToast(msg, persistent = false) {
  const t = document.getElementById('toast');
  if (!t) return;
  const message = document.getElementById('toast-message');
  const closeButton = document.getElementById('toast-close');
  if (message) message.textContent = msg;
  else t.textContent = msg;
  if (closeButton) closeButton.hidden = !persistent;
  t.classList.toggle('persistent', persistent);
  t.setAttribute('role', persistent ? 'alert' : 'status');
  t.setAttribute('aria-live', persistent ? 'assertive' : 'polite');
  t.classList.add('show');
  clearTimeout(toastTimer);
  if (!persistent) {
    toastTimer = setTimeout(dismissToast, 2500);
  }
}

export function dismissToast() {
  const t = document.getElementById('toast');
  if (!t) return;
  clearTimeout(toastTimer);
  t.classList.remove('show', 'persistent');
}

export function setActiveView(view) {
  if (typeof window.navigateTo === 'function') {
    window.navigateTo(view);
  }
}

export function animateRecipeRemoval(id) {
  const card = document.getElementById(`card-${id}`);
  if (!card) return false;
  card.style.transition = 'opacity .2s, transform .2s';
  card.style.opacity = '0';
  card.style.transform = 'scale(.95)';
  return true;
}

export function restoreRecipeCard(id) {
  const card = document.getElementById(`card-${id}`);
  if (!card) return;
  card.style.opacity = '1';
  card.style.transform = 'scale(1)';
}

export function getDetailRecipeId() {
  return document.getElementById('detail-recipe-id').value;
}

export function navigateTo(page) {
  const validPages = ['recipes', 'calendar', 'pantry'];
  if (!validPages.includes(page)) return;
  document.getElementById('recipes-view').style.display = page === 'recipes' ? 'block' : 'none';
  document.getElementById('calendar-view').style.display = page === 'calendar' ? 'block' : 'none';
  document.getElementById('pantry-view').style.display = page === 'pantry' ? 'block' : 'none';
  document.querySelectorAll('.nav-item').forEach(link => {
    link.classList.toggle('active', link.dataset.page === page);
  });
  window.scrollTo(0, 0);
}

export function bindViewEvents(handlers) {
  // Delegate data-action events from the view so application handlers stay centralized.
  const addIngredientButton = document.getElementById('add-ingredient-button');
  addIngredientButton?.addEventListener('click', event => {
    event.stopPropagation();
    handlers.addRecipeIngredientRow();
  });

  document.addEventListener('click', event => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    switch (action) {
      case 'navigate':
        event.preventDefault();
        handlers.navigateTo(target.dataset.page);
        break;
      case 'change-month':
        handlers.changeCalendarMonth(Number(target.dataset.offset));
        break;
      case 'current-month':
        handlers.goToCurrentMonth();
        break;
      case 'open-modal':
        handlers.openModal();
        break;
      case 'close-modal':
        handlers.closeModal();
        break;
      case 'close-detail':
        handlers.closeDetailModal();
        break;
      case 'open-detail':
        handlers.openDetailModal(Number(target.dataset.id));
        break;
      case 'remove-recipe':
        event.stopPropagation();
        handlers.removeRecipe(Number(target.dataset.id));
        break;
      case 'remove-pantry':
        handlers.removePantryItem(Number(target.dataset.id));
        break;
      case 'set-unit-system':
        handlers.setPantryUnitSystem(target.dataset.unitSystem);
        break;
      case 'edit-detail':
        handlers.editFromDetail();
        break;
      case 'open-meal':
        handlers.openMealSelector(target.dataset.mealType, target.dataset.date);
        break;
      case 'remove-meal':
        handlers.removeMeal(target.dataset.mealType, target.dataset.date);
        break;
      case 'create-from-meal':
        handlers.closeMealModal();
        handlers.navigateTo('recipes');
        handlers.openModal();
        break;
      case 'select-meal':
        handlers.selectRecipeForMeal(Number(target.dataset.id));
        break;
      case 'close-meal':
        handlers.closeMealModal();
        break;
      case 'remove-ingredient':
        handlers.removeRecipeIngredientRow(target);
        break;
      case 'dismiss-toast':
        handlers.dismissToast();
        break;
      default:
        break;
    }
  });

  document.addEventListener('submit', event => {
    const form = event.target;
    if (form.dataset.submit === 'recipe') handlers.submitRecipe(event);
    if (form.dataset.submit === 'pantry') handlers.submitPantryItem(event);
    if (form.dataset.submit === 'pantry-quantity') {
      handlers.updatePantryItem(event, Number(form.dataset.id));
    }
  });

  document.addEventListener('input', event => {
    if (event.target.dataset.input === 'recipe-search') handlers.handleSearch(event.target.value);
    if (event.target.dataset.input === 'meal-search') handlers.handleMealRecipeSearch(event.target.value);
  });

  for (const [id, handler] of [
    ['modal-backdrop', handlers.backdropClick],
    ['detail-backdrop', handlers.backdropDetailClick],
    ['meal-modal-backdrop', handlers.backdropMealClick],
  ]) {
    document.getElementById(id)?.addEventListener('click', event => {
      if (event.target === event.currentTarget) handler(event);
    });
  }
}
