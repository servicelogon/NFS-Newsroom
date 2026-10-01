import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer, createNewsService } from '../server.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chosenEncoding } from '../http-response.js';

test('bounded pages preserve full coverage, front-page stories, topic counts and compact search', async t => {
  const now = new Date().toISOString();
  const articles = Array.from({ length: 150 }, (_, i) => ({
    id: String(i), title: `Story ${i}`, summary: i === 149 ? 'Rare searchable token' : 'News summary',
    url: `https://example.com/${i}`, category: i === 149 ? 'identity' : 'vulnerabilities',
    source: 'Fixture', publishedAt: now,
  }));
  const snapshot = { articles, sources: [{ name: 'Fixture', status: 'ok' }], frontPageIds: ['149'], updatedAt: now, checkedAt: now };
  const server = createAppServer({ service: { getNews: async () => snapshot } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async path => (await fetch(base + path)).json();
  const first = await get('/api/news');
  assert.equal(first.articles.length, 40);
  assert.equal(first.total, 150);
  assert.equal(first.nextOffset, 40);
  assert.equal(first.frontPage[0].id, '149');
  assert.equal(first.topicCounts.vulnerabilities, 149);
  assert.equal(first.pulseCounts.vulnerabilities, 149);
  const last = await get('/api/news?offset=120');
  assert.equal(last.articles.length, 30);
  assert.equal(last.articles.at(-1).id, '149');
  assert.equal(last.nextOffset, null);
  assert.equal((await get('/api/news?topic=identity')).articles[0].id, '149');
  const search = await get('/api/search?query=RARE');
  assert.equal(search.articles[0].title, 'Story 149');
  assert.equal(search.articles[0].summary, undefined);
  assert.equal(search.articles[0].imageUrl, undefined);
  assert.equal((await get('/api/search?query=Story')).articles.length, 20);
  const refresh = await fetch(base + '/api/news?refresh=1');
  assert.equal(refresh.headers.get('cache-control'), 'no-store');
  for (const query of ['limit=101', 'limit=0', 'limit=-1', 'offset=1.2', 'offset=100001', 'topic=bad', 'microsoftFilter=bad', 'refresh=0', 'query=' + 'x'.repeat(201), 'topic=cloud&topic=identity', 'url=https://example.com']) {
    const response = await fetch(base + '/api/news?' + query);
    assert.equal(response.status, 400, query);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal((await fetch(base + '/api/search?url=https://example.com')).status, 400);
});

test('Microsoft server filters exclude CVEs and distinguish community previews', async t => {
  const articles = [
    { id: '1', title: 'Entra update', source: 'Microsoft Entra Blog', category: 'identity', url: 'https://example.com/1' },
    { id: '2', title: 'CVE-2026-1234 advisory', source: 'Microsoft Entra Blog', category: 'vulnerabilities', url: 'https://example.com/2' },
    { id: '3', title: 'MC123456 — New admin setting', source: 'MS Message Center', category: 'microsoft', url: 'https://example.com/3' },
    { id: '4', title: 'Security advisory', source: 'MSRC Security Update Guide', category: 'vulnerabilities', url: 'https://example.com/4' },
  ];
  const server = createAppServer({ service: { getNews: async () => ({ articles, sources: [] }) } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/news?topic=microsoft`;
  assert.deepEqual((await (await fetch(base)).json()).articles.map(a => a.id), ['1', '3']);
  assert.deepEqual((await (await fetch(base + '&microsoftFilter=news')).json()).articles.map(a => a.id), ['1']);
  assert.deepEqual((await (await fetch(base + '&microsoftFilter=message-center')).json()).articles.map(a => a.id), ['3']);
});

test('snapshots are reused, manual refresh is throttled, and stale articles expire', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'nfs-retention-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let time = Date.now(), calls = 0, offline = false;
  const service = createNewsService({
    cacheFile: join(dir, 'news.json'), feeds: [{ name: 'Fixture', url: 'https://example.com/rss' }],
    ttlMs: 1000, minRefreshMs: 50, maxStaleMs: 2000, now: () => time,
    fetchImpl: async () => {
      calls++;
      if (offline) throw new Error('Offline');
      return new Response('<rss version="2.0"><channel><title>Fixture</title><item><title>Identity token</title><link>https://example.com/story</link></item></channel></rss>');
    },
  });
  const first = await service.getNews();
  assert.equal(await service.getNews(), first);
  assert.equal(await service.getNews({ force: true }), first);
  assert.equal(calls, 1);
  time += 51;
  assert.notEqual(await service.getNews({ force: true }), first);
  assert.equal(calls, 2);
  offline = true;
  time += 1001;
  const stale = await service.getNews();
  assert.equal(stale.sources[0].status, 'stale');
  assert.equal(stale.articles[0].stale, true);
  assert.equal(stale.sources[0].lastSuccessAt, new Date(time - 1001).toISOString());
  time += 1001;
  const expired = await service.getNews();
  assert.equal(expired.sources[0].status, 'error');
  assert.equal(expired.articles.length, 0);
});

test('compression honors explicit exclusions and module dependencies have content versions', async t => {
  assert.equal(chosenEncoding('br;q=0, gzip;q=0, *;q=1'), null);
  assert.equal(chosenEncoding('br;q=0.3, gzip;q=0.8'), 'gzip');
  const server = createAppServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const asset = await fetch(base + '/assets/newsroom.js');
  const etag = asset.headers.get('etag');
  assert.match(await asset.text(), /from '\/assets\/article-card\.js\?v=[a-f0-9]{12}'/);
  const conditional = await fetch(base + '/assets/newsroom.js', { headers: { 'If-None-Match': etag } });
  assert.equal(conditional.status, 304);
  assert.equal(await conditional.text(), '');
});
