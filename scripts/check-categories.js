// Optional histogram of live /api/news category + score buckets. Non-blocking; CI stays on check-feeds.
import { createNewsService, createAppServer } from '../server.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = await mkdtemp(join(tmpdir(), 'beacon-categories-'));
const service = createNewsService({ cacheFile: join(dir, 'news.json') });
const server = createAppServer({ service });
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/news`);
  const page = await response.json();
  const result = await service.getNews();
  const counts = {};
  const scores = { low: 0, mid: 0, high: 0 };
  for (const article of result.articles || []) {
    counts[article.category] = (counts[article.category] || 0) + 1;
    const score = Number(article.topicScore);
    if (!Number.isFinite(score) || score < 0.4) scores.low++;
    else if (score < 0.7) scores.mid++;
    else scores.high++;
  }
  console.log(JSON.stringify({
    httpStatus: response.status,
    articles: result.articles?.length || 0,
    frontPageIds: result.frontPageIds?.length || 0,
    categories: counts,
    topicScore: scores,
  }, null, 2));
} finally {
  await new Promise(resolve => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
}
