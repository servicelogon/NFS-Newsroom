// Validate metadata and local asset references before publishing a deployment.
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePost } from '../blog.js';
import { STATIC } from '../static-assets.js';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
let count = 0, failed = false;
for (const file of await readdir(join(root, 'content/posts'), { withFileTypes: true })) {
  if (!file.isFile() || !file.name.endsWith('.md')) continue;
  try {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(file.name)) throw new Error('Expected a lowercase hyphenated filename');
    const post = parsePost(await readFile(join(root, 'content/posts', file.name), 'utf8'), file.name.slice(0, -3), { includeDrafts: true });
    const assets = [post.image, ...[...post.html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map(match => match[1])];
    for (const path of assets.filter(Boolean)) if (path.startsWith('/assets/') && !STATIC.has(path)) throw new Error(`Missing or unmapped asset: ${path}`);
    count++;
  } catch (error) { failed = true; console.error(`${file.name}: ${error.message}`); }
}
if (failed) process.exitCode = 1;
else console.log(`Validated ${count} posts, metadata, and local assets.`);
