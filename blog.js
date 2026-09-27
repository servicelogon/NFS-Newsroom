// blog.js — public blog, tools page, search index, and HTML document shell.
//
// Markdown files in the posts directory become HTML on each request. The same
// module also builds the tools page, the Cmd+K search index, sitemap/robots
// output, and the shared chrome (nav, SEO tags, skip link, footer).
//
// There is no published hostname in this repo. Set SITE_ORIGIN to a bare
// origin (scheme + host only, no path or trailing slash) so canonical URLs,
// Open Graph tags, sitemap.xml, and robots.txt use absolute links. When it is
// unset, those links stay root-relative instead of inventing a domain.

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import hljs from 'highlight.js/lib/common';
import MarkdownIt from 'markdown-it';

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------
// Page HTML uses &#39; for apostrophe. XML (sitemap) needs &apos; instead.
// Two maps keep that distinction from leaking into the wrong document type.

export const escapeHtml = value => String(value).replace(
  /[&<>"']/g,
  char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
);

const xmlEscape = value => String(value).replace(
  /[&<>"']/g,
  char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]
);

// ---------------------------------------------------------------------------
// Public origin and URLs
// ---------------------------------------------------------------------------
// Accept only a bare http(s) origin. Credentials, a query, a hash, or a path
// other than `/` would produce canonical URLs we do not want, so those inputs
// become '' and callers fall back to root-relative links.

export function normalizeOrigin(value) {
  const raw = String(value ?? '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    ) return '';
    return url.origin;
  } catch {
    return '';
  }
}

export const SITE_ORIGIN = normalizeOrigin(process.env.SITE_ORIGIN);

// Prefix a path with the origin when one is set. Paths are forced to start
// with `/` so we never concatenate into `https://hostblog/slug`.

export function absoluteUrl(origin, path) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return origin ? `${normalizeOrigin(origin)}${normalized}` : normalized;
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------
// Lowercase hyphenated slug for `/blog/tag/...`. Empty if the label has no
// letters or digits, so punctuation-only tags never become a URL.

export function tagSlug(tag) {
  return String(tag ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// One sitemap/archive entry per slug. The label is the first spelling we saw;
// lastmod is the newest post date so crawlers re-fetch when a tagged post is
// added.

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

// ---------------------------------------------------------------------------
// SEO, sitemap, robots
// ---------------------------------------------------------------------------
// Canonical, Open Graph, and Twitter tags. Optional fields (robots, image,
// published time) are empty strings that filter(Boolean) drops so we do not
// emit blank meta tags. An image that is already http(s) is passed through;
// a site path is resolved with absoluteUrl. Twitter uses summary_large_image
// only when an image is present.

export function seoHead({
  title,
  description,
  path,
  origin = '',
  image = null,
  type = 'website',
  published = null,
  robots = null
}) {
  const url = absoluteUrl(origin, path);
  const imageUrl = !image
    ? null
    : /^https?:\/\//i.test(image)
      ? image
      : absoluteUrl(origin, image);
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

// Home, newsroom, tools, each post, and each tag archive. lastmod is omitted
// on the static routes because those pages are not dated.

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

// Allow all crawlers and point them at the sitemap (absolute when SITE_ORIGIN
// is set).

export function robotsTxt(origin = '') {
  return `User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl(origin, '/sitemap.xml')}\n`;
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------
// Raw HTML is off so a post cannot inject <script> or event handlers. URLs in
// the text are auto-linked; typographer turns quotes into typographic ones.
// Fences use highlight.js when the language is known; otherwise the code is
// escaped as plain text so an unknown fence cannot emit raw markup.

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight(code, language) {
    const normalizedLanguage = String(language || '').trim().toLowerCase();
    // Only a token of letters, digits, +, - may become a CSS class. That
    // stops a fence label like `bash"><script>` from breaking out of class="".
    const className = normalizedLanguage && /^[a-z0-9+-]+$/.test(normalizedLanguage)
      ? ` language-${normalizedLanguage}`
      : '';
    const highlighted = normalizedLanguage && hljs.getLanguage(normalizedLanguage)
      ? hljs.highlight(code, { language: normalizedLanguage, ignoreIllegals: true }).value
      : escapeHtml(code);
    return `<pre class="hljs"><code class="hljs${className}">${highlighted}</code></pre>`;
  },
});

// ---------------------------------------------------------------------------
// Front matter
// ---------------------------------------------------------------------------
// Posts use a small YAML subset, not a full parser: booleans, [inline, lists],
// quoted strings, and `key:` followed by `- item` lines. Nested parse so
// [true, "x"] becomes typed values instead of leftover quotes. Empty items
// after a split are dropped.

function frontmatterValue(value) {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^\[.*\]$/.test(trimmed)) return trimmed.slice(1, -1).split(',').map(item => frontmatterValue(item)).filter(Boolean);
  return trimmed.replace(/^(['"])(.*)\1$/, '$2');
}

// `key: value` sets a scalar. `key:` with an empty value starts a list; the
// following `- item` lines append to it. Any other line is ignored so a
// comment or blank line in the YAML block cannot crash the load.

function parseFrontmatter(source) {
  const data = {};
  let listKey = null;
  for (const line of source.split('\n')) {
    // `- item` continues the last `key:` that had an empty value (a list).
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

// Hero images: a local /assets/blog/<kebab>.jpg|webp path, or an https URL.
// http, data:, and arbitrary filesystem paths are dropped so a post cannot
// point at private files or mixed-content URLs.

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

// ---------------------------------------------------------------------------
// Post loading
// ---------------------------------------------------------------------------
// Read the folder on every request so dropping in, editing, or removing a
// post needs no restart. A missing directory is an empty blog, not a crash.
// One bad file is skipped with a warning so it cannot take the whole blog
// down.

export async function loadPosts(directory) {
  let files;
  try {
    files = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  // Filename must be kebab-case.md so README.md and similar are not posts.
  const posts = await Promise.all(
    files
      .filter(file => file.isFile() && /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(file.name))
      .map(async file => {
        try {
          // Strip BOM and CRLF so the `---` front-matter regex always matches.
          const source = (await readFile(join(directory, file.name), 'utf8')).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
          const frontmatter = source.match(/^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/);
          if (!frontmatter) throw new Error('Expected YAML front matter');
          const data = parseFrontmatter(frontmatter[1]);
          if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Expected metadata fields');
          if (data.draft === true) return null;
          const title = requiredString(data, 'title');
          const description = requiredString(data, 'description');
          const date = requiredString(data, 'date');
          // Regex plus Date round-trip so values like 2026-02-30 are rejected.
          // Date.parse alone would roll that over to March 2.
          if (
            !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
            !Number.isFinite(Date.parse(date)) ||
            new Date(date).toISOString().slice(0, 10) !== date
          ) throw new Error('Expected a valid YYYY-MM-DD date');
          const body = frontmatter[2];
          const image = optionalImage(data.image);
          return {
            slug: file.name.slice(0, -3),
            title,
            description,
            date,
            author: typeof data.author === 'string' ? data.author : 'Nathan Hess',
            tags: Array.isArray(data.tags) ? data.tags.filter(tag => typeof tag === 'string').slice(0, 5) : [],
            sample: data.sample === true,
            ...(image ? { image, imageAlt: typeof data.imageAlt === 'string' && data.imageAlt.trim() ? data.imageAlt.trim() : title } : {}),
            // About 220 words per minute, always at least 1 so empty bodies
            // still show a read time.
            minutes: Math.max(1, Math.ceil(body.trim().split(/\s+/).length / 220)),
            html: markdown.render(body)
          };
        } catch (error) {
          console.warn(`Skipping blog post ${file.name}: ${error.message}`);
          return null;
        }
      })
  );

  // Newest date first; slug is the tie-breaker so the order is stable.
  return posts.filter(Boolean).sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------
// Tools listed in the Cmd+K palette. hrefs jump to the matching card on
// /tools via the fragment id.

export const SITE_TOOLS = [
  { title: 'Copilot Security Trail', href: '/tools#copilot-security-trail', description: 'Five stops through Copilot security, data protection, and Zero Trust.' },
  { title: 'Passkey AAGUID Lookup', href: '/tools#passkey-aaguid-lookup', description: 'Match an AAGUID to its passkey provider, or browse the directory.' },
];

// Published posts plus SITE_TOOLS. The client reads this JSON; news headlines
// are merged in elsewhere and may include a `source` field.

export function searchIndex(posts = []) {
  return {
    posts: posts.map(post => ({ title: post.title, href: `/blog/${post.slug}`, description: post.description })),
    tools: SITE_TOOLS,
  };
}

// One lowercase haystack so matching is case-insensitive. Blog posts have no
// source; news items do, which is why that field is included.

export function searchHaystack(item = {}) {
  return [item.title, item.description, item.source].filter(Boolean).join(' ').toLowerCase();
}

// Empty query matches everything so the palette can show the full index
// until the visitor types.

export function itemMatchesQuery(item, query) {
  const q = String(query || '').trim().toLowerCase();
  return !q || searchHaystack(item).includes(q);
}

// Embed the index in a JSON script tag. Replacing `<` with `\u003c` stops a
// title like `</script>` from closing the tag and turning the rest into HTML
// (XSS).

export function searchIndexScript(posts = []) {
  return `<script type="application/json" id="nfs-search-index">${JSON.stringify(searchIndex(posts)).replace(/</g, '\\u003c')}</script>`;
}

// ---------------------------------------------------------------------------
// Document shell
// ---------------------------------------------------------------------------
// Desktop nav, theme toggle, and the mobile <details> menu share one link
// list so the three places cannot drift. aria-current marks the active page.

export function navigation(active) {
  const links = [['Blog', '/'], ['Newsroom', '/newsroom'], ['Tools', '/tools']].map(([name, href]) => `<a href="${href}"${active === name ? ' aria-current="page"' : ''}>${name}</a>`).join('');
  return `<div class="header-actions"><nav class="desktop-nav" aria-label="Main navigation">${links}</nav><button class="theme-toggle" type="button" aria-label="Switch to light mode" title="Switch to light mode" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg></button><details class="site-menu"><summary aria-label="Open navigation menu"><span class="hamburger" aria-hidden="true"></span></summary><nav aria-label="Mobile navigation">${links}</nav></details></div>`;
}

const footer = `<footer class="site-footer"><div class="footer-mark"><div class="footer-stars" aria-hidden="true"><span style="--x:92.1%;--y:10.9%;--s:1.5px;--dx:-32px;--dy:37px;--dur:9s;--delay:-5.19s;--c:#ffffff" data-motion="twinkle"></span><span style="--x:35.9%;--y:41.9%;--s:2px;--dx:22px;--dy:-37px;--dur:7.5s;--delay:-2.85s;--c:#f7f7f7" data-motion="wander"></span><span style="--x:11.0%;--y:5.9%;--s:2.5px;--dx:19px;--dy:-36px;--dur:13s;--delay:-4.84s;--c:#9ec5ff" data-motion="wander"></span><span style="--x:36.0%;--y:99.0%;--s:1.5px;--dx:13px;--dy:-16px;--dur:13s;--delay:-10.19s;--c:#d7e4ff" data-motion="twinkle"></span><span style="--x:36.4%;--y:37.5%;--s:2px;--dx:-20px;--dy:22px;--dur:13s;--delay:-11.89s;--c:#9ec5ff" data-motion="wander"></span><span style="--x:18.1%;--y:69.7%;--s:2.5px;--dx:-14px;--dy:-15px;--dur:18s;--delay:-14.79s;--c:#edb3c7" data-motion="wander"></span><span style="--x:67.2%;--y:65.9%;--s:3px;--dx:-20px;--dy:-28px;--dur:6s;--delay:-3.44s;--c:#ffffff" data-motion="twinkle"></span><span style="--x:27.8%;--y:60.2%;--s:3px;--dx:8px;--dy:-25px;--dur:9s;--delay:-0.9s;--c:#ffffff" data-motion="wander"></span><span style="--x:30.7%;--y:35.1%;--s:3px;--dx:-20px;--dy:22px;--dur:7.5s;--delay:-6.7s;--c:#f7f7f7" data-motion="wander"></span><span style="--x:70.5%;--y:28.2%;--s:2px;--dx:8px;--dy:31px;--dur:7.5s;--delay:-0.61s;--c:#ffffff" data-motion="twinkle"></span><span style="--x:10.4%;--y:79.1%;--s:2.5px;--dx:-30px;--dy:-31px;--dur:15s;--delay:-8.76s;--c:#f7f7f7" data-motion="wander"></span><span style="--x:16.6%;--y:91.0%;--s:1.5px;--dx:-6px;--dy:-31px;--dur:13s;--delay:-0.72s;--c:#9ec5ff" data-motion="wander"></span><span style="--x:74.7%;--y:82.2%;--s:2.5px;--dx:28px;--dy:-14px;--dur:6s;--delay:-5.54s;--c:#9ec5ff" data-motion="twinkle"></span><span style="--x:54.8%;--y:38.1%;--s:2.5px;--dx:3px;--dy:-11px;--dur:6s;--delay:-5.38s;--c:#ffffff" data-motion="wander"></span><span style="--x:64.8%;--y:46.4%;--s:3px;--dx:-20px;--dy:22px;--dur:6s;--delay:-3.47s;--c:#f7f7f7" data-motion="wander"></span><span style="--x:44.5%;--y:82.5%;--s:2.5px;--dx:-13px;--dy:14px;--dur:6s;--delay:-1.84s;--c:#d7e4ff" data-motion="twinkle"></span><span style="--x:74.3%;--y:63.2%;--s:2.5px;--dx:18px;--dy:0px;--dur:18s;--delay:-2.51s;--c:#ffffff" data-motion="wander"></span><span style="--x:54.9%;--y:28.5%;--s:1.5px;--dx:-31px;--dy:-21px;--dur:9s;--delay:-0.32s;--c:#d7e4ff" data-motion="wander"></span><span style="--x:83.2%;--y:89.6%;--s:3.5px;--dx:-24px;--dy:5px;--dur:13s;--delay:-4.05s;--c:#f7f7f7" data-motion="twinkle"></span><span style="--x:23.8%;--y:61.5%;--s:2.5px;--dx:23px;--dy:-4px;--dur:6s;--delay:-3.97s;--c:#f7f7f7" data-motion="wander"></span><span style="--x:78.3%;--y:95.7%;--s:2.5px;--dx:-8px;--dy:-35px;--dur:7.5s;--delay:-2.59s;--c:#d7e4ff" data-motion="wander"></span><span style="--x:42.3%;--y:98.2%;--s:3.5px;--dx:1px;--dy:23px;--dur:13s;--delay:-4.04s;--c:#ffffff" data-motion="twinkle"></span><span style="--x:71.8%;--y:93.9%;--s:3px;--dx:-20px;--dy:22px;--dur:6s;--delay:-4.64s;--c:#f7f7f7" data-motion="wander"></span><span style="--x:86.0%;--y:68.2%;--s:1.5px;--dx:24px;--dy:14px;--dur:9s;--delay:-2.87s;--c:#9ec5ff" data-motion="wander"></span><span style="--x:35.1%;--y:85.7%;--s:2px;--dx:-14px;--dy:11px;--dur:6s;--delay:-3.48s;--c:#d7e4ff" data-motion="twinkle"></span><span style="--x:47.8%;--y:62.3%;--s:2px;--dx:34px;--dy:-3px;--dur:15s;--delay:-13.66s;--c:#f4f4f5" data-motion="wander"></span><span style="--x:88.9%;--y:4.8%;--s:2px;--dx:30px;--dy:9px;--dur:6s;--delay:-2.28s;--c:#f7f7f7" data-motion="wander"></span><span style="--x:28.0%;--y:36.2%;--s:1.5px;--dx:-30px;--dy:-5px;--dur:18s;--delay:-2.68s;--c:#f4f4f5" data-motion="twinkle"></span><span style="--x:76.0%;--y:61.2%;--s:2.5px;--dx:-29px;--dy:14px;--dur:18s;--delay:-16.57s;--c:#f4f4f5" data-motion="wander"></span><span style="--x:36.4%;--y:95.5%;--s:1.5px;--dx:-11px;--dy:27px;--dur:11s;--delay:-4.28s;--c:#edb3c7" data-motion="wander"></span><span style="--x:29.5%;--y:98.4%;--s:3.5px;--dx:-13px;--dy:-33px;--dur:6s;--delay:-0.53s;--c:#f4f4f5" data-motion="twinkle"></span><span style="--x:98.1%;--y:96.0%;--s:3.5px;--dx:-17px;--dy:-1px;--dur:11s;--delay:-1.14s;--c:#edb3c7" data-motion="wander"></span><span style="--x:56.9%;--y:36.1%;--s:1.5px;--dx:-21px;--dy:3px;--dur:6s;--delay:-5.2s;--c:#f7f7f7" data-motion="wander"></span><span style="--x:16.3%;--y:91.8%;--s:2.5px;--dx:6px;--dy:-10px;--dur:13s;--delay:-5.37s;--c:#9ec5ff" data-motion="twinkle"></span><span style="--x:66.2%;--y:64.7%;--s:2px;--dx:5px;--dy:20px;--dur:15s;--delay:-0.28s;--c:#d7e4ff" data-motion="wander"></span><span style="--x:13.3%;--y:79.4%;--s:2px;--dx:-29px;--dy:24px;--dur:11s;--delay:-7.15s;--c:#f4f4f5" data-motion="wander"></span><span style="--x:75.6%;--y:64.3%;--s:2px;--dx:6px;--dy:14px;--dur:11s;--delay:-10.36s;--c:#edb3c7" data-motion="twinkle"></span><span style="--x:73.4%;--y:70.8%;--s:2px;--dx:19px;--dy:8px;--dur:7.5s;--delay:-0.34s;--c:#f7f7f7" data-motion="wander"></span><span style="--x:66.9%;--y:73.4%;--s:2px;--dx:17px;--dy:9px;--dur:13s;--delay:-6.52s;--c:#f7f7f7" data-motion="wander"></span><span style="--x:53.6%;--y:54.5%;--s:2.5px;--dx:-11px;--dy:18px;--dur:7.5s;--delay:-2.54s;--c:#9ec5ff" data-motion="twinkle"></span><span style="--x:97.6%;--y:72.3%;--s:1.5px;--dx:16px;--dy:10px;--dur:9s;--delay:-8.49s;--c:#f7f7f7" data-motion="wander"></span><span style="--x:42.2%;--y:81.9%;--s:3.5px;--dx:0px;--dy:-17px;--dur:7.5s;--delay:-2.98s;--c:#f7f7f7" data-motion="wander"></span><span style="--x:74.9%;--y:30.5%;--s:2.5px;--dx:-19px;--dy:-30px;--dur:11s;--delay:-5.79s;--c:#f4f4f5" data-motion="twinkle"></span><span style="--x:97.4%;--y:32.3%;--s:1.5px;--dx:-32px;--dy:28px;--dur:13s;--delay:-10.29s;--c:#d7e4ff" data-motion="wander"></span><span style="--x:20.0%;--y:82.1%;--s:2px;--dx:-20px;--dy:22px;--dur:11s;--delay:-5.57s;--c:#ffffff" data-motion="wander"></span><span style="--x:93.3%;--y:63.6%;--s:2px;--dx:-32px;--dy:-10px;--dur:18s;--delay:-5.96s;--c:#ffffff" data-motion="twinkle"></span><span style="--x:15.7%;--y:46.5%;--s:2px;--dx:-20px;--dy:1px;--dur:9s;--delay:-8.0s;--c:#ffffff" data-motion="wander"></span><span style="--x:8.4%;--y:98.3%;--s:1.5px;--dx:27px;--dy:-34px;--dur:13s;--delay:-9.56s;--c:#ffffff" data-motion="wander"></span><span style="--x:57.2%;--y:4.2%;--s:3.5px;--dx:-34px;--dy:-13px;--dur:15s;--delay:-5.1s;--c:#d7e4ff" data-motion="twinkle"></span><span style="--x:7.5%;--y:29.4%;--s:2px;--dx:-7px;--dy:24px;--dur:6s;--delay:-1.58s;--c:#f4f4f5" data-motion="wander"></span><span style="--x:26.2%;--y:14.2%;--s:3px;--dx:15px;--dy:-33px;--dur:13s;--delay:-3.14s;--c:#9ec5ff" data-motion="wander"></span><span style="--x:79.5%;--y:52.9%;--s:2px;--dx:-16px;--dy:-37px;--dur:9s;--delay:-3.19s;--c:#ffffff" data-motion="twinkle"></span><span style="--x:55.7%;--y:6.7%;--s:1.5px;--dx:29px;--dy:-28px;--dur:11s;--delay:-7.41s;--c:#d7e4ff" data-motion="wander"></span><span style="--x:71.6%;--y:99.6%;--s:2px;--dx:18px;--dy:-24px;--dur:18s;--delay:-2.86s;--c:#f7f7f7" data-motion="wander"></span><span style="--x:14.6%;--y:95.8%;--s:3px;--dx:-20px;--dy:16px;--dur:18s;--delay:-8.88s;--c:#f4f4f5" data-motion="twinkle"></span><span style="--x:52.2%;--y:64.2%;--s:3px;--dx:-8px;--dy:-30px;--dur:9s;--delay:-3.09s;--c:#f7f7f7" data-motion="wander"></span><span style="--x:82.0%;--y:42.9%;--s:2px;--dx:-20px;--dy:27px;--dur:11s;--delay:-7.06s;--c:#f4f4f5" data-motion="wander"></span><span style="--x:67.6%;--y:79.5%;--s:2px;--dx:-22px;--dy:-7px;--dur:7.5s;--delay:-4.73s;--c:#9ec5ff" data-motion="twinkle"></span><span style="--x:46.0%;--y:94.9%;--s:3px;--dx:-20px;--dy:22px;--dur:6s;--delay:-2.62s;--c:#f7f7f7" data-motion="wander"></span><span style="--x:77.3%;--y:40.6%;--s:2px;--dx:-26px;--dy:33px;--dur:9s;--delay:-3.27s;--c:#f7f7f7" data-motion="wander"></span><span style="--x:44.7%;--y:99.1%;--s:2px;--dx:10px;--dy:-12px;--dur:11s;--delay:-3.24s;--c:#d7e4ff" data-motion="twinkle"></span><span style="--x:33.9%;--y:97.9%;--s:2.5px;--dx:27px;--dy:-25px;--dur:11s;--delay:-5.15s;--c:#9ec5ff" data-motion="wander"></span><span style="--x:37.8%;--y:41.0%;--s:2px;--dx:-26px;--dy:-35px;--dur:6s;--delay:-0.85s;--c:#edb3c7" data-motion="wander"></span><span style="--x:69.1%;--y:97.3%;--s:3.5px;--dx:8px;--dy:12px;--dur:15s;--delay:-0.77s;--c:#d7e4ff" data-motion="twinkle"></span><span style="--x:14.7%;--y:86.0%;--s:3px;--dx:1px;--dy:28px;--dur:13s;--delay:-0.61s;--c:#d7e4ff" data-motion="wander"></span><span style="--x:80.8%;--y:60.6%;--s:3.5px;--dx:31px;--dy:13px;--dur:15s;--delay:-3.91s;--c:#ffffff" data-motion="wander"></span><span style="--x:27.1%;--y:42.0%;--s:3.5px;--dx:-15px;--dy:-37px;--dur:9s;--delay:-1.92s;--c:#ffffff" data-motion="twinkle"></span><span style="--x:8.5%;--y:69.5%;--s:2px;--dx:-28px;--dy:14px;--dur:15s;--delay:-3.65s;--c:#f7f7f7" data-motion="wander"></span><span style="--x:27.7%;--y:96.9%;--s:3px;--dx:-20px;--dy:22px;--dur:11s;--delay:-1.15s;--c:#f4f4f5" data-motion="wander"></span><span style="--x:60.1%;--y:30.2%;--s:3px;--dx:18px;--dy:-24px;--dur:7.5s;--delay:-0.2s;--c:#d7e4ff" data-motion="twinkle"></span><span style="--x:17.5%;--y:64.1%;--s:2px;--dx:28px;--dy:3px;--dur:15s;--delay:-3.43s;--c:#9ec5ff" data-motion="wander"></span><span style="--x:34.1%;--y:63.5%;--s:3px;--dx:20px;--dy:-32px;--dur:15s;--delay:-9.37s;--c:#edb3c7" data-motion="wander"></span><span style="--x:59.0%;--y:40.7%;--s:1.5px;--dx:-27px;--dy:-22px;--dur:6s;--delay:-4.9s;--c:#9ec5ff" data-motion="twinkle"></span><span style="--x:28.6%;--y:96.5%;--s:2px;--dx:-22px;--dy:8px;--dur:9s;--delay:-6.35s;--c:#d7e4ff" data-motion="wander"></span><span style="--x:80.8%;--y:15.5%;--s:3px;--dx:-8px;--dy:34px;--dur:18s;--delay:-10.86s;--c:#ffffff" data-motion="wander"></span><span style="--x:74.4%;--y:87.2%;--s:3px;--dx:-30px;--dy:-18px;--dur:15s;--delay:-5.39s;--c:#f7f7f7" data-motion="twinkle"></span><span style="--x:82.1%;--y:63.7%;--s:3.5px;--dx:-29px;--dy:-22px;--dur:11s;--delay:-10.85s;--c:#edb3c7" data-motion="wander"></span><span style="--x:90.9%;--y:25.4%;--s:2.5px;--dx:-5px;--dy:31px;--dur:7.5s;--delay:-2.57s;--c:#f4f4f5" data-motion="wander"></span><span style="--x:70.2%;--y:87.3%;--s:3px;--dx:-10px;--dy:-24px;--dur:9s;--delay:-0.09s;--c:#ffffff" data-motion="twinkle"></span><span style="--x:88.4%;--y:100.0%;--s:2px;--dx:-2px;--dy:24px;--dur:13s;--delay:-6.75s;--c:#ffffff" data-motion="wander"></span><span style="--x:98.7%;--y:75.7%;--s:2px;--dx:-20px;--dy:-12px;--dur:11s;--delay:-0.29s;--c:#9ec5ff" data-motion="wander"></span><span style="--x:12.5%;--y:40.6%;--s:2px;--dx:-11px;--dy:-4px;--dur:18s;--delay:-3.31s;--c:#f4f4f5" data-motion="twinkle"></span><span style="--x:24.2%;--y:52.8%;--s:2px;--dx:31px;--dy:-13px;--dur:11s;--delay:-10.06s;--c:#f4f4f5" data-motion="wander"></span><span style="--x:41.3%;--y:92.7%;--s:1.5px;--dx:-7px;--dy:-29px;--dur:15s;--delay:-14.7s;--c:#f4f4f5" data-motion="wander"></span><span style="--x:37.3%;--y:40.4%;--s:1.5px;--dx:31px;--dy:14px;--dur:15s;--delay:-10.11s;--c:#9ec5ff" data-motion="twinkle"></span><span style="--x:87.2%;--y:36.7%;--s:2px;--dx:0px;--dy:-31px;--dur:18s;--delay:-1.7s;--c:#f7f7f7" data-motion="wander"></span><span style="--x:9.8%;--y:93.0%;--s:1.5px;--dx:-3px;--dy:-21px;--dur:18s;--delay:-16.44s;--c:#9ec5ff" data-motion="wander"></span><span style="--x:52.8%;--y:68.4%;--s:3px;--dx:-29px;--dy:-33px;--dur:13s;--delay:-4.34s;--c:#f7f7f7" data-motion="twinkle"></span><span style="--x:32.2%;--y:29.0%;--s:2.5px;--dx:-34px;--dy:35px;--dur:11s;--delay:-8.34s;--c:#ffffff" data-motion="wander"></span><span style="--x:57.9%;--y:99.6%;--s:3px;--dx:30px;--dy:-16px;--dur:11s;--delay:-6.98s;--c:#f4f4f5" data-motion="wander"></span><span style="--x:79.1%;--y:26.1%;--s:3.5px;--dx:-20px;--dy:22px;--dur:9s;--delay:-1.92s;--c:#f4f4f5" data-motion="twinkle"></span><span style="--x:42.2%;--y:51.1%;--s:1.5px;--dx:-27px;--dy:-29px;--dur:18s;--delay:-12.11s;--c:#d7e4ff" data-motion="wander"></span><span style="--x:57.1%;--y:46.3%;--s:2px;--dx:-23px;--dy:27px;--dur:7.5s;--delay:-5.82s;--c:#9ec5ff" data-motion="wander"></span><span style="--x:69.2%;--y:63.6%;--s:2.5px;--dx:-28px;--dy:23px;--dur:9s;--delay:-8.32s;--c:#f7f7f7" data-motion="twinkle"></span><span style="--x:52.5%;--y:22.9%;--s:2px;--dx:-30px;--dy:5px;--dur:18s;--delay:-0.74s;--c:#ffffff" data-motion="wander"></span><span style="--x:72.7%;--y:98.9%;--s:3.5px;--dx:32px;--dy:-5px;--dur:7.5s;--delay:-5.97s;--c:#f4f4f5" data-motion="wander"></span></div><img class="footer-logo" src="/assets/nfs-footer-mark.png" width="640" height="640" alt="New Frontier Security"></div></footer>`;

// Shared document used by every public HTML page: SEO head, search index,
// skip link, brand, nav, main, footer.

function layout(title, description, active, body, seo = {}) {
  const documentTitle = `${title} — New Frontier Security`;
  const head = seoHead({
    title: documentTitle,
    description,
    path: seo.path || '/',
    origin: seo.origin || '',
    image: seo.image || null,
    type: seo.type || 'website',
    published: seo.published || null,
    robots: seo.robots || null
  });
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="${escapeHtml(description)}"><title>${escapeHtml(documentTitle)}</title>${head}<link rel="stylesheet" href="/assets/site.css"><script src="/assets/site.js"></script>${searchIndexScript(seo.posts || [])}</head><body class="publication"><a class="skip" href="#main">Skip to content</a><div class="shell"><header class="topbar"><a class="brand" href="/" aria-label="New Frontier Security home"><img class="brand-logo" src="/assets/new-frontier-security-logo.png" width="1585" height="423" alt="New Frontier Security"></a>${navigation(active)}</header><main id="main">${body}</main></div>${footer}</body></html>`;
}

// Format at noon UTC so the calendar day does not shift in US timezones
// (midnight UTC is still the previous evening in America).

const dateLabel = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC'
});

const metadata = post => `<div class="post-meta"><time datetime="${post.date}">${dateLabel(post.date)}</time><span>${post.minutes} min read</span>${post.sample ? '<span class="sample-label">Sample post</span>' : ''}</div>`;

// One chip per slug so "Entra" and "entra" do not both render. The visible
// label keeps the author's original spelling.

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

const postImage = (post, className, loading = 'lazy') => post.image
  ? `<a class="${className}" href="/blog/${post.slug}" aria-label="Read ${escapeHtml(post.title)}"><img src="${escapeHtml(post.image)}" alt="${escapeHtml(post.imageAlt)}" loading="${loading}" decoding="async"></a>`
  : '';

// Featured (newest) tile uses eager image load and a LATEST ENTRY kicker so
// the home page's first image is not lazy-loaded below the fold by mistake.

const postTile = (post, { latest = false } = {}) => `<article class="featured-post post-tile"${latest ? ' aria-labelledby="featured-title"' : ''}>${postImage(post, 'feature-image', latest ? 'eager' : 'lazy')}<div class="feature-content"><span class="kicker">${latest ? 'LATEST ENTRY' : 'FIELD NOTE'}</span>${metadata(post)}${tagChips(post)}<h2${latest ? ' id="featured-title"' : ''}><a href="/blog/${post.slug}">${escapeHtml(post.title)}</a></h2><p>${escapeHtml(post.description)}</p></div></article>`;

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------
// Home: newest post as the featured tile, the rest as field-note tiles, plus
// links into the newsroom and tools. An empty posts list shows a placeholder
// instead of a broken featured section.

export function blogPage(posts, seo = {}) {
  const [featured, ...rest] = posts;
  return layout('Blog', 'Notes, ideas, and field guides on identity and cloud security by Nathan Hess.', 'Blog', `
    <section class="page-intro blog-intro"><h1>Notes from<br>the <em>frontier.</em></h1><div class="intro-bottom"><p>Identity, cloud, and the questions worth exploring.</p></div></section>
    ${featured ? postTile(featured, { latest: true }) : '<section class="empty-state"><h2>A new chapter is on the way.</h2><p>Check back soon for the first field note.</p></section>'}
    ${rest.length ? `<section class="more-posts" aria-label="More field notes">${rest.map(post => postTile(post)).join('')}</section>` : ''}
    <aside class="explore-strip"><p>Keep exploring.</p><a class="internal-button" href="/newsroom">Read the Newsroom</a><a class="internal-button" href="/tools">Open the toolbox</a></aside>`, { path: '/', origin: seo.origin || '', image: featured?.image || null, posts });
}

// Single post: heading, optional hero, rendered Markdown. Open Graph type is
// article and published is the post date so shares show as an article.

export function postPage(post, seo = {}) {
  return layout(post.title, post.description, 'Blog', `<article class="post-page"><a class="internal-button back-link" href="/">All field notes</a><header class="post-heading"><h1>${escapeHtml(post.title)}</h1><p class="post-deck">${escapeHtml(post.description)}</p>${metadata(post)}${tagChips(post)}<p class="byline">By ${escapeHtml(post.author)}</p></header>${post.image ? `<figure class="post-hero"><img src="${escapeHtml(post.image)}" alt="${escapeHtml(post.imageAlt)}" decoding="async"></figure>` : ''}${post.sample ? '<aside class="sample-note">This is a placeholder post to try out the blog. Replace it with your own field notes when you’re ready.</aside>' : ''}<div class="prose">${post.html}</div><a class="internal-button post-return" href="/">Back to the blog</a></article>`, { path: `/blog/${post.slug}`, origin: seo.origin || '', image: post.image || null, type: 'article', published: post.date, posts: seo.posts || [post] });
}

// Archive of posts that share a tag. The intro noun is singular when there
// is only one matching note.

export function tagPage(label, posts, seo = {}) {
  const count = posts.length;
  const noun = count === 1 ? 'field note' : 'field notes';
  return layout(label, `Field notes tagged ${label}.`, 'Blog', `
    <section class="page-intro tag-intro"><p class="kicker">TAG</p><h1>${escapeHtml(label)}</h1><div class="intro-bottom"><p>${count} ${noun} with this tag.</p></div></section>
    <section class="more-posts" aria-label="Field notes tagged ${escapeHtml(label)}">${posts.map(post => postTile(post)).join('')}</section>
    <aside class="explore-strip"><p>Keep exploring.</p><a class="internal-button" href="/">All field notes</a></aside>`, { path: `/blog/tag/${tagSlug(label)}`, origin: seo.origin || '', image: posts.find(post => post.image)?.image || null, posts: seo.posts || posts });
}

// 404 pages send noindex so missing tag/post URLs are not indexed.

export function tagNotFoundPage(seo = {}) {
  return layout('Tag not found', 'No published field notes use this tag.', 'Blog', '<section class="empty-state"><p class="kicker">404 / OFF THE MAP</p><h1>No notes under that tag.</h1><p>That tag is not on any published field note.</p><a class="internal-button" href="/">Back to the blog</a></section>', { path: seo.path || '/blog/tag', origin: seo.origin || '', robots: 'noindex', posts: seo.posts || [] });
}

export function notFoundPage(seo = {}) {
  return layout('Post not found', 'This field note could not be found.', 'Blog', '<section class="empty-state"><p class="kicker">404 / OFF THE MAP</p><h1>This trail ends here.</h1><p>That post may have moved or is still being written.</p><a class="internal-button" href="/">Back to the blog</a></section>', { path: seo.path || '/blog', origin: seo.origin || '', robots: 'noindex', posts: seo.posts || [] });
}

// Static toolbox page. The two tools live on GitHub Pages; this server only
// renders the cards and outbound links.

export function toolsPage(seo = {}) {
  return layout('Tools', 'Explore Copilot Security Trail and Passkey AAGUID Lookup, tools by Nathan Hess.', 'Tools', `
    <section class="page-intro tools-intro"><div class="kicker">THE TOOLBOX <span>BUILT BY NATHAN HESS</span></div><h1>Serious security.<br><em>Room to play.</em></h1><div class="intro-bottom"><p>A few useful things for the identity-curious. Pick one. Dig in.</p><span class="issue-label">02 TOOLS / READY TO EXPLORE</span></div></section>
    <section class="tool-grid" aria-label="Identity and security tools">
      <article class="tool-card trail-card" id="copilot-security-trail"><div class="tool-top"><span class="kicker">01 / EXPLORE</span><span class="tool-pill">INTERACTIVE GUIDE</span></div><div class="tool-visual trail-stops" aria-label="Five trail stations"><span>01<small>Data</small></span><i></i><span>02<small>Protection</small></span><i></i><span>03<small>Readiness</small></span><i></i><span>04<small>Agents</small></span><i></i><span>05<small>Zero Trust</small></span></div><div class="tool-copy"><p class="kicker">TAKE THE SCENIC ROUTE</p><h2>Copilot<br>Security Trail</h2><p>Five stops. A clearer view of Copilot security. Explore data protection, agent governance, and Zero Trust at your own pace.</p><div class="tags"><span class="tag">Copilot</span><span class="tag">Zero Trust</span><span class="tag">5 stations</span></div></div><div class="tool-actions"><a class="tool-launch" href="https://servicelogon.github.io/copilot-security-trail/" target="_blank" rel="noopener noreferrer">Hit the trail <span class="arrow-icon" aria-hidden="true"></span></a><a class="source-link" href="https://github.com/servicelogon/copilot-security-trail" target="_blank" rel="noopener noreferrer">Source on GitHub <span class="arrow-icon" aria-hidden="true"></span></a></div></article>
      <article class="tool-card passkey-card" id="passkey-aaguid-lookup"><div class="tool-top"><span class="kicker">02 / IDENTIFY</span><span class="tool-pill">LOOKUP UTILITY</span></div><div class="tool-visual lookup-visual" aria-hidden="true"><span class="lookup-prompt">AAGUID → PROVIDER</span><div class="lookup-code">xxxxxxxx-xxxx-xxxx<br>-xxxx-xxxxxxxxxxxx</div><span class="lookup-answer">A little less mystery.</span></div><div class="tool-copy"><p class="kicker">PUT A NAME TO THAT PASSKEY</p><h2>Passkey<br>AAGUID Lookup</h2><p>A long identifier, a quick answer. Match an AAGUID to its passkey provider, or browse the directory to see who’s who.</p><div class="tags"><span class="tag">Passkeys</span><span class="tag">Identity</span><span class="tag">AAGUID</span></div></div><div class="tool-actions"><a class="tool-launch" href="https://servicelogon.github.io/PasskeyLookup/" target="_blank" rel="noopener noreferrer">Meet your passkey <span class="arrow-icon" aria-hidden="true"></span></a><a class="source-link" href="https://github.com/servicelogon/PasskeyLookup" target="_blank" rel="noopener noreferrer">Source on GitHub <span class="arrow-icon" aria-hidden="true"></span></a></div><p class="tool-note">Provider labels use community data; they aren’t a basis for security decisions.</p></article>
    </section><aside class="explore-strip"><p>Built to be useful. Shared to be explored.</p><a class="internal-button" href="/">Back to the field notes</a></aside>`, { path: '/tools', origin: seo.origin || '', posts: seo.posts || [] });
}
