![Newsroom](assets/readme-newsroom-banner.png)

# New Frontier Security

New Frontier Security is a local Node.js website with a Markdown-powered blog, a cloud and identity security newsroom, and a showcase of identity tools. It keeps the reviewed public RSS source catalog intact, normalizes articles into a small JSON API, and renders a browser UI where cloud and identity stories lead while broader security coverage remains available.

Requires Node.js 22+ and npm.

## Run

```sh
npm ci
npm start
# Open http://127.0.0.1:3000
```

Use `PORT=3001 npm start` for another port. The server binds to all interfaces for local and LAN preview, but it is intended as a private/local tool. Open the UI through the server, not as a `file://` page.

This repository does not publish a hostname. Set `SITE_ORIGIN` to the public origin — scheme and host only, no path or trailing slash — so canonical URLs, Open Graph tags, `sitemap.xml`, and `robots.txt` use absolute links. When it is unset, those links stay root-relative.

```sh
SITE_ORIGIN=https://your-host.example npm start
```

Railway can deploy from the `Dockerfile` and use `GET /health` as a healthcheck. Set `SITE_ORIGIN` in that environment to the deployed origin. Public RSS feeds need no keys or credentials. Tenant-specific Microsoft 365 Message Center and Service Health access is not connected; Message Center items come from a community RSS preview feed inside the Microsoft tab.

## Publish a blog post

Add a lowercase, hyphenated `.md` file to `content/posts`, for example `my-first-field-note.md`:

```markdown
---
title: My first field note
description: A short summary for the blog home page.
date: 2026-09-14
author: Nathan Hess
image: /assets/blog/my-first-field-note-header.jpg
imageAlt: Short description of the preview image
tags: [Identity, Cloud]
draft: false
---

Write your post here with **bold**, *italics*, headings, links, lists, tables,
images, blockquotes, and fenced code blocks.
```

The filename becomes the URL: `/blog/my-first-field-note`. The home page lists published posts newest first and features the latest entry. Files are read on every request, so adding, editing, or removing a post takes effect on refresh without restarting the server or building the site. Copy files into this folder on the machine running the server; this is a folder workflow, not a browser upload form.

`title`, `description`, and a valid `date` (`YYYY-MM-DD`) are required. `author` defaults to Nathan Hess; `tags`, `image`, `imageAlt`, `draft`, and `sample` are optional. Tags show up as chips on the blog home and the post page, and each tag has a page at `/blog/tag/<slug>` (`Conditional Access` becomes `conditional-access`). Set `image` to an HTTPS URL or an explicitly mapped `/assets/blog/...jpg` or `.webp` file to show a preview image on the blog home, a header image on the post page, and that same image in the post’s social preview. Set `draft: true` to hide a post from the list, its direct URL, tag pages, and the sitemap. Add `sample: true` to display a sample-post notice. Invalid posts are skipped with a server log explaining the problem. Uppercase filenames, nested directories, and files other than `.md` are ignored. Dates control sorting, not scheduled publication; use `draft: true` for unpublished work.

Raw HTML is displayed as text, and unsafe Markdown link protocols are rejected. For images, use an HTTPS image URL or an explicitly mapped local asset; arbitrary files in the repository are never served.

The first post is `content/posts/entra-default-settings-that-you-should-change.md`. Use it as a model for future field notes.

### Pages

- `/` (also `/blog` and `/index.html`): blog home.
- `/blog/<filename-without-extension>`: a complete blog post.
- `/blog/tag/<tag>`: field notes that use that tag. Unknown tags return a 404 empty state, in the same style as a missing post.
- `/newsroom`: the existing news dashboard.
- `/tools`: Copilot Security Trail and Passkey AAGUID Lookup, with live-app and GitHub links.
- `/sitemap.xml` and `/robots.txt`: public page index and crawler rules.

Blog home, tag pages, posts, the newsroom, and tools include canonical URLs plus Open Graph and Twitter card tags. A post’s hero image is the Open Graph image when the post has one.

All pages have a top-right menu with Blog, Newsroom, and Tools. It works with keyboard and touch; Escape closes it and returns focus to its button. Cmd+K or Ctrl+K opens a site-wide search palette for field notes, tools, and newsroom headlines.

## What It Includes

- A New Frontier Security newsroom UI with front-page cards, cloud/identity-first filtering, search, source health, and load-more browsing.
- 21 reviewed public security feeds in `sources.js`, including six Microsoft-focused streams and a community Message Center RSS preview.
- A local `/api/news` endpoint with normalized article metadata, source status, stale fallback, and cache timestamps.
- Explicit documentation for unavailable, reference-only, and authentication-required sources in `SOURCE-COVERAGE.md`.
- A Microsoft tab that combines Microsoft-source security coverage with community Message Center RSS preview items and can filter between Microsoft News and Message Center updates.

## Verify

```sh
npm test
npx playwright install chromium
npm run test:ui
npm run test:live
```

`npm test` runs deterministic backend tests with inline RSS fixtures and no external network. `npm run test:ui` runs fixture-driven browser tests. `npm run test:live` checks actual upstream feeds through a temporary HTTP server, prints source statuses/counts, exits nonzero if any feed fails, and closes its server.

