function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getEditableDateBounds(today = new Date()) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(today.getFullYear(), today.getMonth() + 2, 0);
  return { start: formatDate(start), end: formatDate(end) };
}

export function getMealEditWarning(date, today = new Date()) {
  const bounds = getEditableDateBounds(today);
  if (date < bounds.start) return 'Past dates are read-only.';
  if (date > bounds.end) return 'Only today through the end of next month can be edited.';
  return '';
}

export function getShoppingSummaryRange(today = new Date()) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const currentMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 2, 0);

  return {
    start,
    end,
    requests: [
      {
        start: formatDate(start),
        days: currentMonthEnd.getDate() - start.getDate() + 1,
      },
      {
        start: formatDate(nextMonthStart),
        days: end.getDate(),
      },
    ],
  };
}
