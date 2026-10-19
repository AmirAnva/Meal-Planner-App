// ── Seed data (matches wireframe) ──────────────────────────────
let recipes = [
  { id: 1, name: 'Oatmeal & Eggs',   image: '', emoji: '🥣', source: 'personal', tags: ['breakfast', 'quick'] },
  { id: 2, name: 'Banana Bread',     image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Banana_bread_loaf.jpg/640px-Banana_bread_loaf.jpg', emoji: '🍞', source: 'external', tags: ['breakfast', 'snack'] },
  { id: 3, name: 'Chicken and Rice', image: '', emoji: '🍗', source: 'external', tags: ['lunch', 'dinner'] },
  { id: 4, name: 'Popcorn Chicken',  image: '', emoji: '🍿', source: 'personal', tags: ['lunch', 'quick', 'snack'] },
];

let nextId      = 5;
let activeTag   = 'all';
let searchQuery = '';
let toastTimer;

// ── Render ──────────────────────────────────────────────────────
function render() {
  const grid  = document.getElementById('recipe-grid');
  const empty = document.getElementById('empty-state');

  let filtered = activeTag === 'all'
    ? recipes
    : recipes.filter(r => r.tags.includes(activeTag));

  if (searchQuery) {
    filtered = filtered.filter(r =>
      r.name.toLowerCase().includes(searchQuery) ||
      r.tags.some(t => t.includes(searchQuery))
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

  const imageBlock = r.image
    ? `<img class="card-image" src="${r.image}" alt="${r.name}"
         onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" />
       <div class="card-image-placeholder" style="display:none">${r.emoji}</div>`
    : `<div class="card-image-placeholder">${r.emoji}</div>`;

  const tagList = r.tags.length
    ? r.tags.map(t => `<span class="card-tag">${t}</span>`).join('')
    : `<span class="card-tag" style="color:#bbb">no tags</span>`;

  return `
    <div class="recipe-card" id="card-${r.id}">
      <button class="card-remove" onclick="removeRecipe(${r.id})" title="Remove">&#x2715;</button>
      <span class="card-badge ${badgeClass}">${badgeLabel}</span>
      ${imageBlock}
      <div class="card-body">
        <div class="card-name">${r.name}</div>
        <div class="card-tags">${tagList}</div>
      </div>
    </div>`;
}

// ── Add recipe ──────────────────────────────────────────────────
function openModal() {
  document.getElementById('modal-backdrop').style.display = 'flex';
  document.getElementById('f-name').focus();
}

function closeModal() {
  document.getElementById('modal-backdrop').style.display = 'none';
  document.getElementById('f-name').value  = '';
  document.getElementById('f-image').value = '';
  document.querySelector('input[name="source"][value="personal"]').checked = true;
  document.querySelectorAll('.modal-body input[type="checkbox"]')
    .forEach(cb => (cb.checked = false));
}

function backdropClick(e) {
  if (e.target === e.currentTarget) closeModal();
}

function submitRecipe(e) {
  e.preventDefault();

  const name   = document.getElementById('f-name').value.trim();
  const image  = document.getElementById('f-image').value.trim();
  const source = document.querySelector('input[name="source"]:checked').value;
  const tags   = [...document.querySelectorAll('.modal-body input[type="checkbox"]:checked')]
                   .map(cb => cb.value);

  const emojis = { breakfast: '🥣', lunch: '🥗', dinner: '🍽️', quick: '⚡', snack: '🍿' };
  const emoji  = tags.length ? (emojis[tags[0]] || '🍴') : '🍴';

  recipes.push({ id: nextId++, name, image, emoji, source, tags });
  closeModal();
  render();
  showToast(`"${name}" added!`);
}

// ── Remove recipe ───────────────────────────────────────────────
function removeRecipe(id) {
  const card = document.getElementById(`card-${id}`);
  if (!card) return;
  card.style.transition = 'opacity .2s, transform .2s';
  card.style.opacity    = '0';
  card.style.transform  = 'scale(.95)';
  setTimeout(() => {
    recipes = recipes.filter(r => r.id !== id);
    render();
    showToast('Recipe removed.');
  }, 200);
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
  if (e.key === 'Escape') closeModal();
});

// ── Init ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', render);
