import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import hljs from 'highlight.js/lib/common';
import MarkdownIt from 'markdown-it';

export const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight(code, language) {
    const normalizedLanguage = String(language || '').trim().toLowerCase();
    const className = normalizedLanguage && /^[a-z0-9+-]+$/.test(normalizedLanguage) ? ` language-${normalizedLanguage}` : '';
    const highlighted = normalizedLanguage && hljs.getLanguage(normalizedLanguage)
      ? hljs.highlight(code, { language: normalizedLanguage, ignoreIllegals: true }).value
      : escapeHtml(code);
    return `<pre class="hljs"><code class="hljs${className}">${highlighted}</code></pre>`;
  },
});
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
  if (/^\/assets\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*\.(?:jpe?g|webp)$/i.test(image)) return image;
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
  const links = [['Blog', '/'], ['Newsroom', '/newsroom'], ['Tools', '/tools']].map(([name, href]) => `<a href="${href}"${active === name ? ' aria-current="page"' : ''}>${name}</a>`).join('');
  return `<div class="header-actions"><nav class="desktop-nav" aria-label="Main navigation">${links}</nav><button class="theme-toggle" type="button" aria-label="Switch to light mode" title="Switch to light mode" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg></button><details class="site-menu"><summary aria-label="Open navigation menu"><span class="hamburger" aria-hidden="true"></span></summary><nav aria-label="Mobile navigation">${links}</nav></details></div>`;
}
const socialIcons = `<div class="social-links" aria-label="Social links coming soon"><span class="social-placeholder" role="img" aria-label="X placeholder" title="X"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4l16 16M20 4 4 20"/></svg></span><span class="social-placeholder" role="img" aria-label="Bluesky placeholder" title="Bluesky"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.3 4.5c1.8 1.4 3.8 4.2 4.7 5.8.9-1.6 2.9-4.4 4.7-5.8 1.3-1 3.3-1.8 3.3.7 0 .5-.3 4.2-.5 4.8-.7 2.5-3.2 3.1-5.4 2.7 3.9.7 4.9 3 2.8 5.3-3.9 4.1-5.7-1-6.1-2.3-.4 1.3-2.2 6.4-6.1 2.3-2.1-2.2-1.1-4.6 2.8-5.3-2.2.4-4.7-.2-5.4-2.7C4.3 9.4 4 5.7 4 5.2c0-2.5 2-1.7 3.3-.7z"/></svg></span><span class="social-placeholder" role="img" aria-label="Medium placeholder" title="Medium"><svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="7.5" cy="12" rx="4.5" ry="6"/><ellipse cx="15" cy="12" rx="2.5" ry="5.5"/><ellipse cx="19.5" cy="12" rx="1.2" ry="5"/></svg></span></div>`;
const footer = `<footer class="site-footer">${socialIcons}</footer>`;
function layout(title, description, active, body) {
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="${escapeHtml(description)}"><title>${escapeHtml(title)} — New Frontier Security</title><link rel="stylesheet" href="/assets/site.css"><script src="/assets/site.js"></script></head><body class="publication"><a class="skip" href="#main">Skip to content</a><div class="shell"><header class="topbar"><a class="brand" href="/" aria-label="New Frontier Security home"><img class="brand-logo" src="/assets/new-frontier-security-logo.png" width="1585" height="423" alt="New Frontier Security"></a>${navigation(active)}</header><main id="main">${body}</main>${footer}</div></body></html>`;
}
const dateLabel = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const metadata = post => `<div class="post-meta"><time datetime="${post.date}">${dateLabel(post.date)}</time><span>${post.minutes} min read</span>${post.sample ? '<span class="sample-label">Sample post</span>' : ''}</div>`;
const tags = post => post.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
const postImage = (post, className, loading = 'lazy') => post.image ? `<a class="${className}" href="/blog/${post.slug}" aria-label="Read ${escapeHtml(post.title)}"><img src="${escapeHtml(post.image)}" alt="${escapeHtml(post.imageAlt)}" loading="${loading}" decoding="async"></a>` : '';
const postTile = (post, { latest = false } = {}) => `<article class="featured-post post-tile"${latest ? ' aria-labelledby="featured-title"' : ''}>${postImage(post, 'feature-image', latest ? 'eager' : 'lazy')}<div class="feature-content"><span class="kicker">${latest ? 'LATEST ENTRY' : 'FIELD NOTE'}</span>${metadata(post)}<h2${latest ? ' id="featured-title"' : ''}><a href="/blog/${post.slug}">${escapeHtml(post.title)}</a></h2><p>${escapeHtml(post.description)}</p></div></article>`;
export function blogPage(posts) {
  const [featured, ...rest] = posts;
  return layout('Blog', 'Notes, ideas, and field guides on identity and cloud security by Nathan Hess.', 'Blog', `
    <section class="page-intro blog-intro"><h1>Notes from<br>the <em>frontier.</em></h1><div class="intro-bottom"><p>Identity, cloud, and the questions worth exploring.</p></div></section>
    ${featured ? postTile(featured, { latest: true }) : '<section class="empty-state"><h2>A new chapter is on the way.</h2><p>Check back soon for the first field note.</p></section>'}
    ${rest.length ? `<section class="more-posts" aria-label="More field notes">${rest.map(post => postTile(post)).join('')}</section>` : ''}
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
      <article class="tool-card trail-card"><div class="tool-top"><span class="kicker">01 / EXPLORE</span><span class="tool-pill">INTERACTIVE GUIDE</span></div><div class="tool-visual trail-stops" aria-label="Five trail stations"><span>01<small>Data</small></span><i></i><span>02<small>Protection</small></span><i></i><span>03<small>Readiness</small></span><i></i><span>04<small>Agents</small></span><i></i><span>05<small>Zero Trust</small></span></div><div class="tool-copy"><p class="kicker">TAKE THE SCENIC ROUTE</p><h2>Copilot<br>Security Trail</h2><p>Five stops. A clearer view of Copilot security. Explore data protection, agent governance, and Zero Trust at your own pace.</p><div class="tags"><span class="tag">Copilot</span><span class="tag">Zero Trust</span><span class="tag">5 stations</span></div></div><div class="tool-actions"><a class="tool-launch" href="https://servicelogon.github.io/copilot-security-trail/" target="_blank" rel="noopener noreferrer">Hit the trail <span class="arrow-icon" aria-hidden="true"></span></a><a class="source-link" href="https://github.com/servicelogon/copilot-security-trail" target="_blank" rel="noopener noreferrer">Source on GitHub <span class="arrow-icon" aria-hidden="true"></span></a></div></article>
      <article class="tool-card passkey-card"><div class="tool-top"><span class="kicker">02 / IDENTIFY</span><span class="tool-pill">LOOKUP UTILITY</span></div><div class="tool-visual lookup-visual" aria-hidden="true"><span class="lookup-prompt">AAGUID → PROVIDER</span><div class="lookup-code">xxxxxxxx-xxxx-xxxx<br>-xxxx-xxxxxxxxxxxx</div><span class="lookup-answer">A little less mystery.</span></div><div class="tool-copy"><p class="kicker">PUT A NAME TO THAT PASSKEY</p><h2>Passkey<br>AAGUID Lookup</h2><p>A long identifier, a quick answer. Match an AAGUID to its passkey provider, or browse the directory to see who’s who.</p><div class="tags"><span class="tag">Passkeys</span><span class="tag">Identity</span><span class="tag">AAGUID</span></div></div><div class="tool-actions"><a class="tool-launch" href="https://servicelogon.github.io/PasskeyLookup/" target="_blank" rel="noopener noreferrer">Meet your passkey <span class="arrow-icon" aria-hidden="true"></span></a><a class="source-link" href="https://github.com/servicelogon/PasskeyLookup" target="_blank" rel="noopener noreferrer">Source on GitHub <span class="arrow-icon" aria-hidden="true"></span></a></div><p class="tool-note">Provider labels use community data; they aren’t a basis for security decisions.</p></article>
    </section><aside class="explore-strip"><p>Built to be useful. Shared to be explored.</p><a class="internal-button" href="/">Back to the field notes</a></aside>`);
}
