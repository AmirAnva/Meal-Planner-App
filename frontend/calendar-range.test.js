import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getEditableDateBounds,
  getMealEditWarning,
  getShoppingSummaryRange,
} from '../src/calendar-range.js';
import { renderCalendar, renderMonthGrid } from '../src/view.js';

test('shopping summary covers today through the end of next month', () => {
  const range = getShoppingSummaryRange(new Date(2026, 10, 22));

  assert.equal(range.start.getFullYear(), 2026);
  assert.equal(range.start.getMonth(), 10);
  assert.equal(range.start.getDate(), 22);
  assert.equal(range.end.getFullYear(), 2026);
  assert.equal(range.end.getMonth(), 11);
  assert.equal(range.end.getDate(), 31);
  assert.deepEqual(range.requests, [
    { start: '2026-11-22', days: 9 },
    { start: '2026-12-01', days: 31 },
  ]);
});

test('shopping summary range handles the next month crossing a year boundary', () => {
  const range = getShoppingSummaryRange(new Date(2026, 11, 31));

  assert.deepEqual(range.requests, [
    { start: '2026-12-31', days: 1 },
    { start: '2027-01-01', days: 31 },
  ]);
  assert.equal(range.end.getFullYear(), 2027);
  assert.equal(range.end.getMonth(), 0);
  assert.equal(range.end.getDate(), 31);
});

test('today through the end of next month are editable', () => {
  const today = new Date(2026, 10, 22);
  const bounds = getEditableDateBounds(today);

  assert.deepEqual(bounds, { start: '2026-11-22', end: '2026-12-31' });
  assert.equal(getMealEditWarning('2026-11-21', today), 'Past dates are read-only.');
  assert.equal(getMealEditWarning('2026-11-22', today), '');
  assert.equal(getMealEditWarning('2026-11-29', today), '');
  assert.equal(getMealEditWarning('2026-12-31', today), '');
  assert.equal(getMealEditWarning('2027-01-01', today), 'Only today through the end of next month can be edited.');
});

test('editable end date handles year and leap-month boundaries', () => {
  const yearEndBounds = getEditableDateBounds(new Date(2026, 11, 31));
  assert.deepEqual(yearEndBounds, { start: '2026-12-31', end: '2027-01-31' });

  const leapMonthBounds = getEditableDateBounds(new Date(2024, 0, 15));
  assert.deepEqual(leapMonthBounds, { start: '2024-01-15', end: '2024-02-29' });
});

test('calendar highlights only the current week and distinguishes past dates', () => {
  const previousDocument = globalThis.document;
  const monthLabel = { textContent: '' };
  const calendarGrid = { innerHTML: '' };
  const dayModal = { style: { display: 'flex' } };
  globalThis.document = {
    getElementById(id) {
      if (id === 'calendar-month-label') return monthLabel;
      if (id === 'calendar-days-grid') return calendarGrid;
      if (id === 'day-meals-backdrop') return dayModal;
      return null;
    },
  };

  try {
    renderMonthGrid({
      year: 2026,
      month: 11,
      selectedDate: '2026-11-22',
      editableDateBounds: { start: '2026-11-22', end: '2026-12-31' },
    });

    assert.match(calendarGrid.innerHTML, /class="cal-day-cell today selected current-week" id="cal-day-2026-11-22"/);
    assert.match(calendarGrid.innerHTML, /class="cal-day-cell current-week" id="cal-day-2026-11-28"/);
    assert.match(calendarGrid.innerHTML, /class="cal-day-cell past-date read-only" id="cal-day-2026-11-21"/);
    assert.match(calendarGrid.innerHTML, /class="cal-day-cell" id="cal-day-2026-11-29"/);
    assert.equal(getMealEditWarning('2026-11-29', new Date(2026, 10, 22)), '');
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('read-only days do not expose add, change, or remove meal controls', () => {
  const previousDocument = globalThis.document;
  const elements = new Map();
  globalThis.document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { innerHTML: '' });
      return elements.get(id);
    },
  };

  try {
    renderCalendar({
      breakfast: { recipe: { id: 1, name: 'Oatmeal', ingredients: [], instructions: [] } },
    }, false);

    for (const type of ['breakfast', 'lunch', 'dinner']) {
      const actions = elements.get(`${type}-actions`).innerHTML;
      assert.match(actions, /Read-only/);
      assert.doesNotMatch(actions, /data-action="(?:open-meal|remove-meal)"/);
    }
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
