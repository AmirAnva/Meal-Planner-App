// ── view.js — DOM rendering (View layer) ────────────────────────
import {
  displayPantryQuantity,
  formatRecipeIngredient,
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
  grid.innerHTML = filtered.map(cardHTML).join('');
}

function pantryUnitSelect(selectedUnit) {
  return pantryUnitOptions.map(([value, label]) => `
    <option value="${escapeHTML(value)}" ${value === selectedUnit ? 'selected' : ''}>${escapeHTML(label)}</option>
  `).join('');
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
  list.innerHTML = items.map(item => {
    const name = item.ingredient?.name || '';
    return `
      <div class="pantry-item">
        <div class="pantry-item-heading">
          <span class="pantry-item-name">${escapeHTML(name)}</span>
          <span class="pantry-item-amount">${escapeHTML(displayPantryQuantity(item, unitSystem))}</span>
          <button type="button" class="pantry-item-remove" onclick="removePantryItem(${Number(item.ingredient_id)})" aria-label="Remove ${escapeHTML(name)} from pantry">Remove</button>
        </div>
        <form class="pantry-quantity-form" onsubmit="updatePantryItem(event, ${Number(item.ingredient_id)})">
          <label>Quantity<input class="form-input" name="quantity" type="number" min="0.001" step="any" value="${Number(item.quantity) > 0 ? Number(item.quantity) : ''}" required /></label>
          <label>Unit<select class="form-input" name="unit" required>${pantryUnitSelect(normalizeUnit(item.unit) || 'g')}</select></label>
          <button type="submit" class="pantry-item-save">Save quantity</button>
        </form>
      </div>
    `;
  }).join('');
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
    <div class="recipe-card availability-${availability.status}" id="card-${r.id}" onclick="openDetailModal(${r.id})" title="Click to view recipe details">
      <button class="card-remove" onclick="event.stopPropagation(); removeRecipe(${r.id})" title="Remove recipe">&#x2715;</button>
      <div class="card-body">
        <div class="card-name">${escapeHTML(r.name)}</div>
        <div class="recipe-availability">${escapeHTML(availability.label)}</div>
        <div class="card-meta">${metaText}</div>
      </div>
    </div>`;
}

// ── Calendar rendering ───────────────────────────────────────────
export function renderCalendar(calendarMeals = {}, editable = true) {
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
          ${editable
            ? `<button type="button" class="btn-add btn-sm" onclick="openMealSelector('${type}')">Change</button>
          <button type="button" class="btn-secondary btn-sm" onclick="removeMeal('${type}')">Remove</button>`
            : '<span class="day-meal-readonly">Read-only</span>'}
        `;
      }
    } else {
      if (recipeElem) {
        recipeElem.innerHTML = `<p class="meal-empty-text">No recipe assigned</p>`;
      }
      if (actionsElem) {
        actionsElem.innerHTML = editable ? `
          <button type="button" class="btn-add btn-sm" onclick="openMealSelector('${type}')">
            Add Recipe
          </button>
        ` : '<span class="day-meal-readonly">Read-only</span>';
      }
    }
  });
}

// ── Day Meals Modal ──────────────────────────────────────────────
export function openDayMealsModal(dateStr, calendarMeals = {}, editable = true, warningMessage = '') {
  const backdrop = document.getElementById('day-meals-backdrop');
  if (!backdrop) return;

  const [year, month, day] = dateStr.split('-').map(Number);
  const dateObj = new Date(year, month - 1, day);
  const now = new Date();
  const isToday = (
    now.getFullYear() === year &&
    now.getMonth() === (month - 1) &&
    now.getDate() === day
  );

  const titleElem = document.getElementById('day-modal-title');
  if (titleElem) {
    const formattedDate = dateObj.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    });
    titleElem.textContent = isToday ? `Today (${formattedDate})` : formattedDate;
  }

  const subtitleElem = document.getElementById('day-modal-subtitle');
  if (subtitleElem) {
    subtitleElem.textContent = dateObj.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  }

  renderCalendar(calendarMeals, editable);
  const warning = document.getElementById('day-modal-warning');
  if (warning) {
    warning.textContent = warningMessage;
    warning.hidden = !warningMessage;
  }
  backdrop.style.display = 'flex';
}

export function clearSelectedDay() {
  document.querySelectorAll('.cal-day-cell.selected').forEach(el => {
    el.classList.remove('selected');
  });
}

