// Browser contracts against the real page shell and paginated HTTP routes.
const { chromium, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
(async () => {
  const { createAppServer, selectFrontPage } = await import('../server.js');
  const now = Date.now();
  const articles = Array.from({ length: 105 }, (_, i) => ({
    id: String(i), title: i === 104 ? 'Rare searchable token report' : `Fixture ${i} ${i % 2 ? 'identity' : 'cloud'} headline`,
    url: `https://example.com/${i}`, source: `Publisher ${i % 4}`, publishedAt: new Date(now - i * 3600000).toISOString(),
    summary: 'A cloud and identity security excerpt.', category: i === 104 ? 'vulnerabilities' : i % 2 ? 'identity' : 'cloud', topicScore: 0.8,
  }));
  articles[2] = { ...articles[2], title: 'Fixture Entra update', source: 'Microsoft Entra Blog', category: 'identity' };
  articles[3] = { ...articles[3], title: 'MC123456 — Fixture admin center update', source: 'MS Message Center', category: 'microsoft' };
  articles[4] = { ...articles[4], title: 'CVE-2026-1234 advisory', source: 'Microsoft Entra Blog', category: 'vulnerabilities' };
  articles[0].imageUrl = 'https://example.com/advisory.jpg';
  articles[0].stale = true;
  let snapshot = {
    articles, frontPageIds: selectFrontPage(articles), updatedAt: new Date(now).toISOString(), checkedAt: new Date(now).toISOString(),
    sources: [
      { name: 'Publisher 0', status: 'stale', lastSuccessAt: new Date(now - 3600000).toISOString(), error: 'HTTP 503' },
      { name: 'Microsoft Entra Blog', status: 'ok', lastSuccessAt: new Date(now).toISOString() },
      { name: 'Offline Wire', status: 'error', error: '<script>never markup</script>' },
    ],
  };
  let offline = false, release;
  let gate = new Promise(resolve => { release = resolve; });
  const server = createAppServer({ service: { getNews: async () => {
    if (gate) await gate;
    if (offline) throw new Error('Service offline');
    return snapshot;
  } } });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://example.com/advisory.jpg', route => route.fulfill({ path: 'test/fixtures/publisher-image.svg', contentType: 'image/svg+xml' }));
    await page.goto(base + '/newsroom');
    await expect(page.locator('#front-page-feed .skeleton-story')).toHaveCount(4);
    await expect(page.locator('#coverage-pulse')).toHaveAttribute('data-loading', 'true');
    await expect(page.locator('#front-page-empty')).toBeHidden();
    release(); gate = null;
    await expect(page.locator('#front-page-feed .skeleton-story')).toHaveCount(0);
    await expect(page.locator('.front-page-story')).toHaveCount(8);
    await expect(page.locator('#refresh-news, #feed-status, #source-health, [data-empty-retry]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /refresh|retry|try again/i })).toHaveCount(0);
    await expect(page.locator('#news-error')).toBeHidden();
    await expect(page.locator('.front-page-story .stale-badge').first()).toHaveText('Cached story');
    await expect(page.locator('#coverage-pulse [data-topic]')).toHaveCount(7);
    await expect(page.locator('#topic-select')).toHaveCount(0);
    await expect(page.locator('.pulse-icon')).toBeVisible();
    assert.equal(await page.locator('.pulse-icon').evaluate(el => getComputedStyle(el).color), 'rgb(247, 255, 0)');
    await expect(page.locator('#coverage-pulse-strip')).toBeHidden();
    await page.locator('#coverage-pulse summary').click();
    await expect(page.locator('#coverage-pulse [data-topic="vulnerabilities"]')).toBeVisible();
    await expect(page.locator('.coverage-pulse-note')).toContainText('not threat severity');
    await page.keyboard.press('Escape');
    await expect(page.locator('#coverage-pulse-strip')).toBeHidden();
    assert.ok(await page.locator('#coverage-pulse summary').evaluate(el => el === document.activeElement));

    // A single DOM ordering is preserved at every breakpoint.
    const desktopOrder = await page.locator('.front-page-story').evaluateAll(nodes => nodes.map(node => node.dataset.articleId));
    assert.deepEqual(desktopOrder, snapshot.frontPageIds);
    await page.setViewportSize({ width: 390, height: 900 });
    assert.doesNotMatch(await page.locator('main').innerText(), /The stories worth your attention|headlines shaping the brief/);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok((await page.locator('.browse-controls').boundingBox()).height <= 70, 'collapsed controls fit in one compact row');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `controls fit at ${width}px`);
      await page.locator('#coverage-pulse summary').click();
      const panel = await page.locator('.coverage-pulse-panel').boundingBox();
      assert.ok(panel.x >= 0 && panel.x + panel.width <= width, `pulse panel fits at ${width}px`);
      if (process.env.SCREENSHOTS && width === 390) await page.screenshot({ path: '/tmp/nfs-controls-expanded-390.png' });
      await page.locator('#coverage-pulse [data-topic="vulnerabilities"]').click();
      await expect(page.locator('#feed > .story')).toHaveCount(2);
      await expect(page.locator('#coverage-pulse-strip')).toBeHidden();
      await expect(page.locator('#section-title')).toHaveText('Vulnerabilities');
      assert.ok(await page.locator('#coverage-pulse summary').evaluate(el => el === document.activeElement));
      await page.locator('#front-page-link').click();
      await expect(page.locator('#front-page')).toBeVisible();
      await expect(page.locator('#front-page-link')).toHaveAttribute('aria-pressed', 'true');
    }
    if (process.env.SCREENSHOTS) await page.screenshot({ path: '/tmp/nfs-controls-collapsed-390.png' });
    assert.deepEqual(await page.locator('.front-page-story').evaluateAll(nodes => nodes.map(node => node.dataset.articleId)), desktopOrder);
    const positions = await page.locator('.front-page-story').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().top));
    assert.ok(positions.every((top, i) => i === 0 || top > positions[i - 1]), 'mobile visual order follows the ranked DOM');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('#coverage-pulse summary').click();
    await page.locator('#front-page-link').click();
    await expect(page.locator('#coverage-pulse-strip')).toBeHidden();
    await expect(page.locator('#front-page')).toBeVisible();
    await page.locator('#coverage-pulse summary').click();
    await page.locator('#pulse-all-coverage').click();
    await expect(page.locator('#feed > .story')).toHaveCount(40);
    await page.locator('#load-more').click();
    await expect(page.locator('#feed > .story')).toHaveCount(80);
    await page.locator('#load-more').click();
    await expect(page.locator('#feed > .story')).toHaveCount(105);
    assert.deepEqual(await page.locator('#feed > .story').evaluateAll(nodes => nodes.map(node => node.dataset.articleId)), articles.map(a => a.id));
    await expect(page.locator('#load-more')).toBeHidden();
    await page.locator('#clear').click();
    await expect(page.locator('#feed > .story')).toHaveCount(40);
    snapshot = { ...snapshot, articles: articles.map((article, i) => i === 0 ? { ...article, title: 'Updated lead headline' } : article), checkedAt: new Date(now + 1000).toISOString() };
    await page.locator('#load-more').click();
    await expect(page.locator('#feed > .story')).toHaveCount(40);
    await expect(page.locator('#load-more')).toBeEnabled();
    await expect(page.locator('#feed .story h2').first()).toHaveText('Updated lead headline');
    await page.locator('#search').fill('Rare searchable token');
    await expect(page.locator('#feed > .story')).toHaveCount(1);
    await expect(page.locator('#feed .story h2')).toHaveText('Rare searchable token report');
    let delayedStarted = false, releaseDelayed, finishDelayed;
    const delivered = new Promise(resolve => { finishDelayed = resolve; });
    const delayed = new Promise(resolve => { releaseDelayed = resolve; });
    const slowRoute = async route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('query') !== 'delayed') return route.continue();
      const response = await route.fetch();
      delayedStarted = true;
      await delayed;
      await route.fulfill({ response }).catch(() => {}); // cancellation is expected
      finishDelayed();
    };
    await page.route(base + '/api/news?**', slowRoute);
    await page.locator('#search').fill('delayed');
    await expect.poll(() => delayedStarted).toBe(true);
    await page.locator('#search').fill('Rare searchable token');
    await expect(page.locator('#feed .story h2')).toHaveText('Rare searchable token report');
    releaseDelayed();
    await delivered;
    await page.unroute(base + '/api/news?**', slowRoute);
    await expect(page.locator('#feed .story h2')).toHaveText('Rare searchable token report');
    await page.locator('#search').fill('nothing-matches');
    await expect(page.locator('#empty')).toBeVisible();
    await page.locator('#clear').click();
    await expect(page.locator('#feed > .story')).toHaveCount(40);
    await page.locator('#coverage-pulse summary').click();
    await page.locator('#coverage-pulse [data-topic="microsoft"]').click();
    await expect(page.locator('#feed > .story')).toHaveCount(2);
    await expect(page.locator('#feed')).not.toContainText('CVE');
    await expect(page.locator('.message-center-badge')).toHaveText('Message Center');
    await expect(page.locator('.message-center-story h2')).toHaveText('Fixture admin center update');
    await page.locator('[data-microsoft-filter="news"]').click();
    await expect(page.locator('#feed > .story')).toHaveCount(1);
    await expect(page.locator('#feed .story h2')).toHaveText('Fixture Entra update');
    await page.locator('[data-microsoft-filter="message-center"]').click();
    await expect(page.locator('#feed .story h2')).toHaveText('Fixture admin center update');
    await page.locator('#coverage-pulse summary').click();
    await page.locator('#coverage-pulse [data-topic="vulnerabilities"]').click();
    await expect(page.locator('#feed > .story')).toHaveCount(2);

    // Search is discoverable, queries the full collection, and contains focus.
    await page.getByRole('button', { name: 'Search the site', exact: true }).click();
    await expect(page.locator('.shell')).toHaveAttribute('inert', '');
    for (const key of ['Tab', 'Shift+Tab', 'Tab']) {
      await page.keyboard.press(key);
      assert.ok(await page.locator('.command-palette-dialog').evaluate(dialog => dialog.contains(document.activeElement)));
    }
    await page.locator('#command-palette-input').fill('Rare searchable token');
    await expect(page.getByRole('option', { name: /Rare searchable token report/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.command-palette')).toBeHidden();
    assert.ok(await page.locator('.search-toggle').evaluate(button => button === document.activeElement));
    assert.equal(await page.locator('.shell').getAttribute('inert'), null);
    await page.keyboard.press('Control+k');
    await page.locator('#command-palette-input').fill('passkey');
    await expect(page.getByRole('option', { name: /Passkey AAGUID Lookup/ })).toBeVisible();
    await page.keyboard.press('Escape');

    // Failures retain loaded results or show an empty state without manual retries.
    offline = true;
    await page.evaluate(() => window.loadNews());
    await expect(page.locator('#feed > .story')).toHaveCount(2);
    await expect(page.locator('#news-error')).toContainText('Showing the last loaded results');
    await page.locator('#coverage-pulse summary').click();
    await page.locator('#coverage-pulse [data-topic="cloud"]').click();
    await expect(page.locator('#empty')).toBeVisible();
    await expect(page.locator('#empty .empty-actions')).toBeHidden();
    await expect(page.getByRole('button', { name: /refresh|retry|try again/i })).toHaveCount(0);
    await expect(page.locator('#feed > .story')).toHaveCount(0);
    offline = false;
    await page.reload();
    await expect(page.locator('.front-page-story')).toHaveCount(8);
    await page.locator('#coverage-pulse summary').click();
    await page.locator('#coverage-pulse [data-topic="cloud"]').click();
    await expect(page.locator('#feed > .story')).toHaveCount(40);
    await expect(page.locator('#news-error')).toBeHidden();
    snapshot = { ...snapshot, articles: [], frontPageIds: [], sources: [{ name: 'Offline Wire', status: 'error', error: 'HTTP 503' }] };
    await page.evaluate(() => window.loadNews());
    await expect(page.locator('#empty')).toBeVisible();
    await expect(page.locator('#empty')).toContainText('Offline Wire');
    await expect(page.locator('#coverage-pulse')).toBeHidden();
    offline = true;
    await page.reload();
    await expect(page.locator('#front-page-empty')).toBeVisible();
    await expect(page.locator('#front-page-empty')).toContainText('could not be loaded');
    await expect(page.locator('.front-page-story')).toHaveCount(0);
    assert.deepEqual(errors, []);
    console.log('Newsroom paging, full-catalog search, mobile order, simplified controls, focus, Microsoft filters, and recovery checks passed.');
  } finally {
    release?.();
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
