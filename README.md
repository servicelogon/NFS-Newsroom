# Beacon News

Local Node.js RSS aggregator with a browser UI. Requires Node.js 22+ and npm.

## Run

```sh
npm ci
npm start
# Open http://127.0.0.1:3000
```

Use `PORT=3001 npm start` for another port. The server binds to loopback only; stop with Ctrl-C. Open the UI through the server, not as a `file://` page. Public RSS feeds need no keys or credentials. Tenant-specific Microsoft Message Center access is not connected.

## Verify

```sh
npm test                  # deterministic backend tests, inline RSS fixtures, no external network
npx playwright install chromium  # once, if Chromium is not installed
npm run test:ui           # fixture-driven browser tests
npm run test:live         # actual upstream feeds through a temporary HTTP server
```

The live checker uses an isolated temporary cache, prints source statuses/counts, exits nonzero if any feed fails, and closes its server. Backend tests cover normalization, unsafe links, URL deduplication, disk cache reuse, concurrent request coalescing, TTL expiry, stale fallback, HTTP errors, malformed XML, byte limits, timeout, redirect refusal, and static/API routing.

## API

`GET /api/news` (no query parameters):

```ts
{
  articles: Array<{
    id: string;             // stable 24-character SHA-256 URL digest prefix
    title: string;
    url: string;            // http(s), no embedded credentials
    source: string;
    publishedAt: string | null; // upstream date normalized to ISO; null if absent/invalid
    summary: string;        // plain-text excerpt, up to 600 characters
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

`ok` means the most recent refresh succeeded (possibly served from the fresh local cache). `stale` means a fetch failed and previously fetched articles remain available. `error` means the source failed with no saved articles. Partial or total upstream failures still return HTTP 200 with explicit statuses, never fabricated news. `updatedAt` is the latest successful refresh, retained if all sources fail, and null before any success. Some publisher feeds include future-dated events; dates are preserved rather than invented or clamped.

Articles are sorted newest-first, canonicalized by removing fragments and common tracking query parameters, and deduplicated by URL. Microsoft publisher feeds use the `microsoft` category regardless of article keywords. Other categorization is a deterministic keyword heuristic; unmatched stories fall back to `threats`. The first source/item wins duplicate URLs.

## Microsoft and tenant updates

The Microsoft category collects public Microsoft-source updates. It does not contain private Microsoft 365 tenant messages. The separate Message Center section is explicitly **Not connected**, with links to the admin portal and Microsoft Graph documentation. See [MESSAGE-CENTER.md](MESSAGE-CENTER.md) for the required authentication/authorization design and `ServiceMessage.Read.All` permission. Do not expose tenant messages through the public RSS API or cache.

## Caching and safety

- Fixed server-side allowlist; no user-provided URLs, source configuration through requests, or proxy endpoint.
- Feeds fetched with at most eight concurrent requests, an eight-second per-feed timeout, a 24-second refresh deadline, and a 3,000,000-byte decompressed body limit. All redirects are rejected rather than followed to unreviewed destinations.
- `.cache/news.json` persists successful source articles and failures; refresh TTL is five minutes, including error results to avoid hammering blocked publishers. Concurrent requests share a refresh. Reads within TTL use local data; failed refreshes preserve source-specific stale data indefinitely, visibly marked stale. Delete `.cache/news.json` while stopped to clear history.
- Cache writes are atomic; absent/invalid JSON caches cause a cold start. A cache-write failure is logged and the service continues using memory.
- Only `/` and `/index.html` are served as static files. Assets are embedded in the current page. Additional local assets must be explicitly added to the `STATIC` map in `server.js`; no arbitrary directories, cache, source files, backup HTML, tests, or repository internals are public.
- Feed strings are plain text, not trusted markup. Frontend consumers must render them with text APIs, not `innerHTML`.
- Intended for a single local process, not a hardened public deployment. No CSP is added that would block the existing inline frontend scripts/styles.

## Sources and actual network verification

The reviewed feed allowlist is in `sources.js`. See [SOURCE-COVERAGE.md](SOURCE-COVERAGE.md) for the disposition of each requested site, verified feed endpoints, reference-only pages, and unavailable integrations. Availability can change by network, rate limit, or publisher policy; run `npm run test:live` for current results. No access-control bypass is used.

The browser displays 40 matching articles at a time with a Load more button. Category counts and search cover the full fetched collection, including the large MSRC Security Update Guide feed. The Microsoft category is limited to security-focused Microsoft sources; general product roadmaps and release announcements are excluded.

Publisher names and article links provide attribution; summaries are short excerpts from the publishers' RSS feeds, not full-text scraping. Public RSS availability is not a blanket reuse license. Review each publisher's feed/content terms before redistribution, commercial use, or public hosting, retain attribution and original links, and respect access restrictions. This project does not claim permission beyond what each publisher grants.
