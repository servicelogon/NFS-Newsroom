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

The filename becomes the URL: `/blog/my-first-field-note`. The home page lists published posts newest first and features the latest entry. File metadata is checked on every request, so adding, editing, or removing a post takes effect on refresh. Unchanged Markdown and syntax highlighting are reused from memory. Copy files into this folder on the machine running the server; this is a folder workflow, not a browser upload form.

`title`, `description`, and a valid `date` (`YYYY-MM-DD`) are required. `author` defaults to Nathan Hess; `tags`, `image`, `imageAlt`, `draft`, and `sample` are optional. Tags show up as chips on the blog home and the post page, and each tag has a page at `/blog/tag/<slug>` (`Conditional Access` becomes `conditional-access`). Set `image` to an HTTPS URL or a lowercase, hyphenated `.jpg`, `.jpeg`, or `.webp` file in `assets/blog` to show a preview image on the blog home, a header image on the post page, and that same image in the post’s social preview. Set `draft: true` to hide a post from the list, its direct URL, tag pages, and the sitemap. Add `sample: true` to display a sample-post notice. Invalid posts are skipped with a server log explaining the problem. Uppercase filenames, nested directories, and files other than `.md` are ignored. Dates control sorting, not scheduled publication; use `draft: true` for unpublished work.

Blog images are registered at startup; restart the server after adding a new image. Run `npm run check:content` to catch missing assets and invalid metadata before publishing. Long posts include anchored contents, and related field notes appear when tags overlap.

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

All pages have a top-right menu with Blog, Newsroom, and Toolbox. It works with keyboard and touch; Escape closes it and returns focus to its button. The visible search button, Cmd+K, or Ctrl+K opens a site-wide search palette for field notes, tools, and newsroom headlines. Keyboard focus stays inside the palette until it closes; focus then returns to the trigger.

## What It Includes

- A New Frontier Security newsroom UI with front-page cards, cloud/identity-first filtering, search, and load-more browsing.
- 21 reviewed public security feeds in `sources.js`, including six Microsoft-focused streams and a community Message Center RSS preview.
- A paginated `/api/news` endpoint and compact `/api/search` headline search, with normalized metadata, source status, and cache timestamps.
- Automatic feed loading, cached-story labels, and brief availability messages, with no manual refresh or retry controls. Publisher status and refresh timestamps remain available through the API.
- Coverage pulse counts across the full catalog for the last 24 hours, including vulnerabilities. These are article volumes, not threat severity; Microsoft overlaps other topics.
- Explicit documentation for unavailable, reference-only, and authentication-required sources in `SOURCE-COVERAGE.md`.
- A Microsoft tab that combines Microsoft-source security coverage with community Message Center RSS preview items and can filter between Microsoft News and Message Center updates.

## Verify

```sh
npm run check:content
npm test
npx playwright install chromium
npm run test:ui
npm run test:live
```

`npm test` runs deterministic backend tests with inline RSS fixtures and no external network. `npm run test:ui` runs fixture-driven browser tests. `npm run test:live` checks actual upstream feeds through a temporary HTTP server, prints source statuses/counts, exits nonzero if any feed fails, and closes its server.

PR and branch CI runs content validation, deterministic backend tests, and fixture-driven browser checks. Publisher availability runs in a separate scheduled/manual job, so external outages do not block code changes.

Backend tests cover pagination, query bounds, full-catalog search, refresh throttling, stale-data expiry, compressed module caching, normalization, unsafe links, URL deduplication, cloud/identity categorization, disk cache reuse, concurrent request coalescing, TTL expiry, stale fallback, HTTP errors, malformed XML, byte limits, timeout, redirect refusal, Microsoft category behavior, and static/API routing.

## API

`GET /api/news` returns **40 articles by default**, plus up to eight selected front-page articles and metadata for the **entire** catalog. It supports only these bounded parameters:

| Parameter | Values / default |
|---|---|
| `topic` | `all` (default), `cloud`, `identity`, `vulnerabilities`, `incidents`, `malware`, `operations`, `microsoft` |
| `query` | Case-insensitive title, excerpt, and publisher search; at most 200 characters |
| `offset` | Integer 0–100000; default 0 |
| `limit` | Integer 1–100; default 40 |
| `microsoftFilter` | `all` (default), `news`, `message-center`; used with the Microsoft topic |
| `refresh` | `1` requests a publisher refresh; shared requests coalesce and refreshes are limited to once every 30 seconds |

Unknown, repeated, or invalid parameters return HTTP 400. Callers cannot supply feed URLs. Filtered paging preserves access to the full catalog without downloading thousands of advisory records on initial load.

```ts
{
  articles: Article[];
  frontPage: Article[];             // independent of the current topic/search/page
  frontPageIds: string[];
  sources: Array<{
    name: string;
    status: 'ok' | 'stale' | 'error';
    error?: string;
    lastSuccessAt: string | null;   // feed collection time, not publication date
    checkedAt: string;
    articleCount: number;
  }>;
  updatedAt: string | null;         // latest refresh with at least one successful feed
  checkedAt: string | null;         // latest attempt, including failures
  refreshAvailableAt: string | null;
  topicCounts: Record<string, number>;
  pulseCounts: Record<string, number>; // full-catalog publisher dates in the last 24h
  total: number;                   // matches for current filters
  totalArticles: number;           // full normalized catalog size
  offset: number;
  limit: number;
  nextOffset: number | null;
}
```

