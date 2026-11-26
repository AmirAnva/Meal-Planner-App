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

  const labels = v => (v || '').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  const filters = [['recipe-category-filter','category'],['recipe-tag-filter','tags'],['recipe-diet-filter','dietary']];
  const filtered = recipeList.filter(r=>filters.every(([id,key])=>{const v=document.getElementById(id)?.value;return !v || (key==='category' ? (r[key]||'').trim().toLowerCase()===v : labels(r[key]).includes(v));}));

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
        <div class="card-meta">${metaText}</div><div class="recipe-labels">${[r.category,r.tags,r.dietary].filter(Boolean).map(v=>`<span>${escapeHTML(v)}</span>`).join('')}</div>
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
          <button type="button" class="btn-secondary btn-sm" onclick="openRescheduleModal('${type}')">Move</button>
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
  resetIngredientRows();
  for (const key of ['category','tags','dietary']) document.getElementById('f-'+key).value = '';
  document.getElementById('f-instructions').value = '';
  document.getElementById('f-name').focus();
}

export function openEditModal(id, recipeList = [], structured = []) {
  const r = recipeList.find(x => x.id === Number(id));
  if (!r) return;

  document.getElementById('modal-title').textContent = 'Edit Recipe';
  document.getElementById('modal-edit-id').value     = r.id;
  document.getElementById('f-name').value            = r.name;
  for (const key of ['category','tags','dietary']) document.getElementById('f-'+key).value = r[key] || '';
  resetIngredientRows(structured.length ? structured.map(item => item.quantity != null && item.unit ? {name:item.ingredient.name, quantity:item.quantity, unit:item.unit} : parseIngredientLine(item.ingredient.name)) : (r.ingredients || []).map(parseIngredientLine).filter(Boolean));
  document.getElementById('f-instructions').value   = (r.instructions || []).join('\n');
  document.getElementById('modal-backdrop').style.display = 'flex';
  document.getElementById('f-name').focus();
}

export function closeModal() {
  const backdrop = document.getElementById('modal-backdrop');
  if (backdrop) backdrop.style.display = 'none';
  document.getElementById('modal-edit-id').value = '';
  document.getElementById('f-name').value         = '';
  document.getElementById('recipe-ingredient-rows').replaceChildren();
  document.getElementById('f-instructions').value = '';
}

export function backdropClick(e) {
  if (e.target === e.currentTarget) closeModal();
}

// ── Detail modal & Servings Scaler ───────────────────────────────
let activeDetailRecipe = null;
let activeDetailScale = 1;

const UNICODE_FRACTIONS = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
  '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};

function parseQuantityToken(token) {
  const trimmed = token.trim();
  if (!trimmed) return null;
  if (UNICODE_FRACTIONS[trimmed] !== undefined) return UNICODE_FRACTIONS[trimmed];

  // Mixed number with unicode fraction e.g. "1½" or "1 ½"
  const unicodeMixed = trimmed.match(/^(\d+)\s*([½⅓⅔¼¾⅛⅜⅝⅞])$/);
  if (unicodeMixed) {
    return Number(unicodeMixed[1]) + UNICODE_FRACTIONS[unicodeMixed[2]];
  }

  // Mixed ASCII fraction e.g. "1 1/2"
  const mixedMatch = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    const denom = Number(mixedMatch[3]);
    return denom > 0 ? Number(mixedMatch[1]) + Number(mixedMatch[2]) / denom : null;
  }

  // Simple ASCII fraction e.g. "1/2"
  const fracMatch = trimmed.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) {
    const denom = Number(fracMatch[2]);
    return denom > 0 ? Number(fracMatch[1]) / denom : null;
  }

  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

function formatScaledNumber(value) {
  if (!Number.isFinite(value)) return '';
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function scaleIngredientLine(line, factor) {
  if (!line || factor === 1) return line;
  // Match leading quantity or range (e.g., "2", "1.5", "1/2", "1 1/2", "½", "2-3", "1-2½")
  const match = line.match(/^(\s*)(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?(?:\s*[½⅓⅔¼¾⅛⅜⅝⅞])?|[½⅓⅔¼¾⅛⅜⅝⅞])(\s*-\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?(?:\s*[½⅓⅔¼¾⅛⅜⅝⅞])?|[½⅓⅔¼¾⅛⅜⅝⅞]))?(.*)$/);
  if (!match) return line;

  const [, leadingWs, firstToken, rangePart, secondToken, rest] = match;
  const firstVal = parseQuantityToken(firstToken);
  if (firstVal === null) return line;

  const scaledFirst = formatScaledNumber(firstVal * factor);
  if (rangePart && secondToken) {
    const secondVal = parseQuantityToken(secondToken);
    if (secondVal !== null) {
      return `${leadingWs}${scaledFirst}-${formatScaledNumber(secondVal * factor)}${rest}`;
    }
  }
  return `${leadingWs}${scaledFirst}${rest}`;
}

