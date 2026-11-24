import test from 'node:test';
import assert from 'node:assert/strict';
import { filtersFromSearch, searchFromFilters } from '../assets/newsroom-filters.js';

test('newsroom filters round-trip through the shareable query string', () => {
  const all = { topic: 'all', microsoftFilter: 'all', query: '' };
  assert.deepEqual(filtersFromSearch(''), all);
  assert.deepEqual(filtersFromSearch('?front'), all);
  assert.deepEqual(filtersFromSearch('?front=1'), all);
  assert.deepEqual(filtersFromSearch('?topic=identity'), { topic: 'identity', microsoftFilter: 'all', query: '' });
  assert.deepEqual(filtersFromSearch('?topic=ai'), { topic: 'ai', microsoftFilter: 'all', query: '' });
  assert.equal(searchFromFilters({ topic: 'ai', microsoftFilter: 'all', query: '' }), 'topic=ai');
  assert.deepEqual(filtersFromSearch('?topic=all'), all);
  assert.deepEqual(filtersFromSearch('?topic=all&microsoft=news'), all);
  assert.deepEqual(filtersFromSearch('?topic=microsoft&microsoft=news&search=entra'), {
    topic: 'microsoft', microsoftFilter: 'news', query: '',
  });
  assert.deepEqual(filtersFromSearch('?topic=identity&microsoft=news'), {
    topic: 'identity', microsoftFilter: 'all', query: '',
  });
  assert.deepEqual(filtersFromSearch('?microsoft=message-center'), {
    topic: 'microsoft', microsoftFilter: 'message-center', query: '',
  });
  assert.deepEqual(filtersFromSearch('?search=%20token%20'), all);
  assert.deepEqual(filtersFromSearch('?topic=nope'), all);
  assert.equal(searchFromFilters({ topic: 'all', microsoftFilter: 'all', query: '' }), '');
  assert.equal(searchFromFilters({ front: true, topic: 'identity', microsoftFilter: 'news', query: 'x' }), 'topic=identity');
  assert.equal(searchFromFilters({ topic: 'identity', microsoftFilter: 'all', query: '' }), 'topic=identity');
  assert.equal(searchFromFilters({ topic: 'microsoft', microsoftFilter: 'news', query: 'entra id' }), 'topic=microsoft&microsoft=news');
  assert.equal(searchFromFilters(filtersFromSearch('?topic=all&search=cloud')), '');
  assert.equal(searchFromFilters(filtersFromSearch('?front=1&topic=identity')), 'topic=identity');
});
