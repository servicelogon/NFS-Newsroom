# Beacon source coverage

Verified 2026-09-08 using real Node fetch and rss-parser, unauthenticated public requests only. Homepages were checked for RSS/Atom links; plausible public feed endpoints were tested independently. Redirect discovery was allowed during investigation only; production uses reviewed final URLs with `redirect: error`. A homepage block does not imply its separate public RSS endpoint is blocked. No login, WAF bypass, Graph, or tenant data access was performed.

## Dispositions of all 33 supplied entries

**20 enabled public feeds (5 forced `microsoft`), 9 reference-only, 2 unavailable, 2 authentication-required = 33.** Enabled includes explicitly labeled successor/public-blog alternatives below. The Microsoft category is intentionally limited to security-focused streams; general product roadmaps and release announcements remain documented as reference-only. The Hacker News means the cybersecurity publication, not Y Combinator Hacker News; the latter was probed to resolve ambiguity but is not enabled. No duplicate Azure Security Center feed is manufactured from the Defender feed.

| # | Requested source | Exact supplied homepage | Disposition | Working feed used by Beacon | Observed result / scope |
|---|---|---|---|---|---|
| 1 | The Hacker News | https://thehackernews.com/ | **enabled** | https://feeds.feedburner.com/TheHackersNews | HTTP 200. Feed fetched successfully as RSS/Atom (HTTP 200). |
| 2 | BleepingComputer | https://www.bleepingcomputer.com/ | **enabled** | https://www.bleepingcomputer.com/feed/ | HTTP 200. Feed fetched successfully as RSS/Atom (HTTP 200). |
| 3 | SecurityWeek | https://www.securityweek.com/ | **enabled** | https://www.securityweek.com/feed/ | HTTP 200. Feed fetched successfully as RSS/Atom (HTTP 200). |
| 4 | Infosecurity Magazine | https://www.infosecurity-magazine.com/news/ | **enabled** | https://www.infosecurity-magazine.com/rss/news/ | HTTP 200. Feed fetched successfully as RSS/Atom (HTTP 200). |
| 5 | Dark Reading | https://www.darkreading.com/ | **enabled** | https://www.darkreading.com/rss.xml | HTTP 403. Homepage returned HTTP 403; public /rss.xml independently returned HTTP 200 and valid RSS. No bypass used. |
| 6 | CSO Online | https://www.csoonline.com/ | **enabled** | https://www.csoonline.com/feed/ | HTTP 200. Feed fetched successfully as RSS/Atom (HTTP 200). |
| 7 | Help Net Security | https://www.helpnetsecurity.com/ | **enabled** | https://www.helpnetsecurity.com/feed/ | HTTP 200. Feed fetched successfully as RSS/Atom (HTTP 200). |
| 8 | The Record | https://therecord.media/ | **enabled** | https://therecord.media/feed | HTTP 200. Feed fetched successfully as RSS/Atom (HTTP 200). |
| 9 | Krebs on Security | https://krebsonsecurity.com/ | **enabled** | https://krebsonsecurity.com/feed/ | HTTP 200. Feed fetched successfully as RSS/Atom (HTTP 200). |
| 10 | Schneier on Security | https://www.schneier.com/ | **enabled** | https://www.schneier.com/feed/atom/ | HTTP 200. Feed fetched successfully as RSS/Atom (HTTP 200). |
| 11 | CyberScoop | https://cyberscoop.com/ | **enabled** | https://cyberscoop.com/feed/ | HTTP 200. Feed fetched successfully as RSS/Atom (HTTP 200). |
| 12 | Naked Security | https://nakedsecurity.sophos.com/ | **enabled** | https://www.sophos.com/en-us/blog/feed | HTTP 200 → https://www.sophos.com/en-us/blog. Original homepage and /feed/ redirect to Sophos HTML. Explicit successor feed, not a revived Naked Security feed. |
| 13 | The Register (Security) | https://www.theregister.com/security/ | **enabled** | https://api.theregister.com/api/v1/article?orderBy=published&site_id=2&remapper=rss&query=tag:security | HTTP 200. Legacy /security/headlines.atom redirects to this canonical public RSS API; backend uses final URL. |
| 14 | DataBreaches.net | https://www.databreaches.net/ | **enabled** | https://databreaches.net/feed/ | HTTP 200 → https://databreaches.net/. Feed fetched successfully as RSS/Atom (HTTP 200). |
| 15 | CISA | https://www.cisa.gov/ | **enabled** | https://www.cisa.gov/cybersecurity-advisories/all.xml | HTTP 200. Feed fetched successfully as RSS/Atom (HTTP 200). |
| 16 | NIST NVD | https://nvd.nist.gov/ | **reference-only** | — | HTTP 200. Reference/data source, not news RSS. Legacy https://nvd.nist.gov/feeds/xml/cve/misc/nvd-rss.xml returned HTTP 404, 0 bytes. JSON/CVE datasets are not ingested as articles. |
| 17 | MITRE ATT&CK | https://attack.mitre.org/ | **reference-only** | — | HTTP 200. Reference knowledge base; HTTP 200 HTML, no RSS/Atom discovery link found. Not converted into a feed. |
| 18 | MSRC Security Update Guide | https://msrc.microsoft.com/update-guide | **enabled** | https://api.msrc.microsoft.com/update-guide/rss | HTTP 200. HTTP 200, 4,348 entries / 2,287,479 bytes in probe. Query $top=100 was ignored (same size/count); bounded default raised from 2 MB to 3 MB to admit this feed. |
| 19 | MSRC Blog | https://msrc.microsoft.com/blog | **unavailable** | — | HTTP 200 → https://www.microsoft.com/en-us/msrc/blog. Homepage redirects to https://www.microsoft.com/en-us/msrc/blog (HTTP 200 HTML); https://msrc.microsoft.com/blog/feed/ also redirects there, not XML. https://www.microsoft.com/en-us/msrc/blog/feed returned HTTP 404. Not enabled; Update Guide is separate. |
| 20 | Microsoft Security Blog | https://www.microsoft.com/en-us/security/blog/ | **enabled** | https://www.microsoft.com/en-us/security/blog/feed/ | HTTP 200. Feed fetched successfully as RSS/Atom (HTTP 200). |
| 21 | Office / Microsoft 365 Apps security updates | https://learn.microsoft.com/en-us/officeupdates/microsoft365-apps-security-updates | **reference-only** | — | HTTP 200. HTTP 200 HTML reference page; no RSS/Atom discovery found. |
| 22 | Windows release health | https://learn.microsoft.com/en-us/windows/release-health/ | **reference-only** | — | HTTP 200. HTTP 200 HTML reference page; no RSS/Atom discovery found. |
| 23 | Microsoft Entra Blog | https://techcommunity.microsoft.com/blog/microsoft-entra-blog | **enabled** | https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=microsoft-entra-blog | HTTP 404. Supplied /blog/ homepage returned HTTP 404. https://techcommunity.microsoft.com/category/microsoft-entra/blog/microsoft-entra-blog returned HTTP 200 and discovered board.id=microsoft-entra-blog. Legacy Identity and MicrosoftEntraBlog RSS boards returned HTTP 200 Resource Not Found XML, 0 items; excluded. |
| 24 | What’s new in Microsoft Entra | https://learn.microsoft.com/en-us/entra/fundamentals/whats-new | **reference-only** | — | HTTP 200. HTTP 200 HTML reference page; no RSS/Atom discovery found. |
| 25 | Azure updates | https://azure.microsoft.com/updates | **reference-only** | — | A working RSS feed exists, but general Azure release updates are excluded from the security-only Microsoft category. |
| 26 | Azure Security Blog | https://techcommunity.microsoft.com/blog/azuresecuritycenterblog | **unavailable** | — | HTTP 404. Supplied homepage HTTP 404. RSS board.id=AzureSecurityCenterBlog and board.id=Azure-Security-Blog both returned HTTP 200 Resource Not Found XML, 0 items. Disabled separately; Defender for Cloud is available under its own source, not double-counted. |
| 27 | Microsoft 365 Message Center | https://admin.microsoft.com/Adminportal/Home#/MessageCenter | **authentication-required** | — | Requires tenant authentication; not accessed. Requires authenticated Microsoft tenant access and explicit consent. Disconnected; no Graph calls or authentication implemented. See MESSAGE-CENTER.md. |
| 28 | Microsoft 365 Service Health | https://admin.microsoft.com/Adminportal/Home#/servicehealth | **authentication-required** | — | Requires tenant authentication; not accessed. Requires authenticated Microsoft tenant access and explicit consent. Disconnected; no Graph calls or authentication implemented. See MESSAGE-CENTER.md. |
| 29 | Microsoft 365 Roadmap | https://www.microsoft.com/microsoft-365/roadmap | **reference-only** | — | A working RSS feed exists, but general roadmap entries are excluded from the security-only Microsoft category. |
| 30 | Microsoft 365 Blog | https://www.microsoft.com/en-us/microsoft-365/blog | **reference-only** | — | A working RSS feed exists, but general Microsoft 365 product announcements are excluded from the security-only Microsoft category. |
| 31 | Cloud status | https://status.cloud.microsoft | **reference-only** | — | HTTP 200 → https://status.cloud.microsoft/. HTTP 200 public HTML status shell, no RSS/Atom discovery found. Public aggregate status is not tenant Service Health; reference-only, never represented as tenant data. |
| 32 | Microsoft Defender Blog | https://techcommunity.microsoft.com/blog/microsoftdefendercloudblog | **enabled** | https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=MicrosoftDefenderCloudBlog | HTTP 404. Supplied /blog/ homepage returned HTTP 404; canonical MicrosoftDefenderCloudBlog board RSS independently returned HTTP 200 with 20 entries. |
| 33 | Microsoft Security Community | https://techcommunity.microsoft.com/category/microsoft-security-and-compliance | **enabled** | https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=microsoft-security-blog | HTTP 200 → https://login.microsoftonline.com/ (OAuth sign-in). Supplied category URL led to Microsoft OAuth sign-in; stopped without authentication. Public https://techcommunity.microsoft.com/category/microsoft-security returned HTTP 200. Its Microsoft Security Community Blog public board feed returned HTTP 200, 20 entries. Legacy MicrosoftSecurityandCompliance RSS board returned Resource Not Found XML with 0 items. Enabled public community BLOG only, not all discussions/private content. |

