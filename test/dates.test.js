import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCalendarDate, formatTimestamp } from '../assets/dates.js';

test('blog and newsroom dates stay on the UTC calendar day', () => {
  assert.equal(formatCalendarDate('2026-10-18'), 'October 18, 2026');
  // 02:00 UTC is still the previous evening in the US. The day stays October 18.
  assert.equal(formatCalendarDate('2026-10-18T02:00:00.000Z'), 'October 18, 2026');
  assert.equal(formatCalendarDate(new Date('2026-10-18T02:00:00.000Z'), { weekday: true }), 'Sunday, October 18, 2026');
  const stamp = formatTimestamp('2026-10-18T02:00:00.000Z');
  assert.match(stamp, /Oct 18, 2026/);
  assert.match(stamp, /2:00\s*AM/);
  assert.equal(formatCalendarDate('not-a-date'), '');
  assert.equal(formatTimestamp('not-a-date'), '');
});
