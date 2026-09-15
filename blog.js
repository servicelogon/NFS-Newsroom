import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import MarkdownIt from 'markdown-it';

const markdown = new MarkdownIt({ html: false, linkify: true, typographer: true });
export const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
function frontmatterValue(value) {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^\[.*\]$/.test(trimmed)) return trimmed.slice(1, -1).split(',').map(item => frontmatterValue(item)).filter(Boolean);
  return trimmed.replace(/^(['"])(.*)\1$/, '$2');
}
function parseFrontmatter(source) {
  const data = {};
  let listKey = null;
  for (const line of source.split('\n')) {
    const listItem = line.match(/^\s*-\s+(.+)$/);
    if (listItem && listKey) {
      data[listKey].push(frontmatterValue(listItem[1]));
      continue;
    }
    listKey = null;
    const field = line.match(/^([A-Za-z][A-Za-z0-9_-]*):(?:\s*(.*))?$/);
    if (!field) continue;
    const [, key, value = ''] = field;
    if (!value.trim()) {
      data[key] = [];
      listKey = key;
    } else data[key] = frontmatterValue(value);
  }
  return data;
}
const requiredString = (data, key) => {
  if (typeof data[key] !== 'string' || !data[key].trim()) throw new Error(`Missing ${key}`);
  return data[key].trim();
};
const optionalImage = value => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const image = value.trim();
  if (/^\/assets\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*\.jpe?g$/i.test(image)) return image;
  try {
    const url = new URL(image);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
};

// Read on each request so dropping in, editing, or removing a post needs no restart.
export async function loadPosts(directory) {
  let files;
  try { files = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const posts = await Promise.all(files.filter(file => file.isFile() && /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(file.name)).map(async file => {
    try {
      const source = (await readFile(join(directory, file.name), 'utf8')).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
      const frontmatter = source.match(/^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/);
      if (!frontmatter) throw new Error('Expected YAML front matter');
      const data = parseFrontmatter(frontmatter[1]);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Expected metadata fields');
      if (data.draft === true) return null;
      const title = requiredString(data, 'title');
      const description = requiredString(data, 'description');
      const date = requiredString(data, 'date');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('Expected a valid YYYY-MM-DD date');
      const body = frontmatter[2];
      const image = optionalImage(data.image);
      return { slug: file.name.slice(0, -3), title, description, date,
        author: typeof data.author === 'string' ? data.author : 'Nathan Hess',
        tags: Array.isArray(data.tags) ? data.tags.filter(tag => typeof tag === 'string').slice(0, 5) : [],
        sample: data.sample === true,
        ...(image ? { image, imageAlt: typeof data.imageAlt === 'string' && data.imageAlt.trim() ? data.imageAlt.trim() : title } : {}),
        minutes: Math.max(1, Math.ceil(body.trim().split(/\s+/).length / 220)),
        html: markdown.render(body) };
    } catch (error) {
      console.warn(`Skipping blog post ${file.name}: ${error.message}`);
      return null;
    }
  }));
  return posts.filter(Boolean).sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

export function navigation(active) {
  return `<details class="site-menu"><summary>${active}<span aria-hidden="true">☰</span></summary><nav aria-label="Main navigation">${[['Blog', '/'], ['Newsroom', '/newsroom'], ['Tools', '/tools']].map(([name, href]) => `<a href="${href}"${active === name ? ' aria-current="page"' : ''}>${name}</a>`).join('')}</nav></details>`;
}
const footer = `<footer class="site-footer"><a href="/">New Frontier Security</a><span>Independent thinking. Practical security.</span><a href="https://github.com/servicelogon" target="_blank" rel="noopener noreferrer">GitHub ↗</a></footer>`;
function layout(title, description, active, body) {
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="${escapeHtml(description)}"><title>${escapeHtml(title)} — New Frontier Security</title><link rel="stylesheet" href="/assets/site.css"><script src="/assets/site.js" defer></script></head><body class="publication"><a class="skip" href="#main">Skip to content</a><div class="shell"><header class="topbar"><a class="brand" href="/" aria-label="New Frontier Security home"><img class="brand-logo" src="/assets/new-frontier-security-logo.png" width="1585" height="423" alt="New Frontier Security"></a>${navigation(active)}</header><main id="main">${body}</main>${footer}</div></body></html>`;
}
const dateLabel = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const metadata = post => `<div class="post-meta"><time datetime="${post.date}">${dateLabel(post.date)}</time><span>${post.minutes} min read</span>${post.sample ? '<span class="sample-label">Sample post</span>' : ''}</div>`;
const tags = post => post.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
const postImage = (post, className) => post.image ? `<a class="${className}" href="/blog/${post.slug}" aria-label="Read ${escapeHtml(post.title)}"><img src="${escapeHtml(post.image)}" alt="${escapeHtml(post.imageAlt)}" loading="lazy" decoding="async"></a>` : '';
export function blogPage(posts) {
  const [featured, ...rest] = posts;
  return layout('Blog', 'Notes, ideas, and field guides on identity and cloud security by Nathan Hess.', 'Blog', `
    <section class="page-intro blog-intro"><div class="kicker">THE BLOG <span>BY NATHAN HESS</span></div><h1>Notes from<br>the <em>frontier.</em></h1><div class="intro-bottom"><p>Identity, cloud, and the questions worth exploring.</p><span class="issue-label">FIELD NOTES / 01</span></div></section>
    ${featured ? `<section class="featured-post" aria-labelledby="featured-title">${postImage(featured, 'feature-image')}<article class="feature-content"><span class="kicker">LATEST ENTRY</span>${metadata(featured)}<h2 id="featured-title"><a href="/blog/${featured.slug}">${escapeHtml(featured.title)}</a></h2><p>${escapeHtml(featured.description)}</p><a class="internal-button" href="/blog/${featured.slug}">Read the story</a></article></section>` : '<section class="empty-state"><h2>A new chapter is on the way.</h2><p>Check back soon for the first field note.</p></section>'}
    ${rest.length ? `<section class="more-posts" aria-labelledby="more-title"><h2 id="more-title" class="kicker">MORE FIELD NOTES</h2>${rest.map(post => `<article class="post-row"><div>${metadata(post)}<h3><a href="/blog/${post.slug}">${escapeHtml(post.title)}</a></h3><p>${escapeHtml(post.description)}</p></div><a class="internal-button post-row-button" href="/blog/${post.slug}" aria-label="Read ${escapeHtml(post.title)}">Read</a></article>`).join('')}</section>` : ''}
    <aside class="explore-strip"><p>Keep exploring.</p><a class="internal-button" href="/newsroom">Read the Newsroom</a><a class="internal-button" href="/tools">Open the toolbox</a></aside>`);
}
export function postPage(post) {
  return layout(post.title, post.description, 'Blog', `<article class="post-page"><a class="internal-button back-link" href="/">All field notes</a><header class="post-heading"><h1>${escapeHtml(post.title)}</h1><p class="post-deck">${escapeHtml(post.description)}</p>${metadata(post)}<p class="byline">By ${escapeHtml(post.author)}</p></header>${post.image ? `<figure class="post-hero"><img src="${escapeHtml(post.image)}" alt="${escapeHtml(post.imageAlt)}" decoding="async"></figure>` : ''}${post.sample ? '<aside class="sample-note">This is a placeholder post to try out the blog. Replace it with your own field notes when you’re ready.</aside>' : ''}<div class="prose">${post.html}</div><a class="internal-button post-return" href="/">Back to the blog</a></article>`);
}
export function notFoundPage() {
  return layout('Post not found', 'This field note could not be found.', 'Blog', '<section class="empty-state"><p class="kicker">404 / OFF THE MAP</p><h1>This trail ends here.</h1><p>That post may have moved or is still being written.</p><a class="internal-button" href="/">Back to the blog</a></section>');
}
export function toolsPage() {
  return layout('Tools', 'Explore Copilot Security Trail and Passkey AAGUID Lookup, tools by Nathan Hess.', 'Tools', `
    <section class="page-intro tools-intro"><div class="kicker">THE TOOLBOX <span>BUILT BY NATHAN HESS</span></div><h1>Serious security.<br><em>Room to play.</em></h1><div class="intro-bottom"><p>A few useful things for the identity-curious. Pick one. Dig in.</p><span class="issue-label">02 TOOLS / READY TO EXPLORE</span></div></section>
    <section class="tool-grid" aria-label="Identity and security tools">
      <article class="tool-card trail-card"><div class="tool-top"><span class="kicker">01 / EXPLORE</span><span class="tool-pill">INTERACTIVE GUIDE</span></div><div class="tool-visual trail-stops" aria-label="Five trail stations"><span>01<small>Data</small></span><i></i><span>02<small>Protection</small></span><i></i><span>03<small>Readiness</small></span><i></i><span>04<small>Agents</small></span><i></i><span>05<small>Zero Trust</small></span></div><div class="tool-copy"><p class="kicker">TAKE THE SCENIC ROUTE</p><h2>Copilot<br>Security Trail</h2><p>Five stops. A clearer view of Copilot security. Explore data protection, agent governance, and Zero Trust at your own pace.</p><div class="tags"><span class="tag">Copilot</span><span class="tag">Zero Trust</span><span class="tag">5 stations</span></div></div><div class="tool-actions"><a class="tool-launch" href="https://servicelogon.github.io/copilot-security-trail/" target="_blank" rel="noopener noreferrer">Hit the trail <span aria-hidden="true">↗</span></a><a class="source-link" href="https://github.com/servicelogon/copilot-security-trail" target="_blank" rel="noopener noreferrer">Source on GitHub ↗</a></div></article>
      <article class="tool-card passkey-card"><div class="tool-top"><span class="kicker">02 / IDENTIFY</span><span class="tool-pill">LOOKUP UTILITY</span></div><div class="tool-visual lookup-visual" aria-hidden="true"><span class="lookup-prompt">AAGUID → PROVIDER</span><div class="lookup-code">xxxxxxxx-xxxx-xxxx<br>-xxxx-xxxxxxxxxxxx</div><span class="lookup-answer">A little less mystery.</span></div><div class="tool-copy"><p class="kicker">PUT A NAME TO THAT PASSKEY</p><h2>Passkey<br>AAGUID Lookup</h2><p>A long identifier, a quick answer. Match an AAGUID to its passkey provider, or browse the directory to see who’s who.</p><div class="tags"><span class="tag">Passkeys</span><span class="tag">Identity</span><span class="tag">AAGUID</span></div></div><div class="tool-actions"><a class="tool-launch" href="https://servicelogon.github.io/PasskeyLookup/" target="_blank" rel="noopener noreferrer">Meet your passkey <span aria-hidden="true">↗</span></a><a class="source-link" href="https://github.com/servicelogon/PasskeyLookup" target="_blank" rel="noopener noreferrer">Source on GitHub ↗</a></div><p class="tool-note">Provider labels use community data; they aren’t a basis for security decisions.</p></article>
    </section><aside class="explore-strip"><p>Built to be useful. Shared to be explored.</p><a class="internal-button" href="/">Back to the field notes</a></aside>`);
}