export function closeDayMealsModal() {
  const backdrop = document.getElementById('day-meals-backdrop');
  if (backdrop) backdrop.style.display = 'none';
  clearSelectedDay();
}

export function backdropDayMealsClick(e) {
  if (e.target === e.currentTarget) closeDayMealsModal();
}

export function renderDayBadgesHTML(meals = {}) {
  const parts = [];
  if (meals.breakfast && meals.breakfast.recipe) {
    const name = escapeHTML(meals.breakfast.recipe.name);
    parts.push(`<span class="cal-meal-badge badge-breakfast" title="Breakfast: ${name}">🌅 ${name}</span>`);
  }
  if (meals.lunch && meals.lunch.recipe) {
    const name = escapeHTML(meals.lunch.recipe.name);
    parts.push(`<span class="cal-meal-badge badge-lunch" title="Lunch: ${name}">☀️ ${name}</span>`);
  }
  if (meals.dinner && meals.dinner.recipe) {
    const name = escapeHTML(meals.dinner.recipe.name);
    parts.push(`<span class="cal-meal-badge badge-dinner" title="Dinner: ${name}">🌙 ${name}</span>`);
  }
  return parts.join('');
}

function calendarDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function renderMonthGrid({ year, month, selectedDate, monthMealsByDate = {}, editableDateBounds = {} }) {
  const monthLabel = document.getElementById('calendar-month-label');
  if (monthLabel) {
    const monthDate = new Date(year, month - 1, 1);
    monthLabel.textContent = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  const grid = document.getElementById('calendar-days-grid');
  if (!grid) return;

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const prevMonthDays = new Date(year, month - 1, 0).getDate();

  const now = new Date();
  const todayStr = editableDateBounds.start || calendarDateString(now);
  const [todayYear, todayMonth, todayDay] = todayStr.split('-').map(Number);
  const currentWeekStart = new Date(todayYear, todayMonth - 1, todayDay);
  currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay());
  const currentWeekEnd = new Date(currentWeekStart);
  currentWeekEnd.setDate(currentWeekEnd.getDate() + 6);
  const currentWeekStartStr = calendarDateString(currentWeekStart);
  const currentWeekEndStr = calendarDateString(currentWeekEnd);
  const lastEditableDate = editableDateBounds.end || todayStr;

  let html = '';

  // Leading empty/prev-month days
  for (let i = 0; i < firstDayOfWeek; i++) {
    const prevDayNum = prevMonthDays - firstDayOfWeek + 1 + i;
    html += `
      <div class="cal-day-cell cal-day-outside">
        <div class="cal-day-top">
          <span class="cal-day-number">${prevDayNum}</span>
        </div>
      </div>
    `;
  }

  const dayModal = document.getElementById('day-meals-backdrop');
  const isModalOpen = dayModal && dayModal.style.display !== 'none';

  // Days of current month
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;
    const isSelected = isModalOpen && (dateStr === selectedDate);
    const isEditable = dateStr >= todayStr && dateStr <= lastEditableDate;
    const meals = monthMealsByDate[dateStr] || {};

    let classes = 'cal-day-cell';
    if (isToday) classes += ' today';
    if (isSelected) classes += ' selected';
    if (dateStr < todayStr) classes += ' past-date';
    if (!isEditable) classes += ' read-only';
    if (dateStr >= currentWeekStartStr && dateStr <= currentWeekEndStr) classes += ' current-week';

    const badgesHTML = renderDayBadgesHTML(meals);

    html += `
      <div class="${classes}" id="cal-day-${dateStr}" onclick="selectCalendarDay('${dateStr}')" title="Click to view and plan meals">
        <div class="cal-day-top">
          <span class="cal-day-number">${day}</span>
        </div>
        <div class="cal-day-badges" id="cal-badges-${dateStr}">
          ${badgesHTML}
        </div>
      </div>
    `;
  }

  // Trailing days to fill the last row
  const totalCells = firstDayOfWeek + daysInMonth;
  const trailingCount = (7 - (totalCells % 7)) % 7;
  for (let i = 1; i <= trailingCount; i++) {
    html += `
      <div class="cal-day-cell cal-day-outside">
        <div class="cal-day-top">
          <span class="cal-day-number">${i}</span>
        </div>
      </div>
    `;
  }

  grid.innerHTML = html;
}

