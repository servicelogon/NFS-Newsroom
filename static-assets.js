// Exact reviewed scripts/brand assets plus filename-validated blog images.
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareBody } from './http-response.js';
const ROOT = dirname(fileURLToPath(import.meta.url));
const files = new Map([
  ['/assets/site.css', ['assets/site.css', 'text/css; charset=utf-8']],
  ['/assets/site.js', ['assets/site.js', 'text/javascript; charset=utf-8']],
  ['/assets/newsroom-states.js', ['newsroom-states.js', 'text/javascript; charset=utf-8']],
  ['/assets/newsroom-logo.png', ['assets/newsroom-logo.png', 'image/png']],
  ['/assets/new-frontier-security-logo.png', ['assets/new-frontier-security-logo.png', 'image/png']],
  ['/assets/notes-from-the-frontier.png', ['assets/notes-from-the-frontier.png', 'image/png']],
  ['/assets/toolbox-wordmark.png', ['assets/toolbox-wordmark.png', 'image/png']],
  ['/assets/nfs-footer-mark.png', ['assets/nfs-footer-mark.png', 'image/png']],
  ['/favicon.ico', ['assets/favicon.ico', 'image/x-icon']],
  ['/assets/favicon.ico', ['assets/favicon.ico', 'image/x-icon']],
  ['/assets/favicon-32.png', ['assets/favicon-32.png', 'image/png']],
  ['/assets/apple-touch-icon.png', ['assets/apple-touch-icon.png', 'image/png']],
]);
for (const name of ['theme.js', 'search.js', 'news-topics.js', 'coverage-pulse.js', 'article-card.js', 'newsroom.js']) files.set(`/assets/${name}`, [`assets/${name}`, 'text/javascript; charset=utf-8']);
files.set('/assets/newsroom.css', ['assets/newsroom.css', 'text/css; charset=utf-8']);
for (const file of await readdir(join(ROOT, 'assets/blog'), { withFileTypes: true })) {
  if (file.isFile() && /^[a-z0-9]+(?:-[a-z0-9]+)*\.(?:jpe?g|webp)$/.test(file.name)) {
    files.set(`/assets/blog/${file.name}`, [`assets/blog/${file.name}`, file.name.endsWith('.webp') ? 'image/webp' : 'image/jpeg']);
  }
}
export const STATIC = new Map();
const loading = new Set();
async function prepare(path) {
  if (STATIC.has(path)) return STATIC.get(path);
  if (loading.has(path)) throw new Error(`Circular public module import: ${path}`);
  loading.add(path);
  const [file, type] = files.get(path);
  let body = await readFile(join(ROOT, file));
  if (type.startsWith('text/javascript')) {
    let source = body.toString('utf8');
    // Pin dependencies as well as the entry module. A redeploy cannot mix an
    // immutable entry with a browser's older unversioned dependency.
    const imports = [...source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)];
    for (const match of imports) {
      const dependency = match[1].startsWith('/') ? match[1] : posix.join(posix.dirname(path), match[1]);
      if (!files.has(dependency)) throw new Error(`Unmapped public module: ${dependency}`);
      const asset = await prepare(dependency);
      source = source.replace(match[0], match[0].replace(match[1], `${dependency}?v=${asset.hash}`));
    }
    body = Buffer.from(source);
  }
  const asset = await prepareBody(body, type);
  STATIC.set(path, asset);
  loading.delete(path);
  return asset;
}
for (const path of files.keys()) await prepare(path);
export function versionedHtml(html) {
  let out = String(html);
  for (const [path, asset] of [...STATIC].sort(([a], [b]) => b.length - a.length)) {
    if (path.startsWith('/assets/')) out = out.replaceAll(path, `${path}?v=${asset.hash}`);
  }
  return out;
}
