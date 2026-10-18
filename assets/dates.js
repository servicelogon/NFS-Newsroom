// One calendar rule for field notes and the newsroom: the UTC day.
// A timestamp just after midnight UTC stays on that UTC date everywhere,
// instead of slipping to the previous evening in US timezones.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function calendarDate(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const date = new Date(DATE_ONLY.test(raw) ? `${raw}T12:00:00Z` : raw);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function formatCalendarDate(value, { weekday = false } = {}) {
  const date = calendarDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('en-US', {
    ...(weekday ? { weekday: 'long' } : {}),
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatTimestamp(value) {
  const date = calendarDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date);
}