## Five enabled Microsoft security streams

1. MSRC Security Update Guide — vulnerability and patch release entries (not MSRC editorial blog).
2. Microsoft Security Blog — security research and product/security announcements.
3. Microsoft Entra Blog — identity announcements from its current public Tech Community board.
4. Defender for Cloud Blog — current public MicrosoftDefenderCloudBlog board, not the unavailable legacy Azure Security Center board.
5. Microsoft Security Community — public Microsoft Security Community **Blog** board, not the old sign-in-gated category or all community discussions.

All five force the Microsoft article category; none require or imply a tenant connection.

## Runtime bounds and API compatibility

- `GET /api/news` keeps `{articles, sources, updatedAt}` and existing article/source fields. Reference-only, unavailable and tenant-only entries are not fake feed status rows.
- Maximum eight simultaneous upstream requests, eight-second per-feed timeout, shared 24-second refresh deadline (active requests aborted, remaining queued sources get errors/stale data). This leaves headroom for the frontend's 30-second timeout. Parsing/cache I/O adds small overhead; the deadline is for upstream work, not a hard real-time CPU guarantee.
- Decoded streaming body limit and Content-Length guard: 3,000,000 bytes per feed. Raised from 2 MB specifically because real MSRC RSS is 2.29 MB; no unlimited body parsing. Redirects remain prohibited, URLs are static server-side catalog entries, and API query URLs remain rejected.
- Five-minute TTL, request coalescing, atomic private-mode disk cache and stale fallback remain. Cache v1 batches now match by source **name**, not array index: additions trigger refresh without discarding old source articles; removed sources vanish and reordered catalogs retain matching data.
- Every enabled Microsoft feed forces `category: microsoft`, overriding CVE/patch/breach keyword classification. The enabled Microsoft catalog is limited to security, identity, defense, and security-community sources.
- Message Center and tenant Service Health remain explicitly disconnected. Public Cloud status is distinct and cannot substitute for tenant service incidents.

