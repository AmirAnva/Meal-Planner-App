// ── view.js — DOM rendering (View layer) ────────────────────────

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
export function renderCalendar(calendarMeals = {}) {
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
          <button type="button" class="btn-add btn-sm" onclick="openMealSelector('${type}')">Change</button>
          <button type="button" class="btn-secondary btn-sm" onclick="removeMeal('${type}')">Remove</button>
        `;
      }
    } else {
      if (recipeElem) {
        recipeElem.innerHTML = `<p class="meal-empty-text">No recipe assigned</p>`;
      }
      if (actionsElem) {
        actionsElem.innerHTML = `
          <button type="button" class="btn-add btn-sm" onclick="openMealSelector('${type}')">
            Add Recipe
          </button>
        `;
      }
    }
  });
}

// ── Day Meals Modal ──────────────────────────────────────────────
export function openDayMealsModal(dateStr, calendarMeals = {}) {
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

  renderCalendar(calendarMeals);
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

export function renderMonthGrid({ year, month, selectedDate, monthMealsByDate = {} }) {
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
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

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
    const meals = monthMealsByDate[dateStr] || {};

    let classes = 'cal-day-cell';
    if (isToday) classes += ' today';
    if (isSelected) classes += ' selected';

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
  document.getElementById('f-ingredients').value  = '';
  document.getElementById('f-instructions').value = '';
  document.getElementById('f-name').focus();
}

export function openEditModal(id, recipeList = []) {
  const r = recipeList.find(x => x.id === Number(id));
  if (!r) return;

  document.getElementById('modal-title').textContent = 'Edit Recipe';
  document.getElementById('modal-edit-id').value     = r.id;
  document.getElementById('f-name').value            = r.name;
  document.getElementById('f-ingredients').value     = (r.ingredients || []).join('\n');
  document.getElementById('f-instructions').value   = (r.instructions || []).join('\n');
  document.getElementById('modal-backdrop').style.display = 'flex';
  document.getElementById('f-name').focus();
}

export function closeModal() {
  const backdrop = document.getElementById('modal-backdrop');
  if (backdrop) backdrop.style.display = 'none';
  document.getElementById('modal-edit-id').value = '';
  document.getElementById('f-name').value         = '';
  document.getElementById('f-ingredients').value  = '';
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
  const ingredients = document.getElementById('f-ingredients').value
    .split('\n').map(value => value.trim()).filter(Boolean);
  const instructions = document.getElementById('f-instructions').value
    .split('\n').map(value => value.trim()).filter(Boolean);
  return { editId, payload: { name, ingredients, instructions } };
}

export function getDetailRecipeId() {
  return document.getElementById('detail-recipe-id').value;
}