`Article` includes `id`, `title`, `url`, `source`, `publishedAt`, `summary`, `category`, `topicScore`, and `stale`; `imageUrl` and `sourceCategory` are optional. IDs are 24-character SHA-256 URL digest prefixes. Titles/excerpts are plain text; URLs are http(s) without embedded credentials. `publishedAt` is the publisher's ISO date or `null`; excerpts are limited to 600 characters.

`GET /api/search?query=...` returns `{ articles: [{ title, url, source, stale }] }`, with at most 20 matches (eight recent headlines for an empty query). It searches the whole cached collection, including articles beyond the initial page. The palette merges these compact results with the rendered post/tool index and cancels superseded searches.

`ok` means the latest feed collection succeeded. `stale` means a failed collection retained previous articles; `error` means no usable saved articles remain. Partial or total feed failures still return HTTP 200 with explicit statuses. Unrecoverable service errors return HTTP 500. No news is fabricated.

Articles are sorted newest-first, stripped of fragments and common tracking parameters, and deduplicated by URL; the first source/item wins. Publisher dates are preserved, including future dates, but future/invalid dates do not enter the coverage pulse. The front page selects cloud/identity stories with source diversity. An empty front page offers All coverage. Load-more starts again if the server snapshot changes, preserving a consistent order rather than mixing pages from two refreshes.

Newsroom only includes external publishers. NFS articles (by publisher name or site domain, including subdomains and `SITE_ORIGIN`) and NFS-hosted story images are excluded at ingestion and when reading snapshots, including older disk caches. These exclusions also apply to front-page selection, headline search, topic counts, and coverage pulse. NFS posts remain in Field Notes.

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
- Failed refreshes keep source-specific articles for seven days from the last successful collection; the next refresh drops expired data. Cached stories and unavailable publishers are visibly labeled.
- Cache writes are atomic; absent or invalid cache JSON causes a cold start.
- HTML pages use `Cache-Control: no-cache`, so a refresh shows new and edited posts. Missing pages and other errors use `no-store`.
- Stylesheets, scripts, and images are served with a content hash in the query string (`/assets/site.css?v=<hash>`). A matching hash uses `public, max-age=31536000, immutable`. The same file without that hash uses `public, max-age=300`, so an unversioned URL cannot stay cached for a year.
- `GET /api/news` and `/api/search` success responses use `public, max-age=60, stale-while-revalidate=300`. Each bounded query has its own URL. `refresh=1` responses use `no-store`; browser news/search requests revalidate cached query responses so a manual refresh cannot be followed by an older cached filter page. Query errors, `/health`, and `405`/`500` responses use `no-store` and are not stored as a public representation.
- Static assets are read, hashed, and precompressed once at startup. Module imports include dependency hashes, so browsers do not mix versions after a deploy. Dynamic text responses use asynchronous Brotli/gzip with a bounded compression cache and ETags.
- `sitemap.xml` and `robots.txt` use `no-cache` so new posts and tags show up without waiting out a long cache.
- Only the documented page routes, `/api/news`, `/api/search`, `/health`, `/sitemap.xml`, `/robots.txt`, and explicitly mapped stylesheet, script, and image assets are served. No arbitrary directories, cache files, source files, tests, backup HTML, or repository internals are public.
- Feed strings are plain text, not trusted markup. Frontend consumers should render them with text APIs, not `innerHTML`.

This project is intended for a single local process or private preview, not a hardened public deployment. The newsroom interactions and styles are external modules/assets; the shell embeds a non-executable JSON search index.

## Code map

| File | Responsibility |
|---|---|
| `server.js` | HTTP route allowlist and app lifecycle |
| `news-service.js` | Bounded RSS ingestion, coalescing, disk cache, freshness and retention |
| `news-api.js` | Query validation, paging, full-catalog counts, compact search |
| `http-response.js` / `static-assets.js` | Async response caching, asset registration, dependency versions and precompression |
| `blog.js` | Markdown parsing/cache, shared shell, field-note and toolbox pages |
| `index.html` | Newsroom body fragment inside the shared shell |
| `assets/newsroom.js` / `assets/article-card.js` | Request/state handling and shared article rendering |
| `assets/news-topics.js` / `assets/search.js` / `assets/coverage-pulse.js` | Shared server/browser contracts |
| `assets/site.js` / `assets/theme.js` | Search, navigation, footer animation, early theme preference |
| `assets/site.css` / `assets/newsroom.css` | Shared design tokens and newsroom composition |

## Sources

The reviewed feed allowlist is in `sources.js`. `SOURCE-COVERAGE.md` records the disposition of each requested source, verified feed endpoints, reference-only pages, unavailable integrations, and authentication-required Microsoft tenant services.

Availability can change by network, rate limit, or publisher policy. Run `npm run test:live` for current feed results. No access-control bypass is used.

Publisher names and article links provide attribution. Summaries are short excerpts from RSS feeds, not full-text scraping. Public RSS availability is not a blanket reuse license; review each publisher's feed/content terms before redistribution, commercial use, or public hosting.
