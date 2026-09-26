import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import hljs from 'highlight.js/lib/common';
import MarkdownIt from 'markdown-it';

export const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const xmlEscape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);

// This repository has no published hostname. Set SITE_ORIGIN to the public
// origin (scheme and host only, no path or trailing slash) so canonical URLs,
// Open Graph tags, sitemap.xml, and robots.txt use absolute links. When it is
// unset, those links stay root-relative instead of inventing a domain.
export function normalizeOrigin(value) {
  const raw = String(value ?? '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') return '';
    return url.origin;
  } catch {
    return '';
  }
}
export const SITE_ORIGIN = normalizeOrigin(process.env.SITE_ORIGIN);
export function absoluteUrl(origin, path) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return origin ? `${normalizeOrigin(origin)}${normalized}` : normalized;
}
export function tagSlug(tag) {
  return String(tag ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
export function collectTags(posts) {
  const tags = new Map();
  for (const post of posts) {
    for (const tag of post.tags) {
      const slug = tagSlug(tag);
      if (!slug) continue;
      const label = String(tag).trim();
      const current = tags.get(slug);
      if (!current) tags.set(slug, { slug, label, lastmod: post.date });
      else if (post.date > current.lastmod) current.lastmod = post.date;
    }
  }
  return [...tags.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}
export function seoHead({ title, description, path, origin = '', image = null, type = 'website', published = null, robots = null }) {
  const url = absoluteUrl(origin, path);
  const imageUrl = !image ? null : /^https?:\/\//i.test(image) ? image : absoluteUrl(origin, image);
  return [
    robots ? `<meta name="robots" content="${escapeHtml(robots)}">` : '',
    `<link rel="canonical" href="${escapeHtml(url)}">`,
    `<meta property="og:site_name" content="New Frontier Security">`,
    `<meta property="og:type" content="${escapeHtml(type)}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(url)}">`,
    imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}">` : '',
    published ? `<meta property="article:published_time" content="${escapeHtml(published)}">` : '',
    `<meta name="twitter:card" content="${imageUrl ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    imageUrl ? `<meta name="twitter:image" content="${escapeHtml(imageUrl)}">` : '',
  ].filter(Boolean).join('');
}
export function sitemapXml(posts, origin = '') {
  const urls = [
    { loc: absoluteUrl(origin, '/') },
    { loc: absoluteUrl(origin, '/newsroom') },
    { loc: absoluteUrl(origin, '/tools') },
    ...posts.map(post => ({ loc: absoluteUrl(origin, `/blog/${post.slug}`), lastmod: post.date })),
    ...collectTags(posts).map(tag => ({ loc: absoluteUrl(origin, `/blog/tag/${tag.slug}`), lastmod: tag.lastmod })),
  ];
  const body = urls.map(url => `  <url><loc>${xmlEscape(url.loc)}</loc>${url.lastmod ? `<lastmod>${xmlEscape(url.lastmod)}</lastmod>` : ''}</url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
export function robotsTxt(origin = '') {
  return `User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl(origin, '/sitemap.xml')}\n`;
}
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

export const SITE_TOOLS = [
  { title: 'Copilot Security Trail', href: '/tools#copilot-security-trail', description: 'Five stops through Copilot security, data protection, and Zero Trust.' },
  { title: 'Passkey AAGUID Lookup', href: '/tools#passkey-aaguid-lookup', description: 'Match an AAGUID to its passkey provider, or browse the directory.' },
];
export function searchIndex(posts = []) {
  return {
    posts: posts.map(post => ({ title: post.title, href: `/blog/${post.slug}`, description: post.description })),
    tools: SITE_TOOLS,
  };
}
export function searchHaystack(item = {}) {
  return [item.title, item.description, item.source].filter(Boolean).join(' ').toLowerCase();
}
export function itemMatchesQuery(item, query) {
  const q = String(query || '').trim().toLowerCase();
  return !q || searchHaystack(item).includes(q);
}
export function searchIndexScript(posts = []) {
  return `<script type="application/json" id="nfs-search-index">${JSON.stringify(searchIndex(posts)).replace(/</g, '\\u003c')}</script>`;
}
export function navigation(active) {
  const links = [['Blog', '/'], ['Newsroom', '/newsroom'], ['Tools', '/tools']].map(([name, href]) => `<a href="${href}"${active === name ? ' aria-current="page"' : ''}>${name}</a>`).join('');
  return `<div class="header-actions"><nav class="desktop-nav" aria-label="Main navigation">${links}</nav><button class="theme-toggle" type="button" aria-label="Switch to light mode" title="Switch to light mode" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg></button><details class="site-menu"><summary aria-label="Open navigation menu"><span class="hamburger" aria-hidden="true"></span></summary><nav aria-label="Mobile navigation">${links}</nav></details></div>`;
}
const footer = `<footer class="site-footer"></footer>`;
function layout(title, description, active, body, seo = {}) {
  const documentTitle = `${title} — New Frontier Security`;
  const head = seoHead({ title: documentTitle, description, path: seo.path || '/', origin: seo.origin || '', image: seo.image || null, type: seo.type || 'website', published: seo.published || null, robots: seo.robots || null });
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="${escapeHtml(description)}"><title>${escapeHtml(documentTitle)}</title>${head}<link rel="stylesheet" href="/assets/site.css"><script src="/assets/site.js"></script>${searchIndexScript(seo.posts || [])}</head><body class="publication"><a class="skip" href="#main">Skip to content</a><div class="shell"><header class="topbar"><a class="brand" href="/" aria-label="New Frontier Security home"><img class="brand-logo" src="/assets/new-frontier-security-logo.png" width="1585" height="423" alt="New Frontier Security"></a>${navigation(active)}</header><main id="main">${body}</main>${footer}</div></body></html>`;
}
const dateLabel = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const metadata = post => `<div class="post-meta"><time datetime="${post.date}">${dateLabel(post.date)}</time><span>${post.minutes} min read</span>${post.sample ? '<span class="sample-label">Sample post</span>' : ''}</div>`;
function tagChips(post) {
  const seen = new Set();
  const items = [];
  for (const tag of post.tags) {
    const label = String(tag).trim();
    const slug = tagSlug(label);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    items.push(`<li><a class="tag" href="/blog/tag/${slug}">${escapeHtml(label)}</a></li>`);
  }
  return items.length ? `<ul class="post-tags">${items.join('')}</ul>` : '';
}
const postImage = (post, className, loading = 'lazy') => post.image ? `<a class="${className}" href="/blog/${post.slug}" aria-label="Read ${escapeHtml(post.title)}"><img src="${escapeHtml(post.image)}" alt="${escapeHtml(post.imageAlt)}" loading="${loading}" decoding="async"></a>` : '';
const postTile = (post, { latest = false } = {}) => `<article class="featured-post post-tile"${latest ? ' aria-labelledby="featured-title"' : ''}>${postImage(post, 'feature-image', latest ? 'eager' : 'lazy')}<div class="feature-content"><span class="kicker">${latest ? 'LATEST ENTRY' : 'FIELD NOTE'}</span>${metadata(post)}${tagChips(post)}<h2${latest ? ' id="featured-title"' : ''}><a href="/blog/${post.slug}">${escapeHtml(post.title)}</a></h2><p>${escapeHtml(post.description)}</p></div></article>`;
export function blogPage(posts, seo = {}) {
  const [featured, ...rest] = posts;
  return layout('Blog', 'Notes, ideas, and field guides on identity and cloud security by Nathan Hess.', 'Blog', `
    <section class="page-intro blog-intro"><h1>Notes from<br>the <em>frontier.</em></h1><div class="intro-bottom"><p>Identity, cloud, and the questions worth exploring.</p></div></section>
    ${featured ? postTile(featured, { latest: true }) : '<section class="empty-state"><h2>A new chapter is on the way.</h2><p>Check back soon for the first field note.</p></section>'}
    ${rest.length ? `<section class="more-posts" aria-label="More field notes">${rest.map(post => postTile(post)).join('')}</section>` : ''}
    <aside class="explore-strip"><p>Keep exploring.</p><a class="internal-button" href="/newsroom">Read the Newsroom</a><a class="internal-button" href="/tools">Open the toolbox</a></aside>`, { path: '/', origin: seo.origin || '', image: featured?.image || null, posts });
}
export function postPage(post, seo = {}) {
  return layout(post.title, post.description, 'Blog', `<article class="post-page"><a class="internal-button back-link" href="/">All field notes</a><header class="post-heading"><h1>${escapeHtml(post.title)}</h1><p class="post-deck">${escapeHtml(post.description)}</p>${metadata(post)}${tagChips(post)}<p class="byline">By ${escapeHtml(post.author)}</p></header>${post.image ? `<figure class="post-hero"><img src="${escapeHtml(post.image)}" alt="${escapeHtml(post.imageAlt)}" decoding="async"></figure>` : ''}${post.sample ? '<aside class="sample-note">This is a placeholder post to try out the blog. Replace it with your own field notes when you’re ready.</aside>' : ''}<div class="prose">${post.html}</div><a class="internal-button post-return" href="/">Back to the blog</a></article>`, { path: `/blog/${post.slug}`, origin: seo.origin || '', image: post.image || null, type: 'article', published: post.date, posts: seo.posts || [post] });
}
export function tagPage(label, posts, seo = {}) {
  const count = posts.length;
  const noun = count === 1 ? 'field note' : 'field notes';
  return layout(label, `Field notes tagged ${label}.`, 'Blog', `
    <section class="page-intro tag-intro"><p class="kicker">TAG</p><h1>${escapeHtml(label)}</h1><div class="intro-bottom"><p>${count} ${noun} with this tag.</p></div></section>
    <section class="more-posts" aria-label="Field notes tagged ${escapeHtml(label)}">${posts.map(post => postTile(post)).join('')}</section>
    <aside class="explore-strip"><p>Keep exploring.</p><a class="internal-button" href="/">All field notes</a></aside>`, { path: `/blog/tag/${tagSlug(label)}`, origin: seo.origin || '', image: posts.find(post => post.image)?.image || null, posts: seo.posts || posts });
}
export function tagNotFoundPage(seo = {}) {
  return layout('Tag not found', 'No published field notes use this tag.', 'Blog', '<section class="empty-state"><p class="kicker">404 / OFF THE MAP</p><h1>No notes under that tag.</h1><p>That tag is not on any published field note.</p><a class="internal-button" href="/">Back to the blog</a></section>', { path: seo.path || '/blog/tag', origin: seo.origin || '', robots: 'noindex', posts: seo.posts || [] });
}
export function notFoundPage(seo = {}) {
  return layout('Post not found', 'This field note could not be found.', 'Blog', '<section class="empty-state"><p class="kicker">404 / OFF THE MAP</p><h1>This trail ends here.</h1><p>That post may have moved or is still being written.</p><a class="internal-button" href="/">Back to the blog</a></section>', { path: seo.path || '/blog', origin: seo.origin || '', robots: 'noindex', posts: seo.posts || [] });
}
export function toolsPage(seo = {}) {
  return layout('Tools', 'Explore Copilot Security Trail and Passkey AAGUID Lookup, tools by Nathan Hess.', 'Tools', `
    <section class="page-intro tools-intro"><div class="kicker">THE TOOLBOX <span>BUILT BY NATHAN HESS</span></div><h1>Serious security.<br><em>Room to play.</em></h1><div class="intro-bottom"><p>A few useful things for the identity-curious. Pick one. Dig in.</p><span class="issue-label">02 TOOLS / READY TO EXPLORE</span></div></section>
    <section class="tool-grid" aria-label="Identity and security tools">
      <article class="tool-card trail-card" id="copilot-security-trail"><div class="tool-top"><span class="kicker">01 / EXPLORE</span><span class="tool-pill">INTERACTIVE GUIDE</span></div><div class="tool-visual trail-stops" aria-label="Five trail stations"><span>01<small>Data</small></span><i></i><span>02<small>Protection</small></span><i></i><span>03<small>Readiness</small></span><i></i><span>04<small>Agents</small></span><i></i><span>05<small>Zero Trust</small></span></div><div class="tool-copy"><p class="kicker">TAKE THE SCENIC ROUTE</p><h2>Copilot<br>Security Trail</h2><p>Five stops. A clearer view of Copilot security. Explore data protection, agent governance, and Zero Trust at your own pace.</p><div class="tags"><span class="tag">Copilot</span><span class="tag">Zero Trust</span><span class="tag">5 stations</span></div></div><div class="tool-actions"><a class="tool-launch" href="https://servicelogon.github.io/copilot-security-trail/" target="_blank" rel="noopener noreferrer">Hit the trail <span class="arrow-icon" aria-hidden="true"></span></a><a class="source-link" href="https://github.com/servicelogon/copilot-security-trail" target="_blank" rel="noopener noreferrer">Source on GitHub <span class="arrow-icon" aria-hidden="true"></span></a></div></article>
      <article class="tool-card passkey-card" id="passkey-aaguid-lookup"><div class="tool-top"><span class="kicker">02 / IDENTIFY</span><span class="tool-pill">LOOKUP UTILITY</span></div><div class="tool-visual lookup-visual" aria-hidden="true"><span class="lookup-prompt">AAGUID → PROVIDER</span><div class="lookup-code">xxxxxxxx-xxxx-xxxx<br>-xxxx-xxxxxxxxxxxx</div><span class="lookup-answer">A little less mystery.</span></div><div class="tool-copy"><p class="kicker">PUT A NAME TO THAT PASSKEY</p><h2>Passkey<br>AAGUID Lookup</h2><p>A long identifier, a quick answer. Match an AAGUID to its passkey provider, or browse the directory to see who’s who.</p><div class="tags"><span class="tag">Passkeys</span><span class="tag">Identity</span><span class="tag">AAGUID</span></div></div><div class="tool-actions"><a class="tool-launch" href="https://servicelogon.github.io/PasskeyLookup/" target="_blank" rel="noopener noreferrer">Meet your passkey <span class="arrow-icon" aria-hidden="true"></span></a><a class="source-link" href="https://github.com/servicelogon/PasskeyLookup" target="_blank" rel="noopener noreferrer">Source on GitHub <span class="arrow-icon" aria-hidden="true"></span></a></div><p class="tool-note">Provider labels use community data; they aren’t a basis for security decisions.</p></article>
    </section><aside class="explore-strip"><p>Built to be useful. Shared to be explored.</p><a class="internal-button" href="/">Back to the field notes</a></aside>`, { path: '/tools', origin: seo.origin || '', posts: seo.posts || [] });
}
