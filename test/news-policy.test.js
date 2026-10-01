import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNewsService } from '../news-service.js';
import { newsPage, headlineSearch } from '../news-api.js';
import { FEEDS } from '../sources.js';

const articles = () => {
  const story = { title: 'Internal identity guide', category: 'cloud', source: 'Fixture Wire', publishedAt: new Date().toISOString(), topicScore: 0.9 };
  return [
    { ...story, id: 'external', title: 'External reporting about New Frontier Security', url: 'https://example.com/report', imageUrl: 'https://www.newfrontiersecurity.net/assets/blog/header.jpg' },
    { ...story, id: 'similar-host', title: 'External identity reporting', url: 'https://newfrontiersecurity.net.example.com/report' },
    ...['https://newfrontiersecurity.net/blog/guide', 'https://WWW.NEWFRONTIERSECURITY.NET/blog/guide', 'https://blog.newfrontiersecurity.net/guide', 'https://newfrontiersecurity.net./blog/guide', '/blog/guide'].map((url, i) => ({ ...story, id: 'own-' + i, url })),
    ...['NFS', 'NFS Blog', 'New Frontier Security', 'New Frontier Security Blog'].map((source, i) => ({ ...story, id: 'syndicated-' + i, url: `https://example.com/syndicated/${i}`, source })),
  ];
};

test('NFS posts stay out of pages, front page, search, counts and pulse; external references remain', () => {
  const all = articles();
  const snapshot = { articles: all, frontPageIds: all.map(a => a.id) };
  const page = newsPage(snapshot);
  assert.deepEqual(page.articles.map(a => a.id), ['external', 'similar-host']);
  assert.deepEqual(page.frontPageIds, ['external', 'similar-host']);
  assert.deepEqual(page.frontPage.map(a => a.id), page.frontPageIds);
  assert.equal(page.totalArticles, 2);
  assert.equal(page.total, 2);
  assert.equal(page.topicCounts.cloud, 2);
  assert.equal(page.pulseCounts.cloud, 2);
  assert.equal(page.articles[0].imageUrl, undefined);
  assert.equal(headlineSearch(snapshot, 'internal').articles.length, 0);
  assert.equal(headlineSearch(snapshot, 'New Frontier Security').articles.length, 1);
});

test('fresh RSS excludes NFS links and artwork while keeping external publisher images', async t => {
  assert.ok(FEEDS.every(feed => !new URL(feed.url).hostname.endsWith('newfrontiersecurity.net')));
  const dir = await mkdtemp(join(tmpdir(), 'nfs-external-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const xml = `<rss version="2.0"><channel><title>Fixture</title>
    <item><title>Own identity post</title><link>https://newfrontiersecurity.net/blog/guide</link></item>
    <item><title>External cloud report</title><link>https://example.com/report</link><enclosure url="https://newfrontiersecurity.net/assets/blog/header.jpg" type="image/jpeg"/></item>
    <item><title>External identity report</title><link>https://example.com/identity</link><enclosure url="https://example.com/publisher.jpg" type="image/jpeg"/></item>
  </channel></rss>`;
  const service = createNewsService({ cacheFile: join(dir, 'news.json'), feeds: [{ name: 'Fixture', url: 'https://example.com/rss' }], fetchImpl: async () => new Response(xml) });
  const result = await service.getNews();
  assert.equal(result.articles.length, 2);
  assert.equal(result.sources[0].articleCount, 2);
  assert.equal(result.articles.find(a => a.url.endsWith('/report')).imageUrl, undefined);
  assert.equal(result.articles.find(a => a.url.endsWith('/identity')).imageUrl, 'https://example.com/publisher.jpg');
});

test('existing disk caches and stale fallback cannot reintroduce NFS posts or images', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'nfs-excluded-cache-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const cacheFile = join(dir, 'news.json');
  let time = Date.now(), calls = 0;
  const feed = { name: 'Fixture Wire', url: 'https://example.com/rss' };
  await writeFile(cacheFile, JSON.stringify({ version: 1, checkedAt: time, updatedAt: new Date(time).toISOString(), batches: [{ feedUrl: feed.url, source: { name: feed.name, status: 'ok', lastSuccessAt: new Date(time).toISOString() }, articles: articles() }] }));
  const service = createNewsService({ cacheFile, feeds: [feed], now: () => time, ttlMs: 100, fetchImpl: async () => { calls++; throw new Error('Offline'); } });
  const cached = await service.getNews();
  assert.equal(calls, 0);
  assert.equal(cached.articles.length, 2);
  assert.equal(cached.sources[0].articleCount, 2);
  assert.equal(cached.articles[0].imageUrl, undefined);
  time += 101;
  const stale = await service.getNews();
  assert.equal(calls, 1);
  assert.equal(stale.articles.length, 2);
  assert.equal(stale.sources[0].articleCount, 2);
  assert.ok(stale.articles.every(a => a.stale));
  assert.equal(stale.articles[0].imageUrl, undefined);
});
