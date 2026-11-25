// Browser contracts against the real page shell and paginated HTTP routes.
const { chromium, devices, expect } = require('@playwright/test');
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
  articles[6] = { ...articles[6], title: 'Fixture Copilot identity token theft', category: 'ai' };
  articles[0].imageUrl = 'https://example.com/advisory.jpg';
  articles[1].imageUrl = 'https://example.com/advisory.jpg';
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
    await expect(page.locator('#feed .skeleton-story')).toHaveCount(4);
    await expect(page.locator('#coverage-pulse')).toHaveAttribute('data-loading', 'true');
    await expect(page.locator('#empty')).toBeHidden();
    release(); gate = null;
    await expect(page.locator('#feed .skeleton-story')).toHaveCount(0);
    await expect(page.locator('#feed > .story')).toHaveCount(40);
    await expect(page.locator('#pulse-all-coverage')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Front page' })).toHaveCount(0);
    const cardImage = page.locator('.story-media img').first();
    assert.equal(await cardImage.getAttribute('alt'), await cardImage.evaluate(img => img.closest('article').querySelector('h2').textContent));
    assert.notEqual(await cardImage.getAttribute('alt'), '');
    assert.match(await cardImage.evaluate(img => getComputedStyle(img).filter), /grayscale/);
    const zoned = await browser.newPage({ timezoneId: 'America/Los_Angeles', viewport: { width: 1440, height: 1000 } });
    await zoned.goto(base + '/newsroom');
    await expect(zoned.locator('#feed .story time').first()).toBeVisible();
    assert.equal(await zoned.locator('#feed .story time').first().evaluate(time => time.textContent === new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(time.dateTime))), true);
    await zoned.close();
    await expect(page.locator('#refresh-news, #feed-status, #source-health, [data-empty-retry]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /refresh|retry|try again/i })).toHaveCount(0);
    await expect(page.locator('#news-error')).toBeHidden();
    await expect(page.locator('#feed .stale-badge').first()).toHaveText('Cached story');
    await expect(page.locator('#coverage-pulse [data-topic]')).toHaveCount(8);
    await expect(page.locator('#topic-select')).toHaveCount(0);
    await expect(page.locator('#coverage-pulse summary, .pulse-icon, .coverage-pulse-panel')).toHaveCount(0);
    await expect(page.locator('#coverage-pulse-strip')).toBeVisible();
    const pulseBand = await page.evaluate(() => {
      const lead = document.querySelector('#coverage-pulse-lead').getBoundingClientRect();
      const strip = document.querySelector('#coverage-pulse-strip').getBoundingClientRect();
      const globe = document.querySelector('.newsroom-globe').getBoundingClientRect();
      const chips = [...document.querySelectorAll('#coverage-pulse-strip [data-topic]')].map(chip => {
        const rect = chip.getBoundingClientRect();
        const count = chip.querySelector('.coverage-pulse-chip-count').getBoundingClientRect();
        const label = chip.querySelector('.coverage-pulse-chip-label').getBoundingClientRect();
        return {
          left: rect.left, right: rect.right, width: rect.width,
          countCenter: (count.left + count.right) / 2, labelCenter: (label.left + label.right) / 2,
        };
      });
      const gap = chips.length > 1 ? chips[1].left - chips[0].right : 0;
      const gaps = chips.slice(1).map((chip, index) => chip.left - chips[index].right);
      return {
        leadLeft: lead.left, leadTop: lead.top, stripLeft: strip.left, stripBottom: strip.bottom,
        globeLeft: globe.left, globeRight: globe.right, globeMid: (globe.top + globe.bottom) / 2,
        globeWidth: globe.width, stripRight: strip.right, gap, gaps, chips,
        bandRight: document.querySelector('.coverage-pulse-band').getBoundingClientRect().right,
      };
    });
    assert.ok(Math.abs(pulseBand.stripLeft - pulseBand.leadLeft) < 2, 'category counts stay left-aligned with the coverage line');
    assert.ok(pulseBand.gap > 0 && pulseBand.gap < 48, `category counts sit close together (${pulseBand.gap}px)`);
    assert.ok(pulseBand.gaps.every(g => Math.abs(g - pulseBand.gap) < 1), 'category count items are evenly spaced');
    assert.ok(pulseBand.chips.every(chip => Math.abs(chip.countCenter - chip.labelCenter) < 1.5), 'each desktop count centers over its label');
    assert.ok(pulseBand.globeLeft >= pulseBand.stripRight - 1, 'the globe sits to the right of the counts');
    assert.ok(pulseBand.globeMid > pulseBand.leadTop && pulseBand.globeMid < pulseBand.stripBottom, 'the globe shares the line with the coverage label and the counts');
    assert.ok(pulseBand.globeWidth >= 140, 'the globe is larger than the previous mark');
    assert.ok(pulseBand.bandRight - pulseBand.globeRight < 2, 'the globe is right-aligned');
    await expect(page.locator('#coverage-pulse [data-topic="vulnerabilities"]')).toBeVisible();
    await expect(page.locator('.coverage-pulse-note')).toHaveText('Select a topic to filter. Numbers = daily article volume for that category. Microsoft coverage overlaps other topics.');
    await expect(page.locator('#coverage-pulse-strip')).toHaveAttribute('aria-label', 'Topic filters');
    assert.ok(await page.locator('#pulse-all-coverage').evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 28));
    assert.equal(await page.locator('.coverage-switch').evaluate(el => getComputedStyle(el).borderTopWidth), '1px');
    const pulseStyle = await page.evaluate(() => {
      const hexToRgb = {};
      const labels = {};
      for (const chip of document.querySelectorAll('#coverage-pulse-strip [data-topic]')) {
        const label = chip.querySelector('.coverage-pulse-chip-label');
        const style = getComputedStyle(label);
        labels[chip.dataset.topic] = {
          hex: getComputedStyle(chip).getPropertyValue('--topic-color').trim().toLowerCase(),
          color: style.color,
          weight: Number(style.fontWeight),
          decoration: style.textDecorationLine,
        };
      }
      for (const tag of document.querySelectorAll('.story .topic')) {
        const hex = getComputedStyle(tag.closest('article')).getPropertyValue('--topic-color').trim().toLowerCase();
        hexToRgb[hex] = getComputedStyle(tag).color;
      }
      return { labels, hexToRgb };
    });
    const expectedPulseColors = {
      cloud: '#3b82f6',
      identity: '#a855f7',
      ai: '#06b6d4',
      vulnerabilities: '#ef4444',
      incidents: '#f97316',
      malware: '#ec4899',
      operations: '#10b981',
      microsoft: '#6366f1',
    };
    for (const [id, hex] of Object.entries(expectedPulseColors)) {
      assert.equal(pulseStyle.labels[id]?.hex, hex, `${id} uses the feed tag palette`);
      assert.ok(pulseStyle.labels[id]?.weight >= 700, `${id} pulse label is bold until selected`);
      assert.equal(pulseStyle.labels[id]?.decoration, 'none', `${id} label is not underlined`);
      if (pulseStyle.hexToRgb[hex]) {
        assert.equal(pulseStyle.labels[id].color, pulseStyle.hexToRgb[hex], `${id} matches feed tag color`);
      }
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('#coverage-pulse-strip')).toBeVisible();
    await expect(page.locator('#coverage-pulse [data-topic]')).toHaveCount(8);

    // A single DOM ordering is preserved at every breakpoint.
    const desktopOrder = await page.locator('#feed > .story').evaluateAll(nodes => nodes.map(node => node.dataset.articleId));
    assert.deepEqual(desktopOrder, articles.slice(0, 40).map(article => article.id));
    await page.setViewportSize({ width: 390, height: 900 });
    assert.doesNotMatch(await page.locator('main').innerText(), /The stories worth your attention|headlines shaping the brief|Go beyond the headline/);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `controls fit at ${width}px`);
      const figures = await page.locator('#coverage-pulse-strip').boundingBox();
      assert.ok(figures.x >= 0 && figures.x + figures.width <= width + 1, `pulse figures fit at ${width}px`);
      const pulseFit = await page.locator('#coverage-pulse-strip').evaluate(strip => {
        const style = getComputedStyle(strip);
        const boxes = [...strip.querySelectorAll('[data-topic]')].map(node => {
          const rect = node.getBoundingClientRect();
          return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, w: rect.width, h: rect.height };
        });
        return { columnGap: style.columnGap, rowGap: parseFloat(style.rowGap), boxes };
      });
      assert.equal(pulseFit.columnGap, '16px', `column gap stays 16px at ${width}px`);
      assert.ok(pulseFit.rowGap <= 12, `row gap stays within 12px at ${width}px`);
      for (const box of pulseFit.boxes) {
        assert.ok(box.w >= 44 && box.h >= 44, `pulse hit box is ${box.w}x${box.h} at ${width}px`);
        assert.ok(Math.abs(box.w - pulseFit.boxes[0].w) < 1, `pulse columns stay equal width at ${width}px`);
      }
      const rowXs = [...new Set(pulseFit.boxes.map(box => Math.round(box.x)))];
      assert.ok(rowXs.length <= 2, `pulse rows stay aligned in consistent columns at ${width}px (${rowXs.join(', ')})`);
      for (let i = 0; i < pulseFit.boxes.length; i++) {
        for (let j = i + 1; j < pulseFit.boxes.length; j++) {
          const a = pulseFit.boxes[i];
          const b = pulseFit.boxes[j];
          const overlap = a.x < b.right - 0.5 && b.x < a.right - 0.5 && a.y < b.bottom - 0.5 && b.y < a.bottom - 0.5;
          assert.equal(overlap, false, `pulse hit boxes overlap at ${width}px`);
        }
      }
      if (process.env.SCREENSHOTS && width === 390) await page.screenshot({ path: '/tmp/nfs-controls-expanded-390.png' });
      await page.locator('#coverage-pulse [data-topic="vulnerabilities"]').click();
      await expect(page.locator('#feed > .story')).toHaveCount(2);
      await expect(page.locator('#coverage-pulse-strip')).toBeVisible();
      await expect(page.locator('#section-title')).toHaveText('Vulnerabilities');
      assert.ok(await page.locator('#section-title').evaluate(el => parseFloat(getComputedStyle(el).fontSize) <= 18));
      assert.ok(await page.locator('#description').evaluate(el => getComputedStyle(el).position === 'absolute' && el.getBoundingClientRect().height <= 1));
      await expect(page.locator('#coverage-pulse [data-topic="vulnerabilities"]')).toHaveAttribute('aria-pressed', 'true');
      await page.locator('#pulse-all-coverage').click();
      await expect(page.locator('#feed > .story')).toHaveCount(40);
      await expect(page.locator('#pulse-all-coverage')).toHaveAttribute('aria-pressed', 'true');
    }
    if (process.env.SCREENSHOTS) await page.screenshot({ path: '/tmp/nfs-controls-collapsed-390.png' });
    assert.deepEqual(await page.locator('#feed > .story').evaluateAll(nodes => nodes.map(node => node.dataset.articleId)), desktopOrder);
    const positions = await page.locator('#feed > .story').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().top));
    assert.ok(positions.every((top, i) => i === 0 || top > positions[i - 1]), 'mobile visual order follows the ranked DOM');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(page.locator('#coverage-pulse-strip')).toBeVisible();
    await expect(page.locator('#briefing-view')).toBeVisible();
    await expect(page.locator('#feed > .story')).toHaveCount(40);
    await expect(page.locator('#feed .story-row .story-media img')).toHaveCount(2);
    assert.deepEqual((await page.locator('#feed .story-row .story-media img').evaluateAll(nodes => nodes.map(img => img.getAttribute('src')))).sort(), ['/assets/mmc-logo.webp', 'https://example.com/advisory.jpg']);
    const primaryWidth = await page.locator('#feed .lead-story .story-media').evaluate(el => el.getBoundingClientRect().width);
    const rowWidth = await page.locator('#feed .story-row .story-media').first().evaluate(el => el.getBoundingClientRect().width);
    assert.ok(primaryWidth > rowWidth * 2, 'the first story image stays easy to spot');
    await expect(page.locator('#search, .news-search, #clear')).toHaveCount(0);
    await page.locator('#load-more').click();
    await expect(page.locator('#feed > .story')).toHaveCount(80);
    await page.locator('#load-more').click();
    await expect(page.locator('#feed > .story')).toHaveCount(105);
    assert.deepEqual(await page.locator('#feed > .story').evaluateAll(nodes => nodes.map(node => node.dataset.articleId)), articles.map(a => a.id));
    await expect(page.locator('#load-more')).toBeHidden();
    await page.locator('#coverage-pulse [data-topic="cloud"]').click();
    await page.locator('#pulse-all-coverage').click();
    await expect(page.locator('#feed > .story')).toHaveCount(40);
    snapshot = { ...snapshot, articles: articles.map((article, i) => i === 0 ? { ...article, title: 'Updated lead headline' } : article), checkedAt: new Date(now + 1000).toISOString() };
    await page.locator('#load-more').click();
    await expect(page.locator('#feed > .story')).toHaveCount(40);
    await expect(page.locator('#load-more')).toBeEnabled();
    await expect(page.locator('#feed .story h2').first()).toHaveText('Updated lead headline');
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
    await expect(page.locator('#feed .story-media img')).toHaveAttribute('src', '/assets/mmc-logo.webp');
    await expect(page.locator('#feed .story-media img')).toHaveCSS('object-fit', 'contain');
    await page.locator('#coverage-pulse [data-topic="vulnerabilities"]').click();
    await expect(page.locator('#feed > .story')).toHaveCount(2);

    await page.goto(base + '/newsroom?topic=ai');
    await expect(page.locator('#section-title')).toHaveText('AI security');
    await expect(page.locator('#coverage-pulse [data-topic="ai"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#feed > .story')).toHaveCount(1);
    await page.goto(base + '/newsroom?topic=identity');
    await expect(page.locator('#section-title')).toHaveText('Identity security');
    await expect(page.locator('#briefing-view')).toBeVisible();
    await expect(page.locator('#front-page, #front-page-link')).toHaveCount(0);
    assert.equal(new URL(page.url()).searchParams.get('topic'), 'identity');
    await expect.poll(() => new URL(page.url()).searchParams.get('topic')).toBe('identity');
    await page.goto(base + '/newsroom?topic=microsoft&microsoft=message-center&search=admin');
    await expect(page.locator('#section-title')).toHaveText('Microsoft');
    await expect(page.locator('[data-microsoft-filter="message-center"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#search')).toHaveCount(0);
    assert.equal(await page.locator('[data-microsoft-filter="all"]').evaluate(el => getComputedStyle(el).borderTopWidth), '1px');
    await expect.poll(() => new URL(page.url()).searchParams.get('search')).toBe(null);
    await page.locator('#pulse-all-coverage').click();
    await expect(page.locator('#section-title')).toHaveText('Latest coverage');
    await expect(page.locator('#feed > .story')).toHaveCount(40);
    assert.equal(new URL(page.url()).search, '');
    await page.goto(base + '/newsroom?front=1#front');
    await expect(page.locator('#pulse-all-coverage')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#section-title')).toHaveText('Latest coverage');
    await expect(page.locator('#feed > .story')).toHaveCount(40);
    await expect(page.getByRole('button', { name: 'Front page' })).toHaveCount(0);
    assert.equal(new URL(page.url()).search, '');

    // Each category highlights a distinct sequential meridian line on the newsroom globe.
    const globePage = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await globePage.goto(base + '/newsroom');
    await expect(globePage.locator('#coverage-pulse [data-topic="cloud"]')).toBeVisible();
    const readGlobeState = () => globePage.evaluate(() => {
      const canvas = document.querySelector('.newsroom-globe');
      return {
        topic: canvas.dataset.globeTopic || '',
        meridian: canvas.dataset.globeMeridian ?? '',
        accent: canvas.style.getPropertyValue('--globe-accent').trim().toLowerCase(),
        dataUrl: canvas.toDataURL(),
      };
    });
    const neutralGlobe = await readGlobeState();
    assert.equal(neutralGlobe.topic, '');
    assert.equal(neutralGlobe.meridian, '');
    assert.equal(neutralGlobe.accent, '');
    const seenDataUrls = new Set([neutralGlobe.dataUrl]);
    const topicOrder = ['cloud', 'identity', 'ai', 'vulnerabilities', 'incidents', 'malware', 'operations', 'microsoft'];
    for (let i = 0; i < topicOrder.length; i++) {
      const id = topicOrder[i];
      await globePage.locator(`#coverage-pulse [data-topic="${id}"]`).click();
      await expect(globePage.locator('.newsroom-globe')).toHaveAttribute('data-globe-topic', id);
      const current = await readGlobeState();
      assert.equal(current.meridian, String(i), `${id} maps to meridian ${i}`);
      assert.equal(current.accent, expectedPulseColors[id], `${id} uses its topic highlight color`);
      assert.ok(!seenDataUrls.has(current.dataUrl), `${id} renders a distinct highlighted globe line`);
      seenDataUrls.add(current.dataUrl);
    }
    await globePage.locator('#pulse-all-coverage').click();
    await expect(globePage.locator('.newsroom-globe')).not.toHaveAttribute('data-globe-topic', /.+/);
    assert.equal((await readGlobeState()).dataUrl, neutralGlobe.dataUrl, 'All coverage resets the globe to neutral');
    await globePage.close();

    const watchPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await watchPage.goto(base + '/newsroom');
    await expect(watchPage.getByRole('button', { name: 'Open coverage dashboard' })).toBeVisible();
    assert.equal(await watchPage.locator('#watch').getAttribute('hidden'), '');
    await watchPage.getByRole('button', { name: 'Open coverage dashboard' }).click();
    await expect(watchPage.locator('#watch')).toBeVisible();
    assert.equal(new URL(watchPage.url()).hash, '#watch');
    assert.equal(await watchPage.locator('body').evaluate(el => el.classList.contains('coverage-watch-open')), true);
    assert.equal(await watchPage.locator('.topbar').evaluate(el => getComputedStyle(el).display), 'none');
    assert.equal(await watchPage.locator('.site-footer').evaluate(el => getComputedStyle(el).display), 'none');
    assert.ok(await watchPage.locator('#coverage-watch-close').evaluate(el => el === document.activeElement), 'focus moves into the overlay');
    await expect(watchPage.locator('#coverage-watch-lead')).toContainText('Most coverage in');
    await expect(watchPage.locator('#watch [data-topic]')).toHaveCount(8);
    await expect(watchPage.locator('#watch button[data-topic], #watch [data-topic][aria-pressed]')).toHaveCount(0);
    await expect(watchPage.locator('#coverage-watch-volume')).toContainText('stories in the last 24 hours');
    await expect(watchPage.locator('#coverage-watch-sources')).toContainText('in trouble');
    await expect(watchPage.locator('#coverage-watch-headlines a')).toHaveCount(1);
    assert.equal(await watchPage.locator('#coverage-watch-headlines a').getAttribute('target'), '_blank');
    const globeSize = await watchPage.locator('#watch .newsroom-globe').evaluate(el => el.getBoundingClientRect().width);
    assert.ok(globeSize >= 280 && globeSize <= 640, `watch globe is ${globeSize}px`);
    await expect.poll(() => watchPage.locator('#watch .newsroom-globe').getAttribute('data-globe-watch-pulse')).toBe('1');
    const topicHits = await watchPage.locator('#watch .newsroom-globe').evaluate(canvas => {
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      const targets = [[59, 130, 246], [168, 85, 247], [6, 182, 212], [239, 68, 68], [249, 115, 22], [236, 72, 153], [16, 185, 129], [99, 102, 241]];
      let hits = 0;
      for (let i = 0; i < data.length; i += 16) {
        if (data[i + 3] < 50) continue;
        for (const [r, g, b] of targets) {
          if (Math.abs(data[i] - r) < 42 && Math.abs(data[i + 1] - g) < 42 && Math.abs(data[i + 2] - b) < 42) {
            hits += 1;
            break;
          }
        }
      }
      return hits;
    });
    assert.ok(topicHits > 20, `watch globe paints topic colors (${topicHits} hits)`);
    await watchPage.locator('#watch [data-topic="cloud"]').click();
    await expect(watchPage.locator('#pulse-all-coverage')).toHaveAttribute('aria-pressed', 'true');
    await expect(watchPage.locator('#coverage-pulse [data-topic="cloud"]')).toHaveAttribute('aria-pressed', 'false');
    assert.equal(new URL(watchPage.url()).search, '');
    await watchPage.keyboard.press('Control+k');
    await expect(watchPage.locator('.command-palette')).toBeHidden();
    await watchPage.keyboard.press('Escape');
    await expect(watchPage.locator('#watch')).toBeHidden();
    await expect(watchPage.locator('.newsroom-globe')).not.toHaveAttribute('data-globe-watch-pulse', '1');
    assert.equal(new URL(watchPage.url()).hash, '');
    assert.ok(await watchPage.locator('.newsroom-globe-control').evaluate(el => el === document.activeElement), 'focus returns to the globe');
    assert.equal(await watchPage.locator('.topbar').evaluate(el => getComputedStyle(el).display), 'flex');
    await watchPage.locator('.newsroom-globe-control').focus();
    await watchPage.keyboard.press('Enter');
    await expect(watchPage.locator('#watch')).toBeVisible();
    await watchPage.getByRole('button', { name: 'Close coverage dashboard' }).click();
    await expect(watchPage.locator('#watch')).toBeHidden();
    await watchPage.keyboard.press('Space');
    await expect(watchPage.locator('#watch')).toBeVisible();
    await watchPage.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(watchPage.locator('#watch')).toBeHidden();
    await watchPage.goto(base + '/newsroom#watch');
    await expect(watchPage.locator('#watch')).toBeVisible();
    assert.equal(await watchPage.locator('.topbar').evaluate(el => getComputedStyle(el).display), 'none');
    await watchPage.setViewportSize({ width: 390, height: 900 });
    assert.ok(await watchPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'watch view fits at 390px');
    const stack = await watchPage.evaluate(() => {
      const globe = document.querySelector('#watch .newsroom-globe').getBoundingClientRect();
      const lead = document.querySelector('#coverage-watch-lead').getBoundingClientRect();
      const topics = document.querySelector('#coverage-watch-topics').getBoundingClientRect();
      return { globeBottom: globe.bottom, leadTop: lead.top, topicsTop: topics.top, globeWidth: globe.width };
    });
    assert.ok(stack.leadTop >= stack.globeBottom - 1, 'narrow watch stacks the lead under the globe');
    assert.ok(stack.topicsTop >= stack.leadTop - 1, 'narrow watch stacks topics under the lead');
    assert.ok(stack.globeWidth < 390, 'narrow watch globe stays on screen');
    await watchPage.close();

    const stillWatch = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await stillWatch.goto(base + '/newsroom#watch');
    await expect(stillWatch.locator('#watch .newsroom-globe')).toBeVisible();
    await expect(stillWatch.locator('#watch .newsroom-globe')).not.toHaveAttribute('data-globe-watch-pulse', '1');
    const stillFrame = await stillWatch.locator('#watch .newsroom-globe').evaluate(canvas => canvas.toDataURL());
    await stillWatch.waitForTimeout(280);
    assert.equal(await stillWatch.locator('#watch .newsroom-globe').evaluate(canvas => canvas.toDataURL()), stillFrame, 'reduced motion keeps a still watch globe');
    await stillWatch.close();

    const emptyWatch = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const previousSnapshot = snapshot;
    snapshot = { ...snapshot, articles: [], frontPageIds: [], sources: [{ name: 'Offline Wire', status: 'error', error: 'HTTP 503' }] };
    await emptyWatch.goto(base + '/newsroom#watch');
    await expect(emptyWatch.locator('#coverage-watch-headlines')).toContainText('News sources are not responding.');
    await expect(emptyWatch.locator('#coverage-watch-headlines a')).toHaveCount(0);
    snapshot = previousSnapshot;
    await emptyWatch.close();

    // Coverage counts read as filters: hover underline, selection, dimming, toggle, and hit area.
    const pulsePage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await pulsePage.goto(base + '/newsroom');
    const operations = pulsePage.locator('#coverage-pulse [data-topic="operations"]');
    const cloudChip = pulsePage.locator('#coverage-pulse [data-topic="cloud"]');
    await expect(operations).toBeVisible();
    await expect(pulsePage.getByRole('group', { name: 'Topic filters' })).toBeVisible();
    const chipCount = async id => (await pulsePage.locator(`#coverage-pulse [data-topic="${id}"] .coverage-pulse-chip-count`).innerText()).trim();
    const identityCount = await chipCount('identity');
    const operationsCount = await chipCount('operations');
    await expect(pulsePage.locator('#coverage-pulse [data-topic="identity"]')).toHaveAttribute('aria-label', `Filter briefing to Identity, ${identityCount} articles`);
    await expect(operations).toHaveAttribute('aria-label', `Filter briefing to Operations, ${operationsCount} articles`);
    const underlineRule = await pulsePage.evaluate(() => {
      let hover = false;
      let outside = false;
      const visit = (rules, inHover) => {
        for (const rule of rules) {
          if (rule instanceof CSSMediaRule) visit([...rule.cssRules], inHover || /\(hover:\s*hover\)/.test(rule.conditionText));
          else if (String(rule.selectorText || '').includes('coverage-pulse-chip-count::after') && String(rule.style?.transform || '') === 'scaleX(0)') {
            if (inHover && /180ms/.test(rule.style.transition || '')) hover = true;
            if (!inHover) outside = true;
          }
        }
      };
      for (const sheet of document.styleSheets) {
        try { visit([...sheet.cssRules], false); } catch { /* cross-origin sheet */ }
      }
      return { hover, outside };
    });
    assert.equal(underlineRule.hover, true, 'the number underline grows only inside hover media');
    assert.equal(underlineRule.outside, false, 'the hover underline is not declared outside hover media');
    const hitLayer = await cloudChip.evaluate(el => {
      const before = getComputedStyle(el, '::before');
      const rect = el.getBoundingClientRect();
      return { content: before.content, position: before.position, top: before.top, width: rect.width, height: rect.height };
    });
    assert.equal(hitLayer.content, '""');
    assert.equal(hitLayer.position, 'absolute');
    assert.equal(hitLayer.top, '0px');
    assert.ok(hitLayer.width >= 44 && hitLayer.height >= 44, `desktop hit box is ${hitLayer.width}x${hitLayer.height}`);
    assert.equal(await cloudChip.evaluate(el => getComputedStyle(el).cursor), 'pointer');
    const resting = await cloudChip.locator('.coverage-pulse-chip-count').evaluate(el => ({
      transform: getComputedStyle(el, '::after').transform,
      label: getComputedStyle(el.parentElement.querySelector('.coverage-pulse-chip-label')).color,
      count: getComputedStyle(el).color,
    }));
    assert.ok(resting.transform.startsWith('matrix(0,'), `resting underline is hidden (${resting.transform})`);
    await cloudChip.hover();
    await expect.poll(() => cloudChip.locator('.coverage-pulse-chip-count').evaluate(el => getComputedStyle(el, '::after').transform)).toMatch(/^matrix\(1,/);
    const hovered = await cloudChip.locator('.coverage-pulse-chip-count').evaluate(el => {
      const after = getComputedStyle(el, '::after');
      return {
        height: after.height,
        opacity: after.opacity,
        label: getComputedStyle(el.parentElement.querySelector('.coverage-pulse-chip-label')).color,
        count: getComputedStyle(el).color,
      };
    });
    assert.equal(hovered.height, '2px');
    assert.equal(hovered.opacity, '0.6');
    assert.equal(hovered.label, resting.label, 'hover leaves the label color alone');
    assert.equal(hovered.count, resting.count, 'hover leaves the number color alone');
    await pulsePage.mouse.down();
    await expect.poll(() => cloudChip.locator('.coverage-pulse-chip-count').evaluate(el => getComputedStyle(el).opacity)).toBe('0.7');
    await pulsePage.mouse.move(0, 0);
    await pulsePage.mouse.up();
    await cloudChip.evaluate(button => button.blur());
    const still = await pulsePage.locator('.newsroom-globe').evaluate(canvas => canvas.toDataURL());
    await pulsePage.waitForTimeout(280);
    assert.notEqual(await pulsePage.locator('.newsroom-globe').evaluate(canvas => canvas.toDataURL()), still, 'the globe is turning, so a hover preview can fade');
    await pulsePage.mouse.move(0, 0);
    await expect(pulsePage.locator('.newsroom-globe')).not.toHaveAttribute('data-globe-preview', /.+/);
    await expect.poll(() => pulsePage.locator('.newsroom-globe').getAttribute('data-globe-accent-alpha')).toBe('0.00');
    const fadeStart = await pulsePage.evaluate(() => {
      document.querySelector('#coverage-pulse [data-topic="cloud"]').dispatchEvent(new PointerEvent('pointerenter', { bubbles: true, pointerType: 'mouse' }));
      const canvas = document.querySelector('.newsroom-globe');
      return { alpha: canvas.dataset.globeAccentAlpha, preview: canvas.dataset.globePreview || '', meridian: canvas.dataset.globePreviewMeridian || '', topic: canvas.dataset.globeTopic || '' };
    });
    assert.equal(fadeStart.preview, 'cloud');
    assert.equal(fadeStart.meridian, '0');
    assert.equal(fadeStart.topic, '');
    assert.ok(Number(fadeStart.alpha) < 0.5, `preview starts fading (${fadeStart.alpha})`);
    await expect.poll(() => pulsePage.locator('.newsroom-globe').getAttribute('data-globe-accent-alpha')).toBe('0.50');
    await pulsePage.evaluate(() => document.querySelector('#coverage-pulse [data-topic="cloud"]').dispatchEvent(new PointerEvent('pointerleave', { bubbles: true, pointerType: 'mouse' })));
    await expect(pulsePage.locator('.newsroom-globe')).not.toHaveAttribute('data-globe-preview', /.+/);
    await expect.poll(() => pulsePage.locator('.newsroom-globe').getAttribute('data-globe-accent-alpha')).toBe('0.00');
    await pulsePage.locator('#coverage-pulse [data-topic="identity"]').focus();
    await expect(pulsePage.locator('.newsroom-globe')).toHaveAttribute('data-globe-preview', 'identity');
    await pulsePage.locator('#pulse-all-coverage').focus();
    await expect(pulsePage.locator('.newsroom-globe')).not.toHaveAttribute('data-globe-preview', /.+/);
    const outline = await cloudChip.evaluate(el => {
      el.focus({ focusVisible: true });
      const style = getComputedStyle(el);
      return { width: style.outlineWidth, offset: style.outlineOffset, color: style.outlineColor };
    });
    assert.equal(outline.width, '2px');
    assert.equal(outline.offset, '4px');
    assert.equal(outline.color, 'rgb(247, 255, 0)');
    await pulsePage.evaluate(() => document.activeElement?.blur());
    const touched = await pulsePage.evaluate(() => {
      document.querySelector('#coverage-pulse [data-topic="malware"]').dispatchEvent(new PointerEvent('pointerenter', { bubbles: true, pointerType: 'touch' }));
      return document.querySelector('.newsroom-globe').dataset.globePreview || '';
    });
    assert.equal(touched, '', 'touch does not preview a meridian');
    await operations.click();
    await expect(operations).toHaveAttribute('aria-pressed', 'true');
    await expect(operations).toHaveAttribute('aria-label', `Operations filter on, ${operationsCount} articles. Activate to clear.`);
    await expect(pulsePage.locator('#section-title')).toHaveText('Security operations');
    await expect(pulsePage.locator('#briefing-status')).toHaveText(`Showing Operations, ${operationsCount} articles.`);
    await expect(pulsePage.locator('.newsroom-globe')).toHaveAttribute('data-globe-topic', 'operations');
    await expect(pulsePage.locator('.newsroom-globe')).toHaveAttribute('data-globe-meridian', '6');
    const selected = await operations.locator('.coverage-pulse-chip-count').evaluate(el => {
      const after = getComputedStyle(el, '::after');
      const label = getComputedStyle(el.parentElement.querySelector('.coverage-pulse-chip-label'));
      return {
        height: after.height, opacity: after.opacity, width: parseFloat(after.width), host: el.getBoundingClientRect().width,
        duration: after.transitionDuration, count: getComputedStyle(el).color, weight: Number(label.fontWeight), decoration: label.textDecorationLine,
      };
    });
    assert.equal(selected.height, '3px');
    assert.equal(selected.opacity, '1');
    assert.ok(Math.abs(selected.width - selected.host) < 1, 'selected underline matches the number width');
    assert.equal(selected.duration, '0s');
    assert.equal(selected.count, 'rgb(245, 245, 245)');
    assert.equal(selected.weight, 600);
    assert.equal(selected.decoration, 'none');
    await expect.poll(() => cloudChip.evaluate(el => getComputedStyle(el.querySelector('.coverage-pulse-chip-count')).color)).toBe('rgb(161, 161, 170)');
    await expect.poll(() => cloudChip.evaluate(el => getComputedStyle(el.querySelector('.coverage-pulse-chip-label')).opacity)).toBe('0.7');
    await operations.hover();
    assert.equal(await operations.locator('.coverage-pulse-chip-count').evaluate(el => getComputedStyle(el, '::after').height), '3px');
    await operations.click();
    await expect(operations).toHaveAttribute('aria-pressed', 'false');
    await expect(operations).toHaveAttribute('aria-label', `Filter briefing to Operations, ${operationsCount} articles`);
    // Clearing a topic returns to All coverage. A blank query is that view.
    assert.equal(new URL(pulsePage.url()).search, '');
    assert.equal(new URL(pulsePage.url()).search.includes('topic=operations'), false);
    await expect(pulsePage.locator('#briefing-view')).toBeVisible();
    await expect(pulsePage.locator('#front-page, #front-page-link')).toHaveCount(0);
    await expect(pulsePage.locator('#section-title')).toHaveText('Latest coverage');
    await expect(pulsePage.locator('#briefing-status')).toHaveText('Showing all coverage.');
    await expect(pulsePage.locator('#pulse-all-coverage')).toHaveAttribute('aria-pressed', 'true');
    await expect(pulsePage.locator('.newsroom-globe')).not.toHaveAttribute('data-globe-topic', /.+/);
    await expect(pulsePage.locator('.newsroom-globe')).not.toHaveAttribute('data-globe-meridian', /.+/);
    await expect.poll(() => cloudChip.locator('.coverage-pulse-chip-count').evaluate(el => getComputedStyle(el).color)).toBe('rgb(245, 245, 245)');
    await expect(pulsePage.locator('#feed > .story')).toHaveCount(40);
    await pulsePage.close();

    const quietPage = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await quietPage.goto(base + '/newsroom');
    await expect(quietPage.locator('#coverage-pulse [data-topic="cloud"]')).toBeVisible();
    const quietMotion = await quietPage.locator('#coverage-pulse [data-topic="cloud"]').evaluate(el => {
      const count = el.querySelector('.coverage-pulse-chip-count');
      const label = el.querySelector('.coverage-pulse-chip-label');
      return {
        underline: getComputedStyle(count, '::after').transitionDuration,
        count: getComputedStyle(count).transition,
        label: getComputedStyle(label).transitionDuration,
      };
    });
    assert.equal(quietMotion.underline, '0s');
    assert.match(quietMotion.count, /opacity/);
    assert.doesNotMatch(quietMotion.count, /color/);
    assert.equal(quietMotion.label, '0s');
    await quietPage.locator('#coverage-pulse [data-topic="cloud"]').hover();
    assert.ok((await quietPage.locator('#coverage-pulse [data-topic="cloud"] .coverage-pulse-chip-count').evaluate(el => getComputedStyle(el, '::after').transform)).startsWith('matrix(1,'));
    await quietPage.mouse.down();
    await expect.poll(() => quietPage.locator('#coverage-pulse [data-topic="cloud"] .coverage-pulse-chip-count').evaluate(el => getComputedStyle(el).opacity)).toBe('0.7');
    await quietPage.mouse.move(0, 0);
    await quietPage.mouse.up();
    await quietPage.locator('#coverage-pulse [data-topic="cloud"]').evaluate(button => button.blur());
    const quietPreview = await quietPage.evaluate(() => {
      const neutral = document.querySelector('.newsroom-globe').toDataURL();
      document.querySelector('#coverage-pulse [data-topic="incidents"]').dispatchEvent(new PointerEvent('pointerenter', { bubbles: true, pointerType: 'mouse' }));
      const canvas = document.querySelector('.newsroom-globe');
      return { alpha: canvas.dataset.globeAccentAlpha, preview: canvas.dataset.globePreview || '', url: canvas.toDataURL(), neutral };
    });
    assert.equal(quietPreview.alpha, '0.50');
    assert.equal(quietPreview.preview, 'incidents');
    assert.notEqual(quietPreview.url, quietPreview.neutral);
    await quietPage.evaluate(() => document.querySelector('#coverage-pulse [data-topic="incidents"]').dispatchEvent(new PointerEvent('pointerleave', { bubbles: true, pointerType: 'mouse' })));
    assert.equal(await quietPage.locator('.newsroom-globe').evaluate(canvas => canvas.toDataURL()), quietPreview.neutral);
    await quietPage.locator('#coverage-pulse [data-topic="operations"]').click();
    assert.equal(await quietPage.locator('#coverage-pulse [data-topic="cloud"] .coverage-pulse-chip-count').evaluate(el => getComputedStyle(el).transitionDuration), '0.08s');
    await quietPage.close();

    const coarseContext = await browser.newContext({ ...devices['iPhone 13'] });
    const coarsePage = await coarseContext.newPage();
    await coarsePage.goto(base + '/newsroom');
    await expect(coarsePage.locator('#coverage-pulse [data-topic="cloud"]')).toBeVisible();
    const noHover = await coarsePage.evaluate(() => {
      const button = document.querySelector('#coverage-pulse [data-topic="cloud"]');
      button.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true, pointerType: 'mouse' }));
      const after = getComputedStyle(button.querySelector('.coverage-pulse-chip-count'), '::after');
      return { preview: document.querySelector('.newsroom-globe').dataset.globePreview || '', content: after.content, hover: matchMedia('(hover: hover)').matches };
    });
    assert.equal(noHover.hover, false);
    assert.equal(noHover.preview, '');
    assert.equal(noHover.content, 'none');
    await coarseContext.close();

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
    await page.locator('#command-palette-input').fill('conditional access');
    await expect(page.getByRole('option', { name: /CAP Evaluator/ })).toBeVisible();
    await page.locator('#command-palette-input').fill('');
    await expect(page.locator('.command-palette-option').nth(1)).toBeVisible();
    const paletteOption = page.locator('.command-palette-option').nth(1);
    const focusFill = await paletteOption.evaluate(el => {
      el.focus({ focusVisible: true });
      return getComputedStyle(el).backgroundColor;
    });
    const activeFill = await page.locator('.command-palette-option.is-active').evaluate(el => getComputedStyle(el).backgroundColor);
    assert.equal(focusFill, activeFill);
    assert.notEqual(focusFill, 'rgba(0, 0, 0, 0)');
    await page.keyboard.press('Escape');

    // Failures retain loaded results or show an empty state without manual retries.
    await page.locator('#coverage-pulse [data-topic="vulnerabilities"]').click();
    await expect(page.locator('#feed > .story')).toHaveCount(2);
    offline = true;
    await page.evaluate(() => window.loadNews());
    await expect(page.locator('#feed > .story')).toHaveCount(2);
    await expect(page.locator('#news-error')).toContainText('Showing the last loaded results');
    await page.locator('#coverage-pulse [data-topic="cloud"]').click();
    await expect(page.locator('#empty')).toBeVisible();
    await expect(page.locator('#empty .empty-actions')).toBeHidden();
    await expect(page.getByRole('button', { name: /refresh|retry|try again/i })).toHaveCount(0);
    await expect(page.locator('#feed > .story')).toHaveCount(0);
    offline = false;
    await page.locator('#pulse-all-coverage').click();
    await page.reload();
    await expect(page.locator('#feed > .story')).toHaveCount(40);
    await page.locator('#coverage-pulse [data-topic="cloud"]').click();
    await expect(page.locator('#feed > .story')).toHaveCount(40);
    await expect(page.locator('#news-error')).toBeHidden();
    assert.equal(new URL(page.url()).searchParams.get('topic'), 'cloud');
    snapshot = { ...snapshot, articles: [], frontPageIds: [], sources: [{ name: 'Offline Wire', status: 'error', error: 'HTTP 503' }] };
    await page.evaluate(() => window.loadNews());
    await expect(page.locator('#empty')).toBeVisible();
    await expect(page.locator('#empty')).toContainText('Offline Wire');
    await expect(page.locator('#coverage-pulse')).toBeHidden();
    await page.locator('#pulse-all-coverage').click();
    offline = true;
    await page.reload();
    await expect(page.locator('#empty')).toBeVisible();
    await expect(page.locator('#empty')).toContainText('could not be loaded');
    await expect(page.locator('#briefing-status')).not.toContainText('0 headlines');
    await expect(page.locator('#feed > .story')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Front page' })).toHaveCount(0);
    assert.deepEqual(errors, []);
    console.log('Newsroom paging, full-catalog search, mobile order, simplified controls, focus, Microsoft filters, and recovery checks passed.');
  } finally {
    release?.();
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
