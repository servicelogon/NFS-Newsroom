// Bounded feed ingestion and a persisted snapshot; HTTP paging lives in news-api.js.
import Parser from 'rss-parser';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEEDS } from './sources.js';
import { classify, selectFrontPage } from './topic-classifier.js';
import { externalNewsArticle } from './news-policy.js';
const ROOT = dirname(fileURLToPath(import.meta.url));
const parser = new Parser();

// Strip markup so classification and summaries never see raw HTML from a feed.
function text(value = '') {
  return String(value).replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
}


// Allow only http(s) article/image URLs; drop tracking params and credentials.
function cleanUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
    return url.href;
  } catch {
    return null;
  }
}

// Prefer enclosure/media tags; fall back to the first <img> in the item HTML.
function imageUrl(item) {
  const candidates = [
    item.enclosure?.type?.startsWith('image/') ? item.enclosure.url : null,
    item['media:content']?.$.url,
    item['media:thumbnail']?.$.url,
    item.image?.url || item.image,
  ];
  const html = String(item.content || item.summary || item.description || '');
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (match) candidates.push(match[1]);
  return candidates.map(cleanUrl).find(Boolean) || null;
}

// Drop items without a safe URL or title. Id is a short hash of the canonical URL.
function article(item, source, forcedCategory) {
  const href = cleanUrl(item.link);
  if (!href) return null;
  const title = text(item.title).slice(0, 500);
  if (!title) return null;
  const summary = text(item.contentSnippet || item.summary || item.content).slice(0, 600);
  const date = Date.parse(item.isoDate || item.pubDate);
  const image = imageUrl(item);
  const classified = classify({
    title,
    summary,
    rssCategories: item.categories || [],
    source,
    forcedCategory,
  });
  return externalNewsArticle({ id: createHash('sha256').update(href).digest('hex').slice(0, 24), title, url: href, source,
    publishedAt: Number.isFinite(date) ? new Date(date).toISOString() : null, summary,
    ...(image ? { imageUrl: image } : {}),
    ...(classified.sourceCategory ? { sourceCategory: classified.sourceCategory } : {}),
    category: classified.category,
    topicScore: classified.topicScore });
}

