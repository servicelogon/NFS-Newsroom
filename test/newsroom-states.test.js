import test from 'node:test';
import assert from 'node:assert/strict';
import { describeEmptyState, summarizeSourceHealth } from '../newsroom-states.js';

test('summarizeSourceHealth counts existing source statuses only', () => {
  const health = summarizeSourceHealth([
    { name: 'Alpha', status: 'ok' },
    { name: 'Beta', status: 'error', error: 'HTTP 503' },
    { name: 'Gamma', status: 'stale', error: 'timeout' },
    { name: 'Skip', status: 'mystery' },
  ]);
  assert.equal(health.total, 4);
  assert.deepEqual(health.ok.map((s) => s.name), ['Alpha']);
  assert.deepEqual(health.error.map((s) => s.name), ['Beta']);
  assert.deepEqual(health.stale.map((s) => s.name), ['Gamma']);
});

test('describeEmptyState stays quiet while loading or when stories are visible', () => {
  assert.equal(describeEmptyState({ loading: true, visibleCount: 0, articleCount: 0 }), null);
  assert.equal(describeEmptyState({ visibleCount: 3, articleCount: 3 }), null);
});

test('describeEmptyState uses load errors and source-health data for retry copy', () => {
  const unavailable = describeEmptyState({
    articleCount: 0,
    visibleCount: 0,
    loadError: 'News service returned HTTP 503.',
    view: 'front-page',
  });
  assert.equal(unavailable.kind, 'unavailable');
  assert.equal(unavailable.retry, true);
  assert.match(unavailable.body, /503/);

  const down = describeEmptyState({
    articleCount: 0,
    visibleCount: 0,
    sources: [
      { name: 'Krebs', status: 'error' },
      { name: 'Bleeping', status: 'error' },
    ],
    view: 'briefing',
  });
  assert.equal(down.kind, 'down');
  assert.match(down.body, /Krebs and Bleeping/);
  assert.equal(down.retry, true);
  assert.equal(down.reset, false);

  const limited = describeEmptyState({
    articleCount: 0,
    visibleCount: 0,
    sources: [
      { name: 'One', status: 'ok' },
      { name: 'Two', status: 'stale', error: 'HTTP 403' },
    ],
  });
  assert.equal(limited.kind, 'limited');
  assert.match(limited.body, /Two/);
});

test('describeEmptyState keeps filter empty separate from source outages', () => {
  const filtered = describeEmptyState({
    articleCount: 5,
    visibleCount: 0,
    hasQuery: true,
    sources: [{ name: 'Fixture', status: 'error' }],
    view: 'briefing',
  });
  assert.equal(filtered.kind, 'filter');
  assert.equal(filtered.retry, false);
  assert.equal(filtered.reset, true);
  assert.match(filtered.body, /search/);

  const quiet = describeEmptyState({
    articleCount: 0,
    visibleCount: 0,
    sources: [{ name: 'Fixture', status: 'ok' }],
    view: 'front-page',
  });
  assert.equal(quiet.kind, 'empty');
  assert.match(quiet.body, /no stories/i);
  assert.equal(quiet.retry, true);
});
