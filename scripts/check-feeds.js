// Hits live RSS feeds through /api/news and exits 1 if any source is not "ok".
import { createNewsService, createAppServer, FEEDS } from '../server.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = await mkdtemp(join(tmpdir(), 'beacon-live-')); // throwaway cache so this run does not touch .cache/news.json
const service = createNewsService({ cacheFile: join(dir, 'news.json') });
const server = createAppServer({ service });
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); // port 0 = OS picks a free port
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/news`);
  const page = await response.json();
  const result = await service.getNews();
  console.log(JSON.stringify({ httpStatus: response.status, initialPageArticles: page.articles.length, updatedAt: result.updatedAt, articles: result.articles.length, sources: result.sources.map(s => ({ ...s, url: FEEDS.find(f => f.name === s.name).url, articles: result.articles.filter(a => a.source === s.name).length })), sample: result.articles[0] }, null, 2));
  if (response.status !== 200 || result.sources.some(s => s.status !== 'ok')) process.exitCode = 1;
} finally {
  await new Promise(resolve => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
}