export function getDetailScale() {
  return activeDetailScale || 1;
}

const KNOWN_UNITS = new Set([
  'g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms', 'mg',
  'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds',
  'ml', 'milliliter', 'milliliters', 'l', 'liter', 'liters',
  'tsp', 'teaspoon', 'teaspoons', 'tbsp', 'tablespoon', 'tablespoons',
  'cup', 'cups', 'slice', 'slices', 'clove', 'cloves', 'can', 'cans',
  'pinch', 'pinches', 'bunch', 'bunches', 'each', 'ea', 'piece', 'pieces', 'whole',
]);

export function parseIngredientLine(line) {
  const trimmed = (line || '').trim();
  if (!trimmed) return null;

  const qtyMatch = trimmed.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?(?:\s*[½⅓⅔¼¾⅛⅜⅝⅞])?|[½⅓⅔¼¾⅛⅜⅝⅞])\s+(.*)$/);
  if (!qtyMatch) {
    return { name: trimmed, quantity: 1, unit: null };
  }

  const quantity = parseQuantityToken(qtyMatch[1]);
  let remainder = qtyMatch[2].trim();
  let unit = null;

  const words = remainder.split(/\s+/);
  if (words.length >= 2 && KNOWN_UNITS.has(words[0].toLowerCase().replace(/[.,]$/, ''))) {
    unit = words[0].replace(/[.,]$/, '');
    remainder = words.slice(1).join(' ').replace(/^of\s+/i, '').trim();
  }

  return {
    name: remainder || trimmed,
    quantity: (quantity !== null && quantity > 0) ? quantity : 1,
    unit,
  };
}

function renderDetailIngredientsHTML(recipe, scale) {
  if (!recipe || !recipe.ingredients || !recipe.ingredients.length) {
    return `<p class="detail-empty">No ingredients listed.</p>`;
  }
  return `<ul class="detail-list">${recipe.ingredients
    .map(ing => `<li>${escapeHTML(scaleIngredientLine(ing, scale))}</li>`)
    .join('')}</ul>`;
}

export function setDetailScale(scale) {
  const num = Number(scale);
  if (!Number.isFinite(num) || num <= 0) return;
  activeDetailScale = Math.max(0.25, Math.min(20, Math.round(num * 100) / 100));

  const listEl = document.getElementById('d-ingredients-list');
  if (listEl && activeDetailRecipe) {
    listEl.innerHTML = renderDetailIngredientsHTML(activeDetailRecipe, activeDetailScale);
  }
  const labelEl = document.getElementById('detail-scale-label');
  if (labelEl) {
    labelEl.textContent = `${activeDetailScale}x`;
  }
  document.querySelectorAll('.scaler-preset-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.scale) === activeDetailScale);
  });
}

export function adjustDetailScale(delta) {
  setDetailScale(activeDetailScale + Number(delta));
}

