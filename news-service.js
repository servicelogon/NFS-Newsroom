// Bounded feed ingestion and a persisted snapshot; HTTP paging lives in news-api.js.
import Parser from 'rss-parser';
import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import { FEEDS } from './sources.js';
import { classify, selectFrontPage } from './topic-classifier.js';
import { externalNewsArticle } from './news-policy.js';
const ROOT = dirname(fileURLToPath(import.meta.url));
const parser = new Parser({
  customFields: {
    item: [
      ['media:content', 'media:content', { keepArray: true }],
      ['media:thumbnail', 'media:thumbnail', { keepArray: true }],
      ['media:group', 'media:group', { keepArray: true }],
    ],
  },
});

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

function mediaCandidate(node) {
  if (!node) return null;
  if (typeof node === 'string') return cleanUrl(node);
  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = mediaCandidate(entry);
      if (found) return found;
    }
    return null;
  }
  const kind = `${node.$?.type || ''} ${node.$?.medium || ''}`;
  if (/video|audio/.test(kind) && !/image/.test(kind)) return null;
  return cleanUrl(node.$?.url || node.url) || mediaCandidate(node['media:content']) || mediaCandidate(node['media:thumbnail']);
}

function htmlImage(html) {
  for (const match of String(html || '').matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    if (/\b(?:width|height)=["']1["']|spacer|pixel|tracking|badge/i.test(tag)) continue;
    const src = tag.match(/\bsrc=["']([^"']+)["']/i);
    const url = src && cleanUrl(src[1]);
    if (url) return url;
  }
  return null;
}

const IMAGE_META = ['og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src'];

function decodeEntities(value) {
  return String(value).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function tagAttrs(tag) {
  const attrs = {};
  for (const attr of tag.matchAll(/([:\w-]+)\s*=\s*["']([^"']*)["']/gi)) attrs[attr[1].toLowerCase()] = decodeEntities(attr[2]);
  return attrs;
}

// Site marks and tracking pixels are not story art.
function isStoryImage(value) {
  let path = '';
  try { path = decodeURIComponent(new URL(value).pathname).toLowerCase(); } catch { return false; }
  if (/(?:^|\/)(?:logo|favicon|apple-touch-icon|sprite|site-icon|avatar|gravatar)(?:[-_.][^/]*)?$/.test(path)) return false;
  if (/spacer|pixel|tracking|1x1|badge|favicon/.test(path)) return false;
  return true;
}

// Open Graph, Twitter, or image_src. The first real story image wins; logos do not.
function pageImage(html, pageUrl) {
  const buckets = new Map(IMAGE_META.map(name => [name, []]));
  const linked = [];
  for (const tag of String(html || '').matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = tagAttrs(tag[0]);
    const name = attrs.property || attrs.name || '';
    if (buckets.has(name) && attrs.content) buckets.get(name).push(attrs.content);
  }
  for (const tag of String(html || '').matchAll(/<link\b[^>]*>/gi)) {
    const attrs = tagAttrs(tag[0]);
    if (/\bimage_src\b/i.test(attrs.rel || '') && attrs.href) linked.push(attrs.href);
  }
  for (const raw of [...IMAGE_META.flatMap(name => buckets.get(name)), ...linked]) {
    let absolute;
    try { absolute = new URL(raw, pageUrl).href; } catch { continue; }
    const cleaned = cleanUrl(absolute);
    if (cleaned && isStoryImage(cleaned)) return cleaned;
  }
  return null;
}

function isPublicIp(address) {
  let ip = String(address).toLowerCase();
  if (ip.startsWith('::ffff:')) {
    const mapped = ip.slice('::ffff:'.length);
    if (isIP(mapped) === 4) ip = mapped;
  }
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    return true;
  }
  if (ip === '::1' || ip === '::') return false;
  if (ip.startsWith('fe80') || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('ff')) return false;
  return isIP(ip) === 6;
}

// Article links come from the feed catalog, but a poisoned item must not reach loopback or cloud metadata.
async function blockedTarget(value) {
  let url;
  try { url = new URL(value); } catch { return true; }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return true;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || (!host.includes('.') && !isIP(host))) return true;
  if (isIP(host)) return !isPublicIp(host);
  try {
    const records = await lookup(host, { all: true, verbatim: true });
    if (records.some(record => !isPublicIp(record.address))) return true;
  } catch { /* Tests inject fetch and may have no resolver. A real socket still has to pass the redirect checks. */ }
  return false;
}

async function readHead(response, maxBytes) {
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (size < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
      size += value.byteLength;
      if (/<\/head>/i.test(Buffer.concat(chunks).toString('utf8'))) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf8');
}

// '' means the page was checked and has no story image. null means try again later.
async function fetchArticleImage(pageUrl, fetchImpl, timeoutMs, budgetSignal) {
  let current = pageUrl;
  for (let hop = 0; hop < 4; hop++) {
    if (await blockedTarget(current)) return '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('Article request timed out')), timeoutMs);
    try {
      const response = await fetchImpl(current, {
        signal: AbortSignal.any([controller.signal, budgetSignal]),
        redirect: 'manual',
        headers: { 'User-Agent': 'NFSNewsroom/1.0 (article image lookup)', Accept: 'text/html,application/xhtml+xml' },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get('location');
        if (!location) return '';
        current = new URL(location, current).href;
        continue;
      }
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        return response.status === 429 || response.status >= 500 ? null : '';
      }
      const html = await readHead(response, 256_000);
      return pageImage(html, current) || '';
    } catch {
      return null;
    } finally { clearTimeout(timer); }
  }
  return '';
}

async function discoverImages(items, { fetchImpl, timeoutMs, budgetMs, concurrency }) {
  const found = new Map();
  if (!items.length) return found;
  const budget = new AbortController();
  const timer = setTimeout(() => budget.abort(new Error('Image lookup deadline')), budgetMs);
  let next = 0;
  try {
    await Promise.all(Array.from({ length: Math.min(items.length, Math.max(1, Math.floor(concurrency))) }, async () => {
      while (next < items.length && !budget.signal.aborted) {
        const item = items[next++];
        const image = await fetchArticleImage(item.url, fetchImpl, timeoutMs, budget.signal);
        if (image === null) continue;
        found.set(item.url, image);
        if (image) item.imageUrl = image;
      }
    }));
  } finally { clearTimeout(timer); }
  return found;
}

// Prefer a real image enclosure, then Media RSS, then the first picture in the post HTML.
function imageUrl(item) {
  const tagged = [
    item.enclosure?.type?.startsWith('image/') ? item.enclosure.url : null,
    mediaCandidate(item['media:content']),
    mediaCandidate(item['media:thumbnail']),
    mediaCandidate(item['media:group']),
    item.image?.url || (typeof item.image === 'string' ? item.image : null),
  ].map(cleanUrl).find(Boolean);
  if (tagged) return tagged;
  return htmlImage([item['content:encoded'], item.content, item.summary, item.description].filter(Boolean).join('\n'));
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

// The page paints at most the front page plus the first page of headlines.
// Scraping every other article held the news request long enough for the browser to give up.
const IMAGE_LOOKUP_PAGE = 40;
export const IMAGE_LOOKUP_BUDGET_MS = 8_000;

function imageLookupTargets(pending, batches, nowMs) {
  if (!pending.length) return pending;
  const preview = output({ batches, checkedAt: nowMs, updatedAt: null }, 0);
  const rank = new Map();
  preview.frontPageIds.forEach((id, index) => rank.set(id, index));
  for (const [index, article] of preview.articles.slice(0, IMAGE_LOOKUP_PAGE).entries()) {
    if (!rank.has(article.id)) rank.set(article.id, preview.frontPageIds.length + index);
  }
  return pending.filter(item => rank.has(item.id)).sort((a, b) => rank.get(a.id) - rank.get(b.id));
}

// Aggregates all feeds, persists a 5-minute disk cache, and coalesces overlapping getNews() calls.
export function createNewsService({ feeds = FEEDS, fetchImpl = fetch, cacheFile = join(ROOT, '.cache/news.json'), ttlMs = 300_000, now = Date.now, timeoutMs = 8_000, concurrency = 8, totalTimeoutMs = 24_000, maxBytes = 3_000_000, maxStaleMs = 7 * 24 * 60 * 60 * 1000, minRefreshMs = 30_000, imageBudgetMs = IMAGE_LOOKUP_BUDGET_MS, imageConcurrency = 8 } = {}) {
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
    const remembered = cache?.images && typeof cache.images === 'object' ? cache.images : {};
    const fromFeed = new Set();
    const pending = [];
    const queued = new Set();
    for (const batch of batches) {
      if (batch?.source?.status !== 'ok') continue;
      for (const item of batch.articles) if (item?.url && item.imageUrl) fromFeed.add(item.url);
    }
    for (const batch of batches) {
      if (batch?.source?.status !== 'ok') continue;
      for (const item of batch.articles) {
        if (!item?.url || fromFeed.has(item.url) || queued.has(item.url)) continue;
        if (Object.prototype.hasOwnProperty.call(remembered, item.url)) {
          if (remembered[item.url]) item.imageUrl = remembered[item.url];
          continue;
        }
        queued.add(item.url);
        pending.push(item);
      }
    }
    // Feeds stay inside their deadline. Only the stories this page can show are looked up, and a miss is remembered.
    const discovered = await discoverImages(imageLookupTargets(pending, batches, now()), { fetchImpl, timeoutMs: Math.min(timeoutMs, 6_000), budgetMs: imageBudgetMs, concurrency: imageConcurrency });
    const images = {};
    for (const batch of batches) {
      for (const item of batch?.articles || []) {
        if (!item?.url || fromFeed.has(item.url)) continue;
        const known = discovered.has(item.url) ? discovered.get(item.url) : (Object.prototype.hasOwnProperty.call(remembered, item.url) ? remembered[item.url] : null);
        if (known === null) continue;
        images[item.url] = known || '';
        if (known && !item.imageUrl) item.imageUrl = known;
      }
    }
    cache = { version: 1, checkedAt: now(), updatedAt: successes ? new Date(now()).toISOString() : cache?.updatedAt || null, batches, images };
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
