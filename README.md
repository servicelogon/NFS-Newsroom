# NFS Newsroom

New Frontier Security Newsroom is a local Node.js security-news dashboard. It collects reviewed public RSS feeds, normalizes articles into a small JSON API, and renders a browser UI for vulnerabilities, threats, breaches, malware, engineering, and Microsoft security coverage.

Requires Node.js 22+ and npm.

## Run

```sh
npm ci
npm start
# Open http://127.0.0.1:3000
```

Use `PORT=3001 npm start` for another port. The server binds to all interfaces for local and LAN preview, but it is intended as a private/local tool. Open the UI through the server, not as a `file://` page.

Public RSS feeds need no keys or credentials. Tenant-specific Microsoft 365 Message Center and Service Health access is not connected.

## What It Includes

- A New Frontier Security newsroom UI with front-page cards, filtering, search, source health, and load-more browsing.
- 20 reviewed public security feeds in `sources.js`, including five Microsoft security-focused streams.
- A local `/api/news` endpoint with normalized article metadata, source status, stale fallback, and cache timestamps.
- Explicit documentation for unavailable, reference-only, and authentication-required sources in `SOURCE-COVERAGE.md`.
- A disconnected Microsoft 365 Message Center section with the required future Graph integration notes in `MESSAGE-CENTER.md`.

## Verify

```sh
npm test
npx playwright install chromium
npm run test:ui
npm run test:live
```

`npm test` runs deterministic backend tests with inline RSS fixtures and no external network. `npm run test:ui` runs fixture-driven browser tests. `npm run test:live` checks actual upstream feeds through a temporary HTTP server, prints source statuses/counts, exits nonzero if any feed fails, and closes its server.

Backend tests cover normalization, unsafe links, URL deduplication, disk cache reuse, concurrent request coalescing, TTL expiry, stale fallback, HTTP errors, malformed XML, byte limits, timeout, redirect refusal, Microsoft category behavior, and static/API routing.

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
    category: 'vulnerabilities' | 'threats' | 'breaches' | 'malware' | 'engineering' | 'microsoft';
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

Articles are sorted newest-first, canonicalized by removing fragments and common tracking query parameters, and deduplicated by URL. The first source/item wins duplicate URLs. Publisher dates are preserved as supplied, including future-dated entries.

## Microsoft Coverage

The Microsoft category contains public Microsoft-source security updates only:

- MSRC Security Update Guide
- Microsoft Security Blog
- Microsoft Entra Blog
- Defender for Cloud Blog
- Microsoft Security Community Blog

Private Microsoft 365 Message Center and Service Health data is deliberately not ingested. The UI marks Message Center as **Not connected** and links to the Microsoft 365 admin portal and Microsoft Graph documentation. See `MESSAGE-CENTER.md` for the required authentication, authorization, pagination, throttling, and data-separation design before any tenant integration is added.

Do not expose tenant messages through the public RSS API or cache.

## Caching and Safety

- Feed URLs come from a fixed server-side allowlist; requests cannot supply source URLs or turn the service into a proxy.
- Feeds are fetched with at most eight concurrent requests, an eight-second per-feed timeout, a 24-second refresh deadline, and a 3,000,000-byte decompressed body limit.
- Redirects are rejected rather than followed to unreviewed destinations.
- `.cache/news.json` persists successful source articles and failures with a five-minute TTL, including error results to avoid hammering blocked publishers.
- Failed refreshes preserve source-specific stale data indefinitely and visibly mark the source stale.
- Cache writes are atomic; absent or invalid cache JSON causes a cold start.
- Only `/`, `/index.html`, `/api/news`, and explicitly mapped image assets are served. No arbitrary directories, cache files, source files, tests, backup HTML, or repository internals are public.
- Feed strings are plain text, not trusted markup. Frontend consumers should render them with text APIs, not `innerHTML`.

This project is intended for a single local process or private preview, not a hardened public deployment. No CSP is added that would block the current inline frontend scripts/styles.

## Sources

The reviewed feed allowlist is in `sources.js`. `SOURCE-COVERAGE.md` records the disposition of each requested source, verified feed endpoints, reference-only pages, unavailable integrations, and authentication-required Microsoft tenant services.

Availability can change by network, rate limit, or publisher policy. Run `npm run test:live` for current feed results. No access-control bypass is used.

Publisher names and article links provide attribution. Summaries are short excerpts from RSS feeds, not full-text scraping. Public RSS availability is not a blanket reuse license; review each publisher's feed/content terms before redistribution, commercial use, or public hosting.
