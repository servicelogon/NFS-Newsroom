import test from 'node:test';
import assert from 'node:assert/strict';
import { filtersFromSearch, searchFromFilters } from '../assets/newsroom-filters.js';

test('newsroom filters round-trip through the shareable query string', () => {
  assert.deepEqual(filtersFromSearch(''), { front: true, topic: 'all', microsoftFilter: 'all', query: '' });
  assert.deepEqual(filtersFromSearch('?topic=identity'), { front: false, topic: 'identity', microsoftFilter: 'all', query: '' });
  assert.deepEqual(filtersFromSearch('?topic=all'), { front: false, topic: 'all', microsoftFilter: 'all', query: '' });
  assert.deepEqual(filtersFromSearch('?topic=microsoft&microsoft=news&search=entra'), {
    front: false, topic: 'microsoft', microsoftFilter: 'news', query: 'entra',
  });
  assert.deepEqual(filtersFromSearch('?topic=identity&microsoft=news'), {
    front: false, topic: 'identity', microsoftFilter: 'all', query: '',
  });
  assert.deepEqual(filtersFromSearch('?microsoft=message-center'), {
    front: false, topic: 'microsoft', microsoftFilter: 'message-center', query: '',
  });
  assert.deepEqual(filtersFromSearch('?search=%20token%20'), { front: false, topic: 'all', microsoftFilter: 'all', query: 'token' });
  assert.deepEqual(filtersFromSearch('?topic=nope'), { front: true, topic: 'all', microsoftFilter: 'all', query: '' });
  assert.equal(searchFromFilters({ front: true, topic: 'identity', microsoftFilter: 'news', query: 'x' }), '');
  assert.equal(searchFromFilters({ front: false, topic: 'identity', microsoftFilter: 'all', query: '' }), 'topic=identity');
  assert.equal(searchFromFilters({ front: false, topic: 'microsoft', microsoftFilter: 'news', query: 'entra id' }), 'topic=microsoft&microsoft=news&search=entra+id');
  assert.equal(searchFromFilters(filtersFromSearch('?topic=all&search=cloud')), 'topic=all&search=cloud');
});