// Bounded RSS fetch: no redirects, hard timeout, stream capped at maxBytes.
async function fetchFeed(url, fetchImpl, timeoutMs, maxBytes, refreshSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Feed request timed out')), timeoutMs);
  try {
    // redirect:'error' blocks open-redirect hops; refreshSignal aborts leftover fetches at the global deadline.
    const response = await fetchImpl(url, { signal: AbortSignal.any([controller.signal, refreshSignal]), redirect: 'error', headers: { 'User-Agent': 'NFSNewsroom/1.0 RSS reader', Accept: 'application/rss+xml, application/xml, text/xml' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw new Error('Feed exceeds size limit'); }
    if (!response.body) throw new Error('Empty feed');
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) { await reader.cancel(); throw new Error('Feed exceeds size limit'); }
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
    return await parser.parseString(Buffer.concat(chunks).toString('utf8'));
  } finally { clearTimeout(timer); }
}

// Aggregates all feeds, persists a 5-minute disk cache, and coalesces overlapping getNews() calls.
export function createNewsService({ feeds = FEEDS, fetchImpl = fetch, cacheFile = join(ROOT, '.cache/news.json'), ttlMs = 300_000, now = Date.now, timeoutMs = 8_000, concurrency = 8, totalTimeoutMs = 24_000, maxBytes = 3_000_000, maxStaleMs = 7 * 24 * 60 * 60 * 1000, minRefreshMs = 30_000 } = {}) {
  let cache = null, inflight = null, loaded = false;
  const snapshots = new WeakMap();
  const snapshot = value => {
    if (!snapshots.has(value)) snapshots.set(value, output(value, minRefreshMs));
    return snapshots.get(value);
  };
  async function refresh(force = false) {
    if (!loaded) {
      loaded = true;
      try {
        const disk = JSON.parse(await readFile(cacheFile, 'utf8'));
        if (disk.version === 1 && Number.isFinite(disk.checkedAt) && Array.isArray(disk.batches) && disk.batches.every(b => typeof b.source?.name === 'string' && Array.isArray(b.articles))) {
          const byName = new Map(disk.batches.map(b => [b.source.name, b]));
          // Reuse articles by source name if the catalog changed; force a refresh when names don't match.
          const sameCatalog = disk.batches.length === feeds.length && feeds.every(f => byName.get(f.name)?.feedUrl === f.url);
          cache = { ...disk, checkedAt: sameCatalog ? disk.checkedAt : 0, batches: feeds.map(f => {
            const batch = byName.get(f.name);
            if (!batch) return { source: { name: f.name, status: 'error' }, articles: [] };
            return { ...batch, source: { ...batch.source, lastSuccessAt: batch.source.lastSuccessAt || disk.updatedAt || new Date(disk.checkedAt).toISOString() } };
          }) };
        }
      } catch { /* Missing/corrupt cache is a cold start. */ }
    }
    if (cache && now() - cache.checkedAt >= 0 && now() - cache.checkedAt < (force ? minRefreshMs : ttlMs)) return snapshot(cache);
    let successes = 0;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('Refresh deadline exceeded')), totalTimeoutMs);
    const batches = new Array(feeds.length);
    let next = 0;
    const load = async feed => {
      try {
        controller.signal.throwIfAborted();
        const parsed = await fetchFeed(feed.url, fetchImpl, timeoutMs, maxBytes, controller.signal);
        successes++;
        return { feedUrl: feed.url, articles: parsed.items.map(item => article(item, feed.name, feed.category)).filter(Boolean), source: { name: feed.name, status: 'ok', checkedAt: new Date(now()).toISOString(), lastSuccessAt: new Date(now()).toISOString() } };
      } catch (err) {
        // Keep the last good articles for this source rather than emptying the feed.
        const previous = cache?.batches.find(b => b.source.name === feed.name);
        const lastSuccessAt = previous?.source.lastSuccessAt || null;
        const age = now() - Date.parse(lastSuccessAt);
        const articles = Number.isFinite(age) && age >= 0 && age <= maxStaleMs ? previous.articles : [];
        return { feedUrl: feed.url, articles, source: { name: feed.name, status: articles.length ? 'stale' : 'error', lastSuccessAt, checkedAt: new Date(now()).toISOString(), error: String(err.message).slice(0, 200) } };
      }
    };
    try {
      // Fixed-size worker pool: each worker pulls the next feed index until the list (or deadline) is done.
      await Promise.all(Array.from({length: Math.min(feeds.length, Math.max(1, Math.floor(concurrency)))}, async () => {
        while (next < feeds.length) {
          const i = next++;
          batches[i] = await load(feeds[i]);
        }
      }));
    } finally { clearTimeout(timer); }
    cache = { version: 1, checkedAt: now(), updatedAt: successes ? new Date(now()).toISOString() : cache?.updatedAt || null, batches };
    try {
      await mkdir(dirname(cacheFile), { recursive: true });
      const temp = `${cacheFile}.${process.pid}.tmp`;
      await writeFile(temp, JSON.stringify(cache), { mode: 0o600 });
      await rename(temp, cacheFile); // atomic replace so a crash never leaves a half-written cache
    } catch (err) { console.warn(`Newsroom cache write failed: ${err.message}`); }
    return snapshot(cache);
  }
  return { getNews({ force = false } = {}) {
    // One refresh at a time; overlapping callers share the same promise.
    if (!inflight) inflight = refresh(force).finally(() => { inflight = null; });
    return inflight;
  } };
}

// Flatten batches, drop duplicate URLs, newest first. Used by both TTL hits and fresh refreshes.
function output(cache, minRefreshMs) {
  const unique = new Map();
  const sources = [];
  for (const batch of cache.batches) {
    let articleCount = 0;
    for (const cached of batch.articles) {
      const article = externalNewsArticle(cached);
      if (!article) continue;
      articleCount++;
      if (!unique.has(article.url)) unique.set(article.url, { ...article, stale: batch.source.status === 'stale' });
    }
    sources.push({ ...batch.source, articleCount });
  }
  const articles = [...unique.values()].sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0));
  return { articles, sources, updatedAt: cache.updatedAt, checkedAt: new Date(cache.checkedAt).toISOString(), refreshAvailableAt: new Date(cache.checkedAt + minRefreshMs).toISOString(), frontPageIds: selectFrontPage(articles) };
}