export function renderShoppingSummary(summary, startDate, endDate) {
  const title = document.getElementById('shopping-summary-title');
  const content = document.getElementById('shopping-summary-content');
  const count = document.getElementById('shopping-summary-count');
  if (!content || !count) return;

  if (title && startDate instanceof Date && endDate instanceof Date) {
    const formatDate = date => date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    title.textContent = `Shopping list · ${formatDate(startDate)} – ${formatDate(endDate)}`;
  }

  const { items = [], plannedMealCount = 0, checkedIngredientCount = 0 } = summary;
  const buyCount = items.filter(item => item.status === 'missing' || item.status === 'short').length;
  const checkCount = items.filter(item => item.status === 'check').length;
  count.textContent = `${buyCount} to buy · ${checkCount} to check`;

  if (plannedMealCount === 0) {
    content.innerHTML = '<p class="shopping-summary-empty">No meals are scheduled in this date range.</p>';
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
          <span class="shopping-summary-amount">${shoppingAmountMessage(item)}</span>
          <span class="shopping-summary-uses">${item.uses.map(use => `${escapeHTML(use.recipe)} · ${shoppingDateLabel(use.date)}`).join('; ')}</span>
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

export function updateDayCellMeals(dateStr, meals = {}) {
  const container = document.getElementById(`cal-badges-${dateStr}`);
  if (container) {
    container.innerHTML = renderDayBadgesHTML(meals);
  }
}

export function highlightSelectedDay(dateStr) {
  document.querySelectorAll('.cal-day-cell.selected').forEach(el => {
    el.classList.remove('selected');
  });
  const cell = document.getElementById(`cal-day-${dateStr}`);
  if (cell) {
    cell.classList.add('selected');
  }
}

// ── Meal Selector Modal ──────────────────────────────────────────
export function openMealSelectorModal(mealType, recipesList = [], selectedDateStr = '') {
  const backdrop = document.getElementById('meal-modal-backdrop');
  if (!backdrop) return;

  const displayType = mealType.charAt(0).toUpperCase() + mealType.slice(1);
  const titleElem = document.getElementById('meal-modal-title');
  if (titleElem) {
    if (selectedDateStr) {
      const [year, month, day] = selectedDateStr.split('-').map(Number);
      const d = new Date(year, month - 1, day);
      titleElem.textContent = `Assign Recipe for ${displayType} (${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`;
    } else {
      titleElem.textContent = `Assign Recipe for ${displayType}`;
    }
  }

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
export function openModal() {
  document.getElementById('modal-title').textContent = 'Add New Recipe';
  document.getElementById('modal-backdrop').style.display = 'flex';
  document.getElementById('modal-edit-id').value = '';
  document.getElementById('f-name').value         = '';
  renderRecipeIngredientRows([]);
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
  renderRecipeIngredientRows([]);
  document.getElementById('f-instructions').value = '';
}

export function backdropClick(e) {
  if (e.target === e.currentTarget) closeModal();
}

// ── Detail modal ─────────────────────────────────────────────────
export function openDetailModal(id, recipeList = [], calendarMeals = {}) {
  let r = recipeList.find(x => x.id === Number(id));
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

export function closeDetailModal() {
  const backdrop = document.getElementById('detail-backdrop');
  if (backdrop) backdrop.style.display = 'none';
}

export function backdropDetailClick(e) {
  if (e.target === e.currentTarget) closeDetailModal();
}

// ── Toast ────────────────────────────────────────────────────────
let toastTimer;
export function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
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

export function readRecipeForm() {
  const editId = document.getElementById('modal-edit-id').value;
  const name = document.getElementById('f-name').value.trim();
  const ingredients = [];
  const rows = document.querySelectorAll('#f-ingredients-list .recipe-ingredient-row');
  for (const row of rows) {
    const ingredient = row.querySelector('[data-ingredient]').value.trim();
    const quantity = row.querySelector('[data-quantity]').value.trim();
    const unit = row.querySelector('[data-unit]').value;
    if (!ingredient) {
      if (quantity) return { error: 'Enter an ingredient for each quantity.' };
      continue;
    }
    if (quantity && (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0)) {
      return { error: 'Ingredient quantities must be greater than zero.' };
    }
    ingredients.push(formatRecipeIngredient(ingredient, quantity, unit));
  }
  const instructions = document.getElementById('f-instructions').value
    .split('\n').map(value => value.trim()).filter(Boolean);
  return { editId, payload: { name, ingredients, instructions } };
}

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
      <button type="button" class="recipe-ingredient-remove" onclick="removeRecipeIngredientRow(this)" aria-label="Remove ingredient">&times;</button>
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

export function getDetailRecipeId() {
  return document.getElementById('detail-recipe-id').value;
}