Backend tests cover normalization, unsafe links, URL deduplication, cloud/identity categorization, disk cache reuse, concurrent request coalescing, TTL expiry, stale fallback, HTTP errors, malformed XML, byte limits, timeout, redirect refusal, Microsoft category behavior, and static/API routing.

## API

`GET /api/news` accepts no query parameters and returns:

```ts
{
  articles: Array<{
    id: string;                  // stable 24-character SHA-256 URL digest prefix
    title: string;
    url: string;                 // http(s), no embedded credentials
    source: string;
    publishedAt: string | null;  // upstream date normalized to ISO; null if absent/invalid
    summary: string;             // plain-text excerpt, up to 600 characters
    imageUrl?: string;           // reviewed http(s) image URL when present in the feed item
    sourceCategory?: 'microsoft'; // present for articles from Microsoft-focused feeds
    category: 'cloud' | 'identity' | 'vulnerabilities' | 'incidents' | 'malware' | 'operations' | 'microsoft';
  }>;
  sources: Array<{
    name: string;
    status: 'ok' | 'stale' | 'error';
    error?: string;
  }>;
  updatedAt: string | null;
}
```

`ok` means the most recent refresh succeeded, possibly from a fresh local cache. `stale` means a fetch failed and previously fetched articles remain available. `error` means the source failed with no saved articles. Partial or total upstream failures still return HTTP 200 with explicit statuses; the service does not fabricate news.

Articles are sorted newest-first, canonicalized by removing fragments and common tracking query parameters, and deduplicated by URL. The first source/item wins duplicate URLs. Publisher dates are preserved as supplied, including future-dated entries. The Front Page prioritizes cloud and identity stories when they are available, but all normalized security stories remain accessible through All coverage, topic filters, and search.

## Microsoft Coverage

The Microsoft tab contains public Microsoft-source security updates and the community Message Center preview feed:

- MSRC Security Update Guide
- Microsoft Security Blog
- Microsoft Entra Blog
- Defender for Cloud Blog
- Microsoft Security Community Blog
- MS Message Center community RSS preview

Private Microsoft 365 Message Center and Service Health data is deliberately not ingested. Message Center preview items are visually marked in the Microsoft feed and can be filtered separately from Microsoft News. See `MESSAGE-CENTER.md` for the required authentication, authorization, pagination, throttling, and data-separation design before any tenant integration is added.

Do not expose tenant messages through the public RSS API or cache.

## Caching and Safety

- Feed URLs come from a fixed server-side allowlist; requests cannot supply source URLs or turn the service into a proxy.
- Feeds are fetched with at most eight concurrent requests, an eight-second per-feed timeout, a 24-second refresh deadline, and a 3,000,000-byte decompressed body limit.
- Redirects are rejected rather than followed to unreviewed destinations.
- `.cache/news.json` persists successful source articles and failures with a five-minute TTL, including error results to avoid hammering blocked publishers.
- Failed refreshes preserve source-specific stale data indefinitely and visibly mark the source stale.
- Cache writes are atomic; absent or invalid cache JSON causes a cold start.
- HTML pages use `Cache-Control: no-cache`, so a refresh shows new and edited posts. Missing pages and other errors use `no-store`.
- Stylesheets, scripts, and images are served with a content hash in the query string (`/assets/site.css?v=<hash>`). A matching hash uses `public, max-age=31536000, immutable`. The same file without that hash uses `public, max-age=300`, so an unversioned URL cannot stay cached for a year.
- `GET /api/news` success responses use `public, max-age=60, stale-while-revalidate=300`. The JSON is the same for every caller. Query errors, `/health`, and `405`/`500` responses use `no-store` and are not stored as a public representation.
- Text responses (HTML, CSS, JavaScript, JSON, XML, and plain text) are compressed with Brotli or gzip when the request `Accept-Encoding` allows it.
- `sitemap.xml` and `robots.txt` use `no-cache` so new posts and tags show up without waiting out a long cache.
- Only the documented page routes, `/api/news`, `/health`, `/sitemap.xml`, `/robots.txt`, and explicitly mapped stylesheet, script, and image assets are served. No arbitrary directories, cache files, source files, tests, backup HTML, or repository internals are public.
- Feed strings are plain text, not trusted markup. Frontend consumers should render them with text APIs, not `innerHTML`.

This project is intended for a single local process or private preview, not a hardened public deployment. No CSP is added that would block the current inline frontend scripts/styles.

## Sources

The reviewed feed allowlist is in `sources.js`. `SOURCE-COVERAGE.md` records the disposition of each requested source, verified feed endpoints, reference-only pages, unavailable integrations, and authentication-required Microsoft tenant services.

Availability can change by network, rate limit, or publisher policy. Run `npm run test:live` for current feed results. No access-control bypass is used.

Publisher names and article links provide attribution. Summaries are short excerpts from RSS feeds, not full-text scraping. Public RSS availability is not a blanket reuse license; review each publisher's feed/content terms before redistribution, commercial use, or public hosting.