export function openDetailModal(id, recipeList = [], calendarMeals = {}) {
  let r = recipeList.find(x => x.id === Number(id));
  if (!r) {
    // Check in assigned meals
    for (const type of ['breakfast', 'lunch', 'dinner']) {
      if (calendarMeals[type] && calendarMeals[type].recipe && calendarMeals[type].recipe.id === Number(id)) {
        r = calendarMeals[type].recipe;
        break;
      }
    }
  }
  if (!r) return;

  activeDetailRecipe = r;
  activeDetailScale = 1;

  document.getElementById('d-name').textContent = r.name;

  const ingredientsList = renderDetailIngredientsHTML(r, 1);

  const instructionsList = r.instructions && r.instructions.length
    ? `<ol class="detail-list detail-instructions">${r.instructions.map(step => `<li>${escapeHTML(step)}</li>`).join('')}</ol>`
    : `<p class="detail-empty">No instructions provided.</p>`;

  const scalerControls = (r.ingredients && r.ingredients.length) ? `
    <div class="servings-scaler" aria-label="Servings scaler">
      <span class="scaler-label">Scale:</span>
      <div class="scaler-presets">
        <button type="button" class="scaler-preset-btn" data-scale="0.5" onclick="setDetailScale(0.5)">0.5x</button>
        <button type="button" class="scaler-preset-btn active" data-scale="1" onclick="setDetailScale(1)">1x</button>
        <button type="button" class="scaler-preset-btn" data-scale="2" onclick="setDetailScale(2)">2x</button>
        <button type="button" class="scaler-preset-btn" data-scale="4" onclick="setDetailScale(4)">4x</button>
      </div>
      <div class="pantry-stepper scaler-stepper">
        <button type="button" class="btn-stepper" onclick="adjustDetailScale(-0.5)" aria-label="Decrease scale">&minus;</button>
        <span class="pantry-qty-display scaler-value" id="detail-scale-label">1x</span>
        <button type="button" class="btn-stepper" onclick="adjustDetailScale(0.5)" aria-label="Increase scale">+</button>
      </div>
    </div>
  ` : '';

  document.getElementById('d-body').innerHTML = `
    <div class="detail-section">
      <div class="detail-section-header">
        <h3 class="detail-section-title" style="margin-bottom:0;">Ingredients</h3>
        ${scalerControls}
      </div>
      <div id="d-ingredients-list">
        ${ingredientsList}
      </div>
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
  const structured_ingredients = [...document.querySelectorAll('.recipe-ingredient-row')].map(row => ({
    name: row.querySelector('.ingredient-name').value.trim(),
    quantity: Number(row.querySelector('.ingredient-quantity').value),
    unit: row.querySelector('.ingredient-unit').value.trim().toLowerCase(),
  }));
  if (!name || !structured_ingredients.length || structured_ingredients.some(i => !i.name || !Number.isFinite(i.quantity) || i.quantity <= 0 || !i.unit)) throw new Error('Enter a name, positive quantity and unit for every ingredient.');
  if (new Set(structured_ingredients.map(i => i.name.toLowerCase())).size !== structured_ingredients.length) throw new Error('Combine duplicate ingredients into one row.');
  const ingredients = structured_ingredients.map(i => `${i.quantity} ${i.unit} ${i.name}`);
  const instructions = document.getElementById('f-instructions').value
    .split('\n').map(value => value.trim()).filter(Boolean);
  if (!instructions.length) throw new Error('Enter at least one instruction.');
  return { editId, payload: { name, ingredients, instructions, structured_ingredients, ...Object.fromEntries(["category","tags","dietary"].map(k=>[k,document.getElementById("f-"+k).value.trim()])) } };
}

export function getDetailRecipeId() {
  return document.getElementById('detail-recipe-id').value;
}

// ── Grocery list rendering ────────────────────────────────────────
export function renderGroceryList(items = [], filter = 'all', searchQuery = '') {
  const container = document.getElementById('grocery-list-container');
  const emptyState = document.getElementById('grocery-empty-state');
  const summaryElem = document.getElementById('grocery-summary');
  const clearBtn = document.getElementById('btn-clear-purchased');
  const moveBtn = document.getElementById('btn-move-to-pantry');
  if (!container || !emptyState) return;

  const totalCount = items.length;
  const purchasedCount = items.filter(it => it.purchased).length;
  const pendingCount = totalCount - purchasedCount;

  if (summaryElem) {
    summaryElem.textContent = `${totalCount} item${totalCount === 1 ? '' : 's'} • ${pendingCount} to buy${purchasedCount > 0 ? ` • ${purchasedCount} purchased` : ''}`;
  }

  if (clearBtn) {
    clearBtn.style.display = purchasedCount > 0 ? 'inline-flex' : 'none';
  }
  if (moveBtn) {
    moveBtn.style.display = purchasedCount > 0 ? 'inline-flex' : 'none';
  }

  // Filter items
  const query = searchQuery.trim().toLowerCase();
  let filtered = items;
  if (query) {
    filtered = filtered.filter(it => (it.name || '').toLowerCase().includes(query));
  }
  if (filter === 'pending') {
    filtered = filtered.filter(it => !it.purchased);
  } else if (filter === 'purchased') {
    filtered = filtered.filter(it => it.purchased);
  }

  if (filtered.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = 'block';
    const emptyText = document.getElementById('grocery-empty-text');
    if (emptyText) {
      if (totalCount === 0) {
        emptyText.textContent = 'Your grocery list is empty.';
      } else if (filter === 'pending') {
        emptyText.textContent = 'All items have been purchased!';
      } else if (filter === 'purchased') {
        emptyText.textContent = 'No purchased items yet.';
      } else {
        emptyText.textContent = 'No grocery items match your search.';
      }
    }
    return;
  }

  emptyState.style.display = 'none';

  // Sort items: pending first, then purchased
  const sorted = [...filtered].sort((a, b) => {
    if (a.purchased === b.purchased) {
      return (a.name || '').localeCompare(b.name || '');
    }
    return a.purchased ? 1 : -1;
  });

  container.innerHTML = sorted.map(item => {
    const numId = Number(item.id);
    let qtyText = '';
    if (item.quantity !== null && item.quantity !== undefined && item.quantity > 0) {
      const q = Number(item.quantity);
      const formattedQ = Number.isInteger(q) ? q : q.toFixed(2).replace(/\.?0+$/, '');
      qtyText = item.unit ? `${formattedQ} ${item.unit}` : `${formattedQ}`;
    } else if (item.unit) {
      qtyText = item.unit;
    }

    return `
      <div class="grocery-item ${item.purchased ? 'purchased' : ''}" id="grocery-item-${numId}">
        <div class="grocery-item-left">
          <span class="grocery-item-name">${escapeHTML(item.name || 'Unnamed Item')}</span>
          ${qtyText ? `<span class="grocery-item-badge">${escapeHTML(qtyText)}</span>` : ''}
        </div>
        <div class="grocery-item-actions">
          <button type="button" class="grocery-purchase-control"
            aria-pressed="${Boolean(item.purchased)}"
            aria-label="${item.purchased ? 'Undo purchase: ' : 'Mark as purchased: '}${escapeHTML(item.name || 'Item')}"
            onclick="toggleGroceryItem(${numId}, ${!item.purchased})">
            <span aria-hidden="true">&#10003;</span> Purchased
          </button>
          <button type="button" class="grocery-item-delete grocery-remove-action"
            onclick="event.stopPropagation(); removeGroceryItem(${numId})"
            aria-label="Remove ${escapeHTML(item.name || 'item')}">
            <span aria-hidden="true">&#215;</span> Remove
          </button>
        </div>
      </div>
    `;
  }).join('');
}

export function openGroceryModal() {
  const backdrop = document.getElementById('grocery-modal-backdrop');
  if (backdrop) backdrop.style.display = 'flex';
  const nameInput = document.getElementById('g-name');
  if (nameInput) {
    nameInput.value = '';
    nameInput.focus();
  }
  const qtyInput = document.getElementById('g-quantity');
  if (qtyInput) qtyInput.value = '';
  const unitInput = document.getElementById('g-unit');
  if (unitInput) unitInput.value = '';
}

export function closeGroceryModal() {
  const backdrop = document.getElementById('grocery-modal-backdrop');
  if (backdrop) backdrop.style.display = 'none';
  const nameInput = document.getElementById('g-name');
  if (nameInput) nameInput.value = '';
  const qtyInput = document.getElementById('g-quantity');
  if (qtyInput) qtyInput.value = '';
  const unitInput = document.getElementById('g-unit');
  if (unitInput) unitInput.value = '';
}

export function backdropGroceryClick(e) {
  if (e.target === e.currentTarget) closeGroceryModal();
}

export function readGroceryForm() {
  const name = document.getElementById('g-name').value.trim();
  const quantityVal = document.getElementById('g-quantity').value.trim();
  const unitVal = document.getElementById('g-unit').value.trim();
  const quantity = quantityVal !== '' ? parseFloat(quantityVal) : null;
  const unit = unitVal !== '' ? unitVal : null;
  return { name, quantity, unit, purchased: false };
}

// ── Pantry inventory rendering ────────────────────────────────────
function formatQuantityValue(value) {
  const q = Number(value);
  if (!Number.isFinite(q)) return '0';
  return Number.isInteger(q) ? String(q) : q.toFixed(2).replace(/\.?0+$/, '');
}

export function renderIngredientDatalist(ingredients = []) {
  const datalist = document.getElementById('pantry-ingredients-datalist');
  if (!datalist) return;
  datalist.innerHTML = ingredients
    .map(ing => `<option value="${escapeHTML(ing.name || '')}"></option>`)
    .join('');
}

export function renderPantryList(items = [], filter = 'all', searchQuery = '') {
  const container = document.getElementById('pantry-list-container');
  const emptyState = document.getElementById('pantry-empty-state');
  const summaryElem = document.getElementById('pantry-summary');
  if (!container || !emptyState) return;

  const totalCount = items.length;
  const inStockCount = items.filter(it => Number(it.quantity) > 0).length;
  const outCount = totalCount - inStockCount;

  if (summaryElem) {
    summaryElem.textContent = `${totalCount} ingredient${totalCount === 1 ? '' : 's'} • ${inStockCount} in stock${outCount > 0 ? ` • ${outCount} out of stock` : ''}`;
  }

  const query = searchQuery.trim().toLowerCase();
  let filtered = items;
  if (query) {
    filtered = filtered.filter(it => {
      const name = (it.ingredient && it.ingredient.name) || '';
      return name.toLowerCase().includes(query);
    });
  }
  if (filter === 'in_stock') {
    filtered = filtered.filter(it => Number(it.quantity) > 0);
  } else if (filter === 'out_of_stock') {
    filtered = filtered.filter(it => Number(it.quantity) <= 0);
  }

  if (filtered.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = 'block';
    const emptyText = document.getElementById('pantry-empty-text');
    if (emptyText) {
      if (totalCount === 0) {
        emptyText.textContent = 'Your pantry is empty.';
      } else if (filter === 'in_stock') {
        emptyText.textContent = 'No ingredients currently in stock.';
      } else if (filter === 'out_of_stock') {
        emptyText.textContent = 'No out-of-stock ingredients.';
      } else {
        emptyText.textContent = 'No pantry ingredients match your search.';
      }
    }
    return;
  }

  emptyState.style.display = 'none';

  const sorted = [...filtered].sort((a, b) => {
    const aInStock = Number(a.quantity) > 0;
    const bInStock = Number(b.quantity) > 0;
    if (aInStock !== bInStock) return aInStock ? -1 : 1;
    const aName = (a.ingredient && a.ingredient.name) || '';
    const bName = (b.ingredient && b.ingredient.name) || '';
    return aName.localeCompare(bName);
  });

  container.innerHTML = sorted.map(item => {
    const numId = Number(item.ingredient_id);
    const name = (item.ingredient && item.ingredient.name) || 'Unnamed Ingredient';
    const qty = Number(item.quantity) || 0;
    const isOut = qty <= 0;
    const formattedQty = formatQuantityValue(qty);
    const unitText = item.unit ? ` ${item.unit}` : '';
    const qtyDisplay = `${formattedQty}${unitText}`;

    return `
      <div class="pantry-item ${isOut ? 'out-of-stock' : ''}" id="pantry-item-${numId}">
        <div class="pantry-item-info">
          <span class="pantry-item-name">${escapeHTML(name)}</span>
          ${isOut ? '<span class="pantry-status-pill">Out of stock</span>' : ''}
        </div>
        <div class="pantry-item-controls">
          <div class="pantry-stepper" role="group" aria-label="Adjust quantity for ${escapeHTML(name)}">
            <button
              type="button"
              class="btn-stepper"
              onclick="adjustPantryQuantity(${numId}, -1)"
              aria-label="Decrease ${escapeHTML(name)} quantity"
              ${isOut ? 'disabled' : ''}
            >&minus;</button>
            <span class="pantry-qty-display">${escapeHTML(qtyDisplay)}</span>
            <button
              type="button"
              class="btn-stepper"
              onclick="adjustPantryQuantity(${numId}, 1)"
              aria-label="Increase ${escapeHTML(name)} quantity"
            >+</button>
          </div>
          <button
            type="button"
            class="btn-secondary btn-sm"
            onclick="openEditPantryModal(${numId})"
            aria-label="Edit ${escapeHTML(name)}"
          >Edit</button>
          ${!isOut ? `
            <button
              type="button"
              class="grocery-item-delete"
              onclick="depletePantryItem(${numId})"
              title="Mark as used up (set to 0)"
              aria-label="Mark ${escapeHTML(name)} as used up"
            >&#x2715;</button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

export function renderPantryExistingNotice(existingItem) {
  const notice = document.getElementById('pantry-existing-notice');
  const textEl = document.getElementById('pantry-existing-text');
  const checkbox = document.getElementById('p-add-to-existing');
  if (!notice || !textEl || !checkbox) return;

  if (!existingItem) {
    notice.style.display = 'none';
    textEl.textContent = '';
    return;
  }

  const name = (existingItem.ingredient && existingItem.ingredient.name) || 'This ingredient';
  const qty = formatQuantityValue(existingItem.quantity);
  const unit = existingItem.unit ? ` ${existingItem.unit}` : '';
  textEl.textContent = `"${name}" is already in your pantry (${qty}${unit}).`;
  checkbox.checked = true;
  notice.style.display = 'flex';
}

export function openPantryModal() {
  const backdrop = document.getElementById('pantry-modal-backdrop');
  const title = document.getElementById('pantry-modal-title');
  const idInput = document.getElementById('p-ingredient-id');
  const nameInput = document.getElementById('p-name');
  const qtyInput = document.getElementById('p-quantity');
  const unitInput = document.getElementById('p-unit');

  if (title) title.textContent = 'Add Pantry Ingredient';
  if (idInput) idInput.value = '';
  if (nameInput) {
    nameInput.value = '';
    nameInput.readOnly = false;
  }
  if (qtyInput) qtyInput.value = '1';
  if (unitInput) unitInput.value = '';
  renderPantryExistingNotice(null);
  if (backdrop) backdrop.style.display = 'flex';
  if (nameInput) nameInput.focus();
}

export function openEditPantryModal(ingredientId, items = []) {
  const numId = Number(ingredientId);
  const item = items.find(it => Number(it.ingredient_id) === numId);
  if (!item) return;

  const backdrop = document.getElementById('pantry-modal-backdrop');
  const title = document.getElementById('pantry-modal-title');
  const idInput = document.getElementById('p-ingredient-id');
  const nameInput = document.getElementById('p-name');
  const qtyInput = document.getElementById('p-quantity');
  const unitInput = document.getElementById('p-unit');

  if (title) title.textContent = 'Update Pantry Ingredient';
  if (idInput) idInput.value = String(numId);
  if (nameInput) {
    nameInput.value = (item.ingredient && item.ingredient.name) || '';
    nameInput.readOnly = true;
  }
  if (qtyInput) qtyInput.value = formatQuantityValue(item.quantity);
  if (unitInput) unitInput.value = item.unit || '';
  renderPantryExistingNotice(null);
  if (backdrop) backdrop.style.display = 'flex';
  if (qtyInput) qtyInput.focus();
}

export function closePantryModal() {
  const backdrop = document.getElementById('pantry-modal-backdrop');
  if (backdrop) backdrop.style.display = 'none';
  const idInput = document.getElementById('p-ingredient-id');
  const nameInput = document.getElementById('p-name');
  const qtyInput = document.getElementById('p-quantity');
  const unitInput = document.getElementById('p-unit');
  if (idInput) idInput.value = '';
  if (nameInput) {
    nameInput.value = '';
    nameInput.readOnly = false;
  }
  if (qtyInput) qtyInput.value = '';
  if (unitInput) unitInput.value = '';
  renderPantryExistingNotice(null);
}

export function backdropPantryClick(e) {
  if (e.target === e.currentTarget) closePantryModal();
}

export function readPantryForm() {
  const ingredientIdVal = document.getElementById('p-ingredient-id').value.trim();
  const ingredientId = ingredientIdVal !== '' ? Number(ingredientIdVal) : null;
  const name = document.getElementById('p-name').value.trim();
  const quantityVal = document.getElementById('p-quantity').value.trim();
  const unitVal = document.getElementById('p-unit').value.trim();
  const quantity = quantityVal !== '' ? parseFloat(quantityVal) : NaN;
  const unit = unitVal !== '' ? unitVal : null;
  const addCheckbox = document.getElementById('p-add-to-existing');
  const addToExisting = Boolean(addCheckbox && addCheckbox.checked);
  return { ingredientId, name, quantity, unit, addToExisting };
}

// ── Calendar 7-Day Week View ─────────────────────────────────────
export function renderWeekGrid({ startDateStr, mealsByDate = {} }) {
  const weekGrid = document.getElementById('calendar-week-grid');
  const monthLabel = document.getElementById('calendar-month-label');
  if (!weekGrid) return;

  const [sy, sm, sd] = startDateStr.split('-').map(Number);
  const startDate = new Date(sy, sm - 1, sd);
  const endDate = new Date(sy, sm - 1, sd + 6);

  if (monthLabel) {
    const startFmt = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endFmt = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    monthLabel.textContent = `${startFmt} – ${endFmt}`;
  }

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const slots = [
    { type: 'breakfast', label: 'Breakfast', icon: '🌅' },
    { type: 'lunch', label: 'Lunch', icon: '☀️' },
    { type: 'dinner', label: 'Dinner', icon: '🌙' },
  ];

  let html = '';
  for (let offset = 0; offset < 7; offset++) {
    const d = new Date(sy, sm - 1, sd + offset);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;
    const dayMeals = mealsByDate[dateStr] || {};
    const dayHeading = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    const slotsHTML = slots.map(slot => {
      const meal = dayMeals[slot.type];
      if (meal && meal.recipe && meal.recipe.name) {
        const recipeId = Number(meal.recipe.id);
        const recipeName = escapeHTML(meal.recipe.name);
        return `
          <div class="week-meal-slot filled">
            <div class="week-slot-label">${slot.icon} ${slot.label}</div>
            <div class="week-slot-content">
              <button
                type="button"
                class="week-recipe-link"
                onclick="openDetailModalForDate(${recipeId}, '${escapeHTML(dateStr)}')"
                title="View recipe details"
              >${recipeName}</button>
              <div class="week-slot-actions">
                <button type="button" class="btn-week-action" onclick="openRescheduleForDate('${escapeHTML(dateStr)}', '${slot.type}')" title="Move to another day">Move</button>
                <button type="button" class="btn-week-action danger" onclick="removeMealOnDate('${escapeHTML(dateStr)}', '${slot.type}')" title="Remove meal" aria-label="Remove ${recipeName}">&#x2715;</button>
              </div>
            </div>
          </div>
        `;
      }
      return `
        <div class="week-meal-slot empty">
          <div class="week-slot-label">${slot.icon} ${slot.label}</div>
          <button type="button" class="btn-week-add" onclick="openMealSelectorForDate('${escapeHTML(dateStr)}', '${slot.type}')">
            + Add
          </button>
        </div>
      `;
    }).join('');

    html += `
      <div class="week-day-card ${isToday ? 'today' : ''}">
        <div class="week-day-header">
          <span class="week-day-title">${escapeHTML(dayHeading)}</span>
          ${isToday ? '<span class="week-today-badge">Today</span>' : ''}
        </div>
        <div class="week-day-slots">
          ${slotsHTML}
        </div>
      </div>
    `;
  }

  weekGrid.innerHTML = html;
}

// ── Reschedule Meal Modal ────────────────────────────────────────
export function openRescheduleModal({ sourceDate, sourceType, recipe }) {
  const backdrop = document.getElementById('reschedule-modal-backdrop');
  if (!backdrop) return;

  document.getElementById('reschedule-source-date').value = sourceDate;
  document.getElementById('reschedule-source-type').value = sourceType;
  document.getElementById('reschedule-recipe-id').value = Number(recipe.id);
  document.getElementById('reschedule-date').value = sourceDate;
  document.getElementById('reschedule-meal-type').value = sourceType;

  const summary = document.getElementById('reschedule-meal-summary');
  if (summary) {
    const [y, m, d] = sourceDate.split('-').map(Number);
    const formattedDate = new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const displayType = sourceType.charAt(0).toUpperCase() + sourceType.slice(1);
    summary.textContent = `Moving "${recipe.name}" (${displayType} on ${formattedDate})`;
  }

  backdrop.style.display = 'flex';
  document.getElementById('reschedule-date').focus();
}

export function closeRescheduleModal() {
  const backdrop = document.getElementById('reschedule-modal-backdrop');
  if (backdrop) backdrop.style.display = 'none';
}

export function backdropRescheduleClick(e) {
  if (e.target === e.currentTarget) closeRescheduleModal();
}

export function readRescheduleForm() {
  return {
    sourceDate: document.getElementById('reschedule-source-date').value,
    sourceType: document.getElementById('reschedule-source-type').value,
    recipeId: Number(document.getElementById('reschedule-recipe-id').value),
    targetDate: document.getElementById('reschedule-date').value,
    targetType: document.getElementById('reschedule-meal-type').value,
  };
}

// ── Generate Grocery List Modal ──────────────────────────────────
export function openGenerateGroceryModal(recipesList = [], preselectedIds = []) {
  const backdrop = document.getElementById('generate-grocery-modal-backdrop');
  if (!backdrop) return;
  const previewSection = document.getElementById('generate-preview-section');
  if (previewSection) previewSection.style.display = 'none';
  const previewList = document.getElementById('generate-preview-list');
  if (previewList) previewList.innerHTML = '';

  renderGenerateRecipeList(recipesList, preselectedIds);
  backdrop.style.display = 'flex';
}

export function closeGenerateGroceryModal() {
  const backdrop = document.getElementById('generate-grocery-modal-backdrop');
  if (backdrop) backdrop.style.display = 'none';
}

export function backdropGenerateGroceryClick(e) {
  if (e.target === e.currentTarget) closeGenerateGroceryModal();
}

export function renderGenerateRecipeList(recipesList = [], selectedIds = []) {
  const container = document.getElementById('generate-recipe-list');
  if (!container) return;

  if (!recipesList || recipesList.length === 0) {
    container.innerHTML = '<p class="detail-empty">No saved recipes available. Add a recipe first.</p>';
    return;
  }

  const counts = new Map();
  selectedIds.forEach(id => {
    const numId = Number(id);
    if (Number.isInteger(numId) && numId > 0) {
      counts.set(numId, (counts.get(numId) || 0) + 1);
    }
  });

  container.innerHTML = recipesList.map(r => {
    const numId = Number(r.id);
    const count = counts.get(numId) || 0;
    const checked = count > 0 ? 'checked' : '';
    const ingCount = Array.isArray(r.ingredients) ? r.ingredients.length : 0;
    return `
      <div class="generate-recipe-row">
        <label class="generate-recipe-label" for="gen-rec-${numId}">
          <input
            type="checkbox"
            id="gen-rec-${numId}"
            class="grocery-checkbox gen-recipe-checkbox"
            value="${numId}"
            ${checked}
          />
          <span class="generate-recipe-name">${escapeHTML(r.name)}</span>
          <span class="generate-recipe-meta">${ingCount} ingredient${ingCount === 1 ? '' : 's'}</span>
        </label>
        <div class="generate-count-wrap" title="Number of times to include this recipe">
          <span class="generate-count-x">&times;</span>
          <input
            type="number"
            id="gen-count-${numId}"
            class="generate-count-input"
            min="1"
            max="20"
            value="${count > 0 ? count : 1}"
            aria-label="Multiplier for ${escapeHTML(r.name)}"
            onchange="const cb = document.getElementById('gen-rec-${numId}'); if (cb && Number(this.value) > 0) cb.checked = true;"
          />
        </div>
      </div>
    `;
  }).join('');
}

export function readGenerateSelectedRecipeIds() {
  const ids = [];
  document.querySelectorAll('.gen-recipe-checkbox:checked').forEach(cb => {
    const numId = Number(cb.value);
    if (!Number.isInteger(numId) || numId <= 0) return;
    const countInput = document.getElementById(`gen-count-${numId}`);
    const count = countInput ? Math.max(1, Math.min(20, Math.floor(Number(countInput.value) || 1))) : 1;
    for (let i = 0; i < count; i++) {
      ids.push(numId);
    }
  });
  return ids;
}

export function renderGeneratePreview(requirements = [], isEstimated = false) {
  const section = document.getElementById('generate-preview-section');
  const list = document.getElementById('generate-preview-list');
  if (!section || !list) return;

  section.style.display = 'block';
  if (!requirements || requirements.length === 0) {
    list.innerHTML = '<p class="detail-empty">No ingredients required for the selected recipes.</p>';
    return;
  }

  const statusLabels = {
    available: 'In Pantry',
    insufficient: 'Partial',
    missing: 'Missing',
    incomparable: 'Unit Mismatch',
  };

  const noteHTML = isEstimated
    ? `<p class="generate-estimated-note">Estimated from recipe ingredient text (pantry checked by ingredient name).</p>`
    : '';

  list.innerHTML = noteHTML + requirements.map(req => {
    const name = escapeHTML((req.ingredient && req.ingredient.name) || 'Ingredient');
    const reqQty = formatQuantityValue(req.required_quantity);
    const missQty = formatQuantityValue(req.missing_quantity);
    const unit = escapeHTML(req.unit || '');
    const status = req.status || 'missing';
    const label = statusLabels[status] || status;
    const detail = status === 'available'
      ? `Need ${reqQty} ${unit} (covered by pantry)`
      : status === 'incomparable'
        ? `Need ${reqQty} ${unit} (pantry unit differs)`
        : `Need ${reqQty} ${unit} • Add ${missQty} ${unit}`;

    return `
      <div class="generate-preview-row">
        <div>
          <div class="generate-preview-name">${name}</div>
          <div class="generate-preview-detail">${detail.trim()}</div>
        </div>
        <span class="gen-status-pill status-${escapeHTML(status)}">${escapeHTML(label)}</span>
      </div>
    `;
  }).join('');
}

export function addRecipeIngredientRow(item = {}) {
  const row = document.createElement('div');
  row.className = 'recipe-ingredient-row';
  row.innerHTML = `<input class="form-input ingredient-name" aria-label="Ingredient name" required maxlength="120" placeholder="Flour"><input class="form-input ingredient-quantity" aria-label="Quantity" type="number" min="0" step="any" required placeholder="1"><input class="form-input ingredient-unit" aria-label="Unit" required maxlength="30" placeholder="cup"><button type="button" class="remove-ingredient-btn" aria-label="Remove ingredient">×</button>`;
  row.querySelector('.ingredient-name').value = item.name ?? '';
  row.querySelector('.ingredient-quantity').value = item.quantity ?? 1;
  row.querySelector('.ingredient-unit').value = item.unit || 'each';
  row.querySelector('button').onclick = () => row.remove();
  document.getElementById('recipe-ingredient-rows').append(row);
}
function resetIngredientRows(items = []) {
  document.getElementById('recipe-ingredient-rows').replaceChildren();
  (items.length ? items : [{}]).forEach(addRecipeIngredientRow);
}
