import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import Parser from 'rss-parser';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = dirname(fileURLToPath(import.meta.url));

import { FEEDS } from './sources.js';
import { loadPosts, blogPage, postPage, toolsPage, notFoundPage } from './blog.js';
export { FEEDS };
const parser = new Parser();
function text(value = '') {
  return String(value).replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
}
function category(value) {
  if (/\b(identity|entra|okta|iam|sso|mfa|oauth|saml|passkey|token|session|credential|account access|phishing|voice call|social engineering)\b/i.test(value)) return 'identity';
  if (/\b(cloud|aws|amazon web services|azure|gcp|google cloud|kubernetes|k8s|container|saas|cloud posture|cloud asset|storage bucket|blob storage|ci\/cd|pipeline|supply chain)\b/i.test(value)) return 'cloud';
  if (/vulnerab|\bcve-|patch|zero.day|exploit/i.test(value)) return 'vulnerabilities';
  if (/breach|data leak|data theft|extortion|compromise|incident|outage/i.test(value)) return 'incidents';
  if (/malware|ransomware|trojan|botnet/i.test(value)) return 'malware';
  return 'operations';
}
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
function article(item, source, forcedCategory) {
  const href = cleanUrl(item.link);
  if (!href) return null;
  const title = text(item.title).slice(0, 500);
  if (!title) return null;
  const summary = text(item.contentSnippet || item.summary || item.content).slice(0, 600);
  const date = Date.parse(item.isoDate || item.pubDate);
  const image = imageUrl(item);
  const content = `${title} ${summary} ${(item.categories || []).join(" ")}`;
  const detectedCategory = category(content);
  const articleCategory = forcedCategory === 'microsoft' && ['identity', 'cloud', 'vulnerabilities'].includes(detectedCategory)
    ? detectedCategory
    : forcedCategory || detectedCategory;
  return { id: createHash('sha256').update(href).digest('hex').slice(0, 24), title, url: href, source,
    publishedAt: Number.isFinite(date) ? new Date(date).toISOString() : null, summary,
    ...(image ? { imageUrl: image } : {}),
    ...(forcedCategory ? { sourceCategory: forcedCategory } : {}),
    category: articleCategory };
}
async function fetchFeed(url, fetchImpl, timeoutMs, maxBytes, refreshSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Feed request timed out')), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.any([controller.signal, refreshSignal]), redirect: 'error', headers: { 'User-Agent': 'BeaconNews/1.0 RSS reader', Accept: 'application/rss+xml, application/xml, text/xml' } });
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
export function createNewsService({ feeds = FEEDS, fetchImpl = fetch, cacheFile = join(ROOT, '.cache/news.json'), ttlMs = 300_000, now = Date.now, timeoutMs = 8_000, concurrency = 8, totalTimeoutMs = 24_000, maxBytes = 3_000_000 } = {}) {
  let cache = null, inflight = null, loaded = false;
  async function refresh() {
    if (!loaded) {
      loaded = true;
      try {
        const disk = JSON.parse(await readFile(cacheFile, 'utf8'));
        if (disk.version === 1 && Array.isArray(disk.batches) && disk.batches.every(b => typeof b.source?.name === 'string' && Array.isArray(b.articles))) {
          const byName = new Map(disk.batches.map(b => [b.source.name, b]));
          const sameCatalog = disk.batches.length === feeds.length && feeds.every(f => byName.has(f.name));
          cache = { ...disk, checkedAt: sameCatalog ? disk.checkedAt : 0, batches: feeds.map(f => byName.get(f.name) || {source:{name:f.name,status:'error'},articles:[]}) };
        }
      } catch { /* Missing/corrupt cache is a cold start. */ }
    }
    if (cache && now() - cache.checkedAt >= 0 && now() - cache.checkedAt < ttlMs) return output(cache);
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
        return { articles: parsed.items.map(item => article(item, feed.name, feed.category)).filter(Boolean), source: { name: feed.name, status: 'ok' } };
      } catch (err) {
        const articles = cache?.batches.find(b => b.source.name === feed.name)?.articles || [];
        return { articles, source: { name: feed.name, status: articles.length ? 'stale' : 'error', error: String(err.message).slice(0, 200) } };
      }
    };
    try {
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
      await rename(temp, cacheFile);
    } catch (err) { console.warn(`Beacon cache write failed: ${err.message}`); }
    return output(cache);
  }
  return { getNews() {
    if (!inflight) inflight = refresh().finally(() => { inflight = null; });
    return inflight;
  } };
}
// Only these exact paths are public. Add reviewed assets explicitly; never expose a directory.
const STATIC = new Map([['/newsroom', ['index.html', 'text/html; charset=utf-8']], ['/newsroom/', ['index.html', 'text/html; charset=utf-8']], ['/assets/site.css', ['assets/site.css', 'text/css; charset=utf-8']], ['/assets/site.js', ['assets/site.js', 'text/javascript; charset=utf-8']], ['/assets/newsroom-logo.png', ['assets/newsroom-logo.png', 'image/png']], ['/assets/new-frontier-security-logo.png', ['assets/new-frontier-security-logo.png', 'image/png']], ['/assets/blog/entra-default-settings-header.jpg', ['assets/blog/entra-default-settings-header.jpg', 'image/jpeg']], ['/assets/blog/entra-block-legacy-authentication.jpg', ['assets/blog/entra-block-legacy-authentication.jpg', 'image/jpeg']], ['/assets/blog/entra-user-default-permissions.jpg', ['assets/blog/entra-user-default-permissions.jpg', 'image/jpeg']], ['/assets/blog/entra-user-consent-settings.jpg', ['assets/blog/entra-user-consent-settings.jpg', 'image/jpeg']], ['/assets/blog/evilginx-quickstart-header.webp', ['assets/blog/evilginx-quickstart-header.webp', 'image/webp']], ['/assets/blog/evilginx-start-console.webp', ['assets/blog/evilginx-start-console.webp', 'image/webp']], ['/assets/blog/evilginx-configure-phishlet.webp', ['assets/blog/evilginx-configure-phishlet.webp', 'image/webp']], ['/assets/blog/evilginx-enable-phishlet.webp', ['assets/blog/evilginx-enable-phishlet.webp', 'image/webp']], ['/assets/blog/evilginx-list-lures.webp', ['assets/blog/evilginx-list-lures.webp', 'image/webp']], ['/assets/blog/evilginx-create-lure.webp', ['assets/blog/evilginx-create-lure.webp', 'image/webp']], ['/assets/blog/evilginx-get-lure-url.webp', ['assets/blog/evilginx-get-lure-url.webp', 'image/webp']], ['/assets/blog/evilginx-login-page.webp', ['assets/blog/evilginx-login-page.webp', 'image/webp']], ['/assets/blog/evilginx-captured-session.webp', ['assets/blog/evilginx-captured-session.webp', 'image/webp']], ['/assets/blog/evilginx-session-token.webp', ['assets/blog/evilginx-session-token.webp', 'image/webp']], ['/assets/blog/entra-conditional-access-baselines-header.webp', ['assets/blog/entra-conditional-access-baselines-header.webp', 'image/webp']], ['/assets/blog/entra-conditional-access-policy-list.webp', ['assets/blog/entra-conditional-access-policy-list.webp', 'image/webp']]]);
export function createAppServer({ service = createNewsService(), postsDirectory = join(ROOT, 'content/posts') } = {}) {
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const send = (status, body, type = 'text/plain; charset=utf-8') => {
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    try {
      if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); return send(405, 'Method not allowed'); }
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/health') {
        return send(200, JSON.stringify({ ok: true }), 'application/json; charset=utf-8');
      }
      if (url.pathname === '/api/news') {
        if (url.search) return send(400, 'Query parameters are not supported');
        return send(200, JSON.stringify(await service.getNews()), 'application/json; charset=utf-8');
      }
      if (['/', '/index.html', '/blog', '/blog/'].includes(url.pathname)) {
        return send(200, blogPage(await loadPosts(postsDirectory)), 'text/html; charset=utf-8');
      }
      if (['/tools', '/tools/'].includes(url.pathname)) return send(200, toolsPage(), 'text/html; charset=utf-8');
      if (url.pathname.startsWith('/blog/')) {
        const slug = url.pathname.slice(6).replace(/\/$/, '');
        const post = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? (await loadPosts(postsDirectory)).find(post => post.slug === slug) : null;
        return send(post ? 200 : 404, post ? postPage(post) : notFoundPage(), 'text/html; charset=utf-8');
      }
      const asset = STATIC.get(url.pathname);
      if (!asset) return send(404, 'Not found');
      return send(200, await readFile(join(ROOT, asset[0])), asset[1]);
    } catch (err) {
      console.error(`Beacon request failed: ${err.message}`);
      return send(500, 'Internal server error');
    }
  });
}
function localNetworkAddress() {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return null;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const server = createAppServer();
  server.listen(port, '0.0.0.0', () => {
    const activePort = server.address().port;
    const lan = localNetworkAddress();
    console.log('New Frontier Security: http://127.0.0.1:' + activePort);
    if (lan) console.log('Network preview: http://' + lan + ':' + activePort);
  });
  server.on('error', err => { console.error(err.message); process.exitCode = 1; });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close());
}
function output(cache) {
  const unique = new Map();
  for (const a of cache.batches.flatMap(b => b.articles)) if (!unique.has(a.url)) unique.set(a.url, a);
  return { articles: [...unique.values()].sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0)), sources: cache.batches.map(b => b.source), updatedAt: cache.updatedAt };
}
