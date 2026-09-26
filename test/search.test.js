import test from 'node:test';
import assert from 'node:assert/strict';
import { itemMatchesQuery, searchIndex, SITE_TOOLS } from '../blog.js';

test('search index lists published posts and the toolbox entries', () => {
  const catalog = searchIndex([
    { slug: 'first-note', title: 'First note', description: 'Identity field note' },
    { slug: 'second-note', title: 'Second note', description: 'Cloud field note' },
  ]);
  assert.deepEqual(catalog.posts, [
    { title: 'First note', href: '/blog/first-note', description: 'Identity field note' },
    { title: 'Second note', href: '/blog/second-note', description: 'Cloud field note' },
  ]);
  assert.deepEqual(catalog.tools, SITE_TOOLS);
  assert.equal(catalog.tools.length, 2);
});

test('query matching is case-insensitive across title, description, and source', () => {
  const post = { title: 'Entra Default Settings', description: 'Conditional Access field note' };
  const headline = { title: 'Cloud posture issue', description: 'Kubernetes exposure', source: 'Fixture Wire' };
  assert.equal(itemMatchesQuery(post, ''), true);
  assert.equal(itemMatchesQuery(post, 'entra'), true);
  assert.equal(itemMatchesQuery(post, 'CONDITIONAL'), true);
  assert.equal(itemMatchesQuery(post, 'passkey'), false);
  assert.equal(itemMatchesQuery(headline, 'fixture'), true);
  assert.equal(itemMatchesQuery(headline, 'xyz'), false);
});
