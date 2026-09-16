import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadPosts } from '../blog.js';
import { createAppServer } from '../server.js';
const source = (title, date = '2026-09-14', extra = '', body = '## Heading\n\n**Strong** and [safe](https://example.com).') => `---\ntitle: ${title}\ndescription: A test field note\ndate: ${date}\n${extra}---\n${body}`;
async function directory(t) {
  const dir = await mkdtemp(join(tmpdir(), 'nfs-posts-'));
  t.after(() => rm(dir, { recursive:true, force:true }));
  return dir;
}
test('posts load newest first, support Markdown, and reflect folder edits without a restart', async t => {
  const dir = await directory(t);
  await writeFile(join(dir, 'first.md'), source('First', '2026-09-01'));
  await writeFile(join(dir, 'second.md'), source('Second'));
  let posts = await loadPosts(dir);
  assert.deepEqual(posts.map(p => p.slug), ['second', 'first']);
  assert.match(posts[0].html, /<h2>Heading<\/h2>/);
  assert.match(posts[0].html, /<strong>Strong<\/strong>/);
  await writeFile(join(dir, 'second.md'), source('Edited'));
  posts = await loadPosts(dir);
  assert.equal(posts[0].title, 'Edited');
  await rm(join(dir, 'second.md'));
  assert.equal((await loadPosts(dir)).length, 1);
});
test('drafts, malformed metadata, invalid dates and non-post files are excluded', async t => {
  const dir = await directory(t);
  await writeFile(join(dir, 'draft.md'), source('Draft', '2026-09-14', 'draft: true\n'));
  await writeFile(join(dir, 'invalid.md'), 'no front matter');
  await writeFile(join(dir, 'bad-date.md'), source('Bad date', '2026-02-30'));
  await writeFile(join(dir, 'README.md'), source('Instructions'));
  await writeFile(join(dir, 'good.md'), source('Good'));
  assert.deepEqual((await loadPosts(dir)).map(p => p.slug), ['good']);
  assert.deepEqual(await loadPosts(join(dir, 'missing')), []);
});
test('Markdown escapes raw HTML and refuses executable links', async t => {
  const dir = await directory(t);
  await writeFile(join(dir, 'safe.md'), source('Safe', '2026-09-14', '', '<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n<img src=x onerror=alert(1)>'));
  const [post] = await loadPosts(dir);
  assert.doesNotMatch(post.html, /<script|<img|href="javascript:/);
  assert.match(post.html, /&lt;script&gt;/);
});
test('Markdown code fences are syntax highlighted without exposing source HTML', async t => {
  const dir = await directory(t);
  await writeFile(join(dir, 'shell.md'), source('Shell', '2026-09-14', '', '```bash\nprintf "hello"\n```'));
  const [post] = await loadPosts(dir);
  assert.match(post.html, /<pre class="hljs"><code class="hljs language-bash">/);
  assert.match(post.html, /hljs-string/);
  assert.doesNotMatch(post.html, /<script/);
});
test('HTTP serves blog, post, tools, newsroom and assets; drafts and arbitrary files stay private', async t => {
  const dir = await directory(t);
  await writeFile(join(dir, 'published.md'), source('Published'));
  await writeFile(join(dir, 'draft.md'), source('Draft', '2026-09-14', 'draft: true\n'));
  const server = createAppServer({ postsDirectory:dir, service:{ getNews:async () => ({ articles:[], sources:[] }) } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const path of ['/', '/index.html', '/blog', '/blog/', '/blog/published', '/blog/published/', '/tools', '/tools/', '/newsroom', '/newsroom/', '/assets/site.css', '/assets/site.js', '/assets/blog/entra-default-settings-header.jpg', '/assets/blog/entra-block-legacy-authentication.jpg', '/assets/blog/entra-user-default-permissions.jpg', '/assets/blog/entra-user-consent-settings.jpg', '/assets/blog/evilginx-quickstart-header.webp', '/assets/blog/entra-conditional-access-baselines-header.webp', '/assets/blog/entra-conditional-access-policy-list.webp']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
  }
  assert.match(await (await fetch(base)).text(), /href="\/blog\/published"/);
  const tools = await (await fetch(base + '/tools')).text();
  assert.match(tools, /https:\/\/servicelogon.github.io\/copilot-security-trail\//);
  assert.match(tools, /https:\/\/servicelogon.github.io\/PasskeyLookup\//);
  for (const path of ['/blog/draft', '/blog/missing', '/blog/%2e%2e%2fserver', '/content/posts/published.md', '/blog.js', '/assets/../package.json']) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
  assert.equal(await (await fetch(base + '/blog/published', {method:'HEAD'})).text(), '');
  assert.equal((await fetch(base + '/tools', {method:'POST'})).status, 405);
  await rm(join(dir, 'published.md'));
  assert.match(await (await fetch(base)).text(), /A new chapter is on the way/);
});