## Live backend verification

The enabled catalog contains **20 feeds**, including **5 security-focused Microsoft streams**. Live article totals vary by publisher and refresh time; run `npm run test:live` for current results.

`node --test test/news.test.js`: **9/9 passing**, including cache migration, 40-source concurrency/deadline, forced Microsoft category, MSRC-sized bounded bodies, malformed XML, HTTP failures, redirects, coalescing, stale fallback, normalization and API static-path restrictions.

## Feed candidate probe ledger

This includes rejected and duplicate candidates, not just enabled URLs. HTTP 200 with zero-item “Resource Not Found” XML is not a verified working feed. Plain HTML/icon responses likewise are not feeds.

| Candidate | Exact observed result | Final URL |
|---|---|---|
| https://www.bleepingcomputer.com/feed/ | HTTP 200; 12943 bytes; 15 items; title: BleepingComputer | https://www.bleepingcomputer.com/feed/ |
| https://www.csoonline.com/feed/ | HTTP 200; 228025 bytes; 20 items; title: CSO Online | https://www.csoonline.com/feed/ |
| https://www.helpnetsecurity.com/feed/ | HTTP 200; 18047 bytes; 10 items; title: Help Net Security | https://www.helpnetsecurity.com/feed/ |
| https://www.infosecurity-magazine.com/rss/news/ | HTTP 200; 132271 bytes; 250 items; title: (not supplied) | https://www.infosecurity-magazine.com/rss/news/ |
| https://news.ycombinator.com/rss | HTTP 200; 11832 bytes; 30 items; title: Hacker News | https://news.ycombinator.com/rss |
| https://www.securityweek.com/feed/ | HTTP 200; 11217 bytes; 10 items; title: SecurityWeek | https://www.securityweek.com/feed/ |
| https://www.schneier.com/feed/atom/ | HTTP 200; 37775 bytes; 10 items; title: Schneier on Security | https://www.schneier.com/feed/atom/ |
| https://feeds.feedburner.com/TheHackersNews | HTTP 200; 59380 bytes; 50 items; title: The Hacker News | https://feeds.feedburner.com/TheHackersNews |
| https://therecord.media/feed | HTTP 200; 5218 bytes; 5 items; title: The Record from Recorded Future News | https://therecord.media/feed |
| https://krebsonsecurity.com/feed/ | HTTP 200; 161618 bytes; 10 items; title: Krebs on Security | https://krebsonsecurity.com/feed/ |
| https://cyberscoop.com/feed/ | HTTP 200; 78161 bytes; 10 items; title: CyberScoop | https://cyberscoop.com/feed/ |
| https://databreaches.net/feed/ | HTTP 200; 15427 bytes; 10 items; title: DataBreaches.Net | https://databreaches.net/feed/ |
| https://www.darkreading.com/rss.xml | HTTP 200; 77402 bytes; 50 items; title: darkreading | https://www.darkreading.com/rss.xml |
| https://nvd.nist.gov/feeds/xml/cve/misc/nvd-rss.xml | HTTP 404; 0 bytes; not parseable RSS/Atom | https://nvd.nist.gov/feeds/xml/cve/misc/nvd-rss.xml |
| https://attack.mitre.org/ | HTTP 200; 1510539 bytes; not parseable RSS/Atom | https://attack.mitre.org/ |
| https://www.cisa.gov/cybersecurity-advisories/all.xml | HTTP 200; 390023 bytes; 30 items; title: All CISA Advisories | https://www.cisa.gov/cybersecurity-advisories/all.xml |
| https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=Identity | HTTP 200; 494 bytes; 0 items; title: Resource Not Found | https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=Identity |
| https://learn.microsoft.com/en-us/windows/release-health/ | HTTP 200; 50240 bytes; not parseable RSS/Atom | https://learn.microsoft.com/en-us/windows/release-health/ |
| https://www.microsoft.com/en-us/security/blog/feed/ | HTTP 200; 370464 bytes; 10 items; title: Microsoft Security Blog | https://www.microsoft.com/en-us/security/blog/feed/ |
| https://learn.microsoft.com/en-us/officeupdates/microsoft365-apps-security-updates | HTTP 200; 240022 bytes; not parseable RSS/Atom | https://learn.microsoft.com/en-us/officeupdates/microsoft365-apps-security-updates |
| https://msrc.microsoft.com/blog/feed/ | HTTP 200; 94267 bytes; not parseable RSS/Atom | https://www.microsoft.com/en-us/msrc/blog |
| https://www.theregister.com/security/headlines.atom | HTTP 200; 265758 bytes; 50 items; title: www.theregister.com - Articles | https://api.theregister.com/api/v1/article?orderBy=published&site_id=2&remapper=rss&query=tag:security |
| https://www.microsoft.com/en-us/microsoft-365/blog/feed/ | HTTP 200; 11971 bytes; 10 items; title: Microsoft 365 Blog | https://www.microsoft.com/en-us/microsoft-365/blog/feed/ |
| https://api.msrc.microsoft.com/update-guide/rss | HTTP 200; 2287479 bytes; 4348 items; title: MSRC Security Update Guide | https://api.msrc.microsoft.com/update-guide/rss |
| https://learn.microsoft.com/en-us/entra/fundamentals/whats-new | HTTP 200; 161878 bytes; not parseable RSS/Atom | https://learn.microsoft.com/en-us/entra/fundamentals/whats-new |
| https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=AzureSecurityCenterBlog | HTTP 200; 494 bytes; 0 items; title: Resource Not Found | https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=AzureSecurityCenterBlog |
| https://azurecomcdn.azureedge.net/en-us/updates/feed/ | HTTP 200; 18324 bytes; not parseable RSS/Atom | https://azure.microsoft.com/favicon.ico |
| https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=MicrosoftSecurityandCompliance | HTTP 200; 494 bytes; 0 items; title: Resource Not Found | https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=MicrosoftSecurityandCompliance |
| https://nakedsecurity.sophos.com/feed/ | HTTP 200; 669508 bytes; not parseable RSS/Atom | https://www.sophos.com/en-us/blog |
| https://www.microsoft.com/en-us/microsoft-365/RoadmapFeatureRSS | HTTP 200; 1678576 bytes; 1757 items; title: Microsoft 365 Roadmap - Get the Latest Updates | https://www.microsoft.com/releasecommunications/api/v2/m365/rss |
| https://status.cloud.microsoft/ | HTTP 200; 2058 bytes; not parseable RSS/Atom | https://status.cloud.microsoft/ |
| https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=MicrosoftDefenderCloudBlog | HTTP 200; 280898 bytes; 20 items; title: Microsoft Defender for Cloud Blog articles | https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=MicrosoftDefenderCloudBlog |
| https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=MicrosoftEntraBlog | HTTP 200; 494 bytes; 0 items; title: Resource Not Found | https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=MicrosoftEntraBlog |
| https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=microsoft-security-blog | HTTP 200; 359389 bytes; 20 items; title: Microsoft Security Community Blog articles | https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=microsoft-security-blog |
| https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=Azure-Security-Blog | HTTP 200; 494 bytes; 0 items; title: Resource Not Found | https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=Azure-Security-Blog |
| https://azure.microsoft.com/en-us/updates | HTTP 200; 174381 bytes; not parseable RSS/Atom | https://azure.microsoft.com/en-us/updates |
| https://nvd.nist.gov/general/news | HTTP 200; 111175 bytes; not parseable RSS/Atom | https://www.nist.gov/itl/nvd |
| https://www.microsoft.com/en-us/msrc/blog/feed | HTTP 404; 784306 bytes; not parseable RSS/Atom | https://www.microsoft.com/en-us/msrc/blog/feed |
| https://www.sophos.com/en-us/blog/feed | HTTP 200; 4629 bytes; 9 items; title: Sophos Blogs | https://www.sophos.com/en-us/blog/feed |
| https://www.cisa.gov/about/contact-us/subscribe-updates-cisa | HTTP 200; 57133 bytes; not parseable RSS/Atom | https://www.cisa.gov/about/contact-us/subscribe-updates-cisa |
| https://thehackernews.com/ | HTTP 200; 195470 bytes; not parseable RSS/Atom | https://thehackernews.com/ |
| https://api.msrc.microsoft.com/update-guide/rss?sortBy=releaseDate&sortOrder=desc&$top=100 | HTTP 200; 2287479 bytes; 4348 items; title: MSRC Security Update Guide | https://api.msrc.microsoft.com/update-guide/rss?sortBy=releaseDate&sortOrder=desc&$top=100 |
| https://www.sophos.com/en-us/blog/feed/ | HTTP 200; 4629 bytes; 9 items; title: Sophos Blogs | https://www.sophos.com/en-us/blog/feed |
| https://techcommunity.microsoft.com/category/microsoft-entra/blog/microsoft-entra-blog | HTTP 200; 486270 bytes; not parseable RSS/Atom | https://techcommunity.microsoft.com/category/microsoft-entra/blog/microsoft-entra-blog |
| https://techcommunity.microsoft.com/category/microsoft-security | HTTP 200; 861386 bytes; not parseable RSS/Atom | https://techcommunity.microsoft.com/category/microsoft-security |
| https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=microsoft-entra-blog | HTTP 200; 239433 bytes; 20 items; Microsoft Entra Blog articles | same |
| https://www.microsoft.com/releasecommunications/api/v2/azure/rss | HTTP 200; 150909 bytes; 200 items; Azure service updates | same |
