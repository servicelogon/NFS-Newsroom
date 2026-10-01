// Site routes; feed ingestion, API selection, assets, and responses are separate modules.
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { FEEDS } from './sources.js';
import { classify, selectFrontPage } from './topic-classifier.js';
import { createNewsService } from './news-service.js';
import { newsQuery, newsPage, headlineSearch } from './news-api.js';
import { STATIC, versionedHtml } from './static-assets.js';
import { CACHE, createResponseSender } from './http-response.js';
import { loadPosts, blogPage, postPage, tagPage, tagNotFoundPage, toolsPage, notFoundPage, layout, sitemapXml, robotsTxt, tagSlug, SITE_ORIGIN, normalizeOrigin } from './blog.js';
export { FEEDS, classify, selectFrontPage, createNewsService };
const ROOT = dirname(fileURLToPath(import.meta.url));
const newsroomBody = await readFile(join(ROOT, 'index.html'), 'utf8');
const NEWSROOM_DESCRIPTION = 'A considered view of cloud and identity security news, linked to the original reporting.';

// HTTP handler: GET/HEAD only. Routes are an allow-list — unknown paths 404.
export function createAppServer({ service = createNewsService(), postsDirectory = join(ROOT, 'content/posts'), siteOrigin = SITE_ORIGIN } = {}) {
  const origin = normalizeOrigin(siteOrigin);
  const respond = createResponseSender(versionedHtml);
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const send = (status, body, type, cacheControl, asset) => respond(req, res, status, body, type, cacheControl, asset);
    const html = (status, body) => send(status, body, 'text/html; charset=utf-8', status === 200 ? CACHE.html : CACHE.error);
    try {
      if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); return await send(405, 'Method not allowed'); }
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/health') {
        return await send(200, JSON.stringify({ ok: true }), 'application/json; charset=utf-8');
      }
      if (url.pathname === '/robots.txt') return await send(200, robotsTxt(origin), 'text/plain; charset=utf-8', CACHE.meta);
      if (url.pathname === '/sitemap.xml') return await send(200, sitemapXml(await loadPosts(postsDirectory), origin), 'application/xml; charset=utf-8', CACHE.meta);
      if (url.pathname === '/api/news' || url.pathname === '/api/search') {
        let options;
        const search = url.pathname === '/api/search';
        try { options = newsQuery(url.searchParams, { search }); }
        catch (error) { return await send(400, error.message); }
        const snapshot = await service.getNews({ force: options.force });
        const data = search ? headlineSearch(snapshot, options.query) : newsPage(snapshot, options);
        return await send(200, JSON.stringify(data), 'application/json; charset=utf-8', options.force ? CACHE.error : CACHE.api);
      }
      if (['/', '/index.html', '/blog', '/blog/'].includes(url.pathname)) {
        return await html(200, blogPage(await loadPosts(postsDirectory), { origin }));
      }
      if (['/tools', '/tools/'].includes(url.pathname)) return await html(200, toolsPage({ origin, posts: await loadPosts(postsDirectory) }));
      if (url.pathname === '/newsroom' || url.pathname === '/newsroom/') {
        return await html(200, layout('Newsroom', NEWSROOM_DESCRIPTION, 'Newsroom', newsroomBody, {
          path: '/newsroom', origin, posts: await loadPosts(postsDirectory),
          styles: ['/assets/newsroom.css'], scripts: ['/assets/newsroom.js'], bodyClass: 'newsroom',
        }));
      }
      const tagRoute = url.pathname.match(/^\/blog\/tag\/([^/]+)\/?$/);
      if (tagRoute) {
        let segment = tagRoute[1];
        try { segment = decodeURIComponent(segment); }
        catch { return await html(404, tagNotFoundPage({ origin, path: url.pathname })); }
        const slug = tagSlug(segment);
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return await html(404, tagNotFoundPage({ origin, path: url.pathname }));
        if (segment !== slug) {
          res.writeHead(301, { Location: `/blog/tag/${slug}`, 'Cache-Control': CACHE.meta });
          return res.end();
        }
        const posts = await loadPosts(postsDirectory);
        const matches = posts.filter(post => post.tags.some(tag => tagSlug(tag) === slug));
        if (!matches.length) return await html(404, tagNotFoundPage({ origin, path: `/blog/tag/${slug}`, posts }));
        const label = matches.flatMap(post => post.tags).find(tag => tagSlug(tag) === slug);
        return await html(200, tagPage(label, matches, { origin, posts }));
      }
      if (url.pathname.startsWith('/blog/')) {
        // Slugs must match the on-disk filename pattern; anything else is a 404, not a path walk.
        const slug = url.pathname.slice(6).replace(/\/$/, '');
        const posts = await loadPosts(postsDirectory);
        const post = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? posts.find(post => post.slug === slug) : null;
        return await html(post ? 200 : 404, post ? postPage(post, { origin, posts }) : notFoundPage({ origin, path: slug ? `/blog/${slug}` : url.pathname, posts }));
      }
      const asset = STATIC.get(url.pathname);
      if (!asset) return await send(404, 'Not found');
      const version = asset.hash;
      const cacheControl = version && url.searchParams.get('v') === version ? CACHE.assetImmutable : CACHE.assetShort;
      return await send(200, asset.encoded.identity, asset.type, cacheControl, asset);
    } catch (err) {
      console.error(`Newsroom request failed: ${err.message}`);
      return await send(500, 'Internal server error');
    }
  });
}

function localNetworkAddress() { // first non-loopback IPv4 for the LAN preview URL
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return null;
}
// Tests import this file; only bind a port when it is run as `node server.js`.
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
