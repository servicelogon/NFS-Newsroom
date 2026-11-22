// Playwright: blog, post, tools, and newsroom layout at desktop and phone widths.
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
(async () => {
  const { createAppServer } = await import('../server.js');
  const postsDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'nfs-pages-'));
  const sample = await fs.readFile('content/posts/entra-default-settings-that-you-should-change.md', 'utf8');
  await fs.writeFile(path.join(postsDirectory, 'entra-default-settings-that-you-should-change.md'), sample);
  const server = createAppServer({ // no live RSS in layout checks
    postsDirectory,
    service: {
      getNews: async () => ({
        articles: [{
          id: 'palette-headline',
          title: 'Palette cloud headline',
          url: 'https://example.com/palette-headline',
          source: 'Fixture Wire',
          publishedAt: '2026-09-01T12:00:00Z',
          summary: 'A searchable newsroom headline',
          category: 'cloud',
        }],
        sources: [],
        updatedAt: null,
      }),
    },
  });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch();
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const width of [1440, 390, 320]) { // desktop, iPhone-ish, small phone
      await page.setViewportSize({width, height:1000});
        for (const route of ['/', '/blog/entra-default-settings-that-you-should-change', '/blog/tag/conditional-access', '/tools', '/newsroom']) {
        await page.goto(base + route);
        assert.equal(await page.getByText(/built by Nathan Hess/i).count(), 0, `${route} still shows the header credit`);
        if (route === '/newsroom') {
          assert.equal(await page.getByText(/go beyond the headline/i).count(), 0, 'newsroom still shows the headline line');
          assert.ok(await page.getByRole('link', { name: 'Read the field notes' }).isVisible());
          assert.equal(await page.locator('.newsroom-globe').count(), 1);
          assert.equal(await page.getByRole('button', { name: 'Open coverage dashboard' }).count(), 1);
          assert.equal(await page.locator('#watch').count(), 1);
          assert.equal(await page.locator('#watch').getAttribute('hidden'), '');
          assert.equal(await page.locator('.desktop-nav a[href$="#watch"], .site-menu a[href$="#watch"], .footer-nav a[href$="#watch"]').count(), 0);
        }
        assert.equal(await page.locator('.topbar').getByText(/Nathan Hess/i).count(), 0, `${route} topbar credit`);
        assert.equal(await page.locator('main').count(), 1);
        assert.equal(await page.locator('.footer-logo, .footer-starfield, .footer-sky').count(), 0);
        assert.equal(await page.locator('.social-placeholder').count(), 0);
        assert.equal(await page.locator('.footer-wire').count(), 1);
        assert.equal(await page.locator('.footer-name').textContent(), 'New Frontier Security');
        assert.equal(await page.locator('.footer-nav a').count(), 3);
        assert.equal(await page.locator('.footer-nav [aria-current="page"]').count(), 1);
        assert.equal(await page.locator('footer').getByText('©').count(), 0);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} overflows at ${width}`);
        if (width > 700) { // CSS breakpoint: desktop nav vs hamburger
          assert.ok(await page.locator('.desktop-nav').isVisible());
          assert.equal(await page.locator('.desktop-nav a').count(), 3);
          assert.equal(await page.locator('.desktop-nav [aria-current="page"]').count(), 1);
          assert.equal(await page.locator('.site-menu').isVisible(), false);
        } else {
          assert.equal(await page.locator('.desktop-nav').isVisible(), false);
          await page.locator('.site-menu summary').click();
          assert.ok(await page.getByRole('navigation', {name:'Mobile navigation'}).isVisible());
          assert.equal(await page.locator('.site-menu [aria-current="page"]').count(), 1);
          assert.ok(await page.locator('.site-menu nav').evaluate(nav => {
            const box = nav.getBoundingClientRect();
            return box.left <= 1 && box.top <= 1 && box.width >= innerWidth - 1 && box.height >= innerHeight - 1;
          }), `menu covers the viewport at ${width}`);
          await page.keyboard.press('Escape');
          assert.equal(await page.locator('.site-menu').getAttribute('open'), null);
          assert.ok(await page.locator('.site-menu summary').evaluate(el => document.activeElement === el));
          assert.equal((await page.locator('.site-menu summary').textContent()).trim(), '');
        }
        assert.equal(await page.locator('.theme-toggle').count(), 0, `${route} still has a theme toggle`);
        assert.equal(await page.getByRole('button', { name: /light mode|dark mode/i }).count(), 0);
        await page.evaluate(() => localStorage.setItem('nfs-theme', 'light'));
        await page.reload();
        assert.notEqual(await page.locator('html').getAttribute('data-theme'), 'light', `${route} still turns light`);
        assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(21, 21, 21)');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} overflows at ${width}`);
        if (route === '/') {
          assert.equal(await page.locator('.figure-row, [data-figure]').count(), 0, `no field-note figures at ${width}`);
          assert.equal(await page.locator('.featured-post, .tool-card').count(), 0);
          const logo = await page.locator('.brand-logo').evaluate(img => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0);
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let opaqueWhite = 0;
            let opaqueDark = 0;
            for (let i = 0; i < data.length; i += 16) {
              const alpha = data[i + 3];
              if (alpha < 16) continue;
              if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) opaqueWhite += 1;
              if (data[i] < 40 && data[i + 1] < 40 && data[i + 2] < 40 && alpha > 200) opaqueDark += 1;
            }
            const box = img.getBoundingClientRect();
            return {
              corner: data[3],
              opaqueWhite,
              opaqueDark,
              naturalWidth: img.naturalWidth,
              displayWidth: box.width,
              displayHeight: box.height,
            };
          });
          assert.equal(logo.corner, 0, 'logo corner stays transparent');
          assert.equal(logo.opaqueDark, 0, 'logo has no black field');
          assert.ok(logo.opaqueWhite > 50, 'logo mark is white');
          assert.ok(logo.naturalWidth >= logo.displayWidth * 2, `logo is crisp at ${width}px (${logo.naturalWidth} vs ${logo.displayWidth})`);
          assert.ok(logo.displayHeight <= 60, `logo stays header-sized at ${width}px (${logo.displayHeight})`);
          assert.ok(logo.displayWidth <= 400, `logo stays within the brand cap at ${width}px (${logo.displayWidth})`);
        }
        if (process.env.SCREENSHOTS && width === 390 && route === '/') {
          await page.screenshot({path:'/private/tmp/nfs-blog-light-390.png',fullPage:true});
        }
        if (route === '/') {
          assert.ok(await page.locator('.note-row').first().isVisible(), `note row at ${width}`);
          assert.equal(await page.locator('.featured-post').count(), 0);
        }
        if (route === '/blog/entra-default-settings-that-you-should-change' && width === 1440) {
          const lefts = await page.evaluate(() => {
            const paragraph = document.querySelector('.prose > p');
            const table = document.querySelector('.prose table');
            return { paragraph: paragraph.getBoundingClientRect().left, table: table.getBoundingClientRect().left };
          });
          assert.ok(Math.abs(lefts.paragraph - lefts.table) < 2, `table left ${lefts.table} vs paragraph ${lefts.paragraph}`);
        }
        if (process.env.SCREENSHOTS && width !== 320 && route !== '/newsroom') {
          await page.locator('.feature-image img, .post-hero img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
          const name = route === '/' ? 'blog' : route === '/tools' ? 'tools' : 'post';
          await page.screenshot({path:`/private/tmp/nfs-${name}-${width}.png`,fullPage:true});
        }
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(base + '/newsroom');
    await page.getByRole('button', { name: 'Open coverage dashboard' }).click();
    assert.ok(await page.locator('#watch').isVisible());
    assert.equal(await page.locator('.topbar').evaluate(el => getComputedStyle(el).display), 'none');
    assert.equal(await page.locator('.site-footer').evaluate(el => getComputedStyle(el).display), 'none');
    await page.keyboard.press('Control+k');
    assert.equal(await page.locator('.command-palette').isVisible(), false);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#watch').isVisible(), false);
    assert.ok(await page.locator('.topbar').isVisible());
    await page.goto(base + '/newsroom#watch');
    assert.ok(await page.locator('#watch').isVisible());
    assert.equal(await page.locator('.topbar').evaluate(el => getComputedStyle(el).display), 'none');
    await page.setViewportSize({ width: 390, height: 1000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'watch overlay fits at 390');
    assert.equal(await page.locator('.topbar').evaluate(el => getComputedStyle(el).display), 'none');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    assert.equal(await page.locator('#watch').isVisible(), false);
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const route of ['/', '/blog/entra-default-settings-that-you-should-change', '/blog/tag/conditional-access', '/tools', '/newsroom']) {
      await page.setViewportSize({width:1440, height:1000});
      await page.goto(base + route);
      await page.keyboard.press('Control+k');
      assert.ok(await page.locator('.command-palette').isVisible(), `${route} opens the search palette`);
      assert.ok(await page.locator('#command-palette-input').evaluate(el => document.activeElement === el));
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.command-palette').isVisible(), false);
    }
    await page.goto(base);
    await page.keyboard.press('Control+k');
    await page.locator('#command-palette-input').fill('passkey');
    assert.ok(await page.locator('.command-palette-group', { hasText: 'Tools' }).isVisible());
    assert.ok(await page.getByRole('option', { name: /Passkey AAGUID Lookup/ }).isVisible());
    await page.locator('#command-palette-input').fill('cap evaluator');
    assert.ok(await page.getByRole('option', { name: /CAP Evaluator/ }).isVisible());
    await page.locator('#command-palette-input').fill('entra token');
    assert.ok(await page.getByRole('option', { name: /Entra Token Lab/ }).isVisible());
    await page.locator('#command-palette-input').fill('palette cloud');
    await page.waitForFunction(() => [...document.querySelectorAll('.command-palette-group')].some(el => el.textContent === 'Newsroom'));
    assert.ok(await page.getByRole('option', { name: /Palette cloud headline/ }).isVisible());
    await page.locator('#command-palette-input').fill('Entra Default Settings');
    assert.ok(await page.locator('.command-palette-group', { hasText: 'Posts' }).isVisible());
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/blog\/entra-default-settings-that-you-should-change$/);
    await page.setViewportSize({width:320, height:1000});
    await page.goto(base);
    await page.evaluate(() => localStorage.setItem('nfs-theme', 'light'));
    await page.goto(base + '/tools');
    assert.notEqual(await page.locator('html').getAttribute('data-theme'), 'light');
    assert.equal(await page.locator('.theme-toggle').count(), 0);
    await page.goto(base);
    assert.equal(await page.locator('.note-row .post-tags .tag').count(), 5);
    await page.locator('.note-row .post-tags .tag', { hasText: 'Identity' }).click();
    assert.ok(page.url().endsWith('/blog/tag/identity'));
    assert.ok(await page.getByRole('heading', { name: 'Identity', exact: true }).isVisible());
    assert.equal(await page.locator('.post-tile').count(), 1);
    await page.goto(base);
    assert.equal(await page.locator('.note-row .tag').count(), 5);
    assert.equal(await page.locator('[data-figure], .figure-row').count(), 0);
    assert.equal(await page.getByText('Stories in the last 24 hours').count(), 0);
    assert.equal(await page.getByRole('link', {name:'Read the story'}).count(), 0);
    assert.equal(await page.locator('.site-footer .social-placeholder').count(), 0);
    assert.ok(await page.getByRole('heading', {name:'Blog', exact:true}).isVisible());
    assert.ok(await page.getByText('Field notes and news from the new frontier of AI, Identity, and Cloud Security').isVisible());
    assert.equal(await page.getByText('Identity, cloud, and the questions worth exploring.').count(), 0);
    assert.equal(await page.locator('.blog-wordmark, .newsroom-logo, .toolbox-wordmark').count(), 0);
    assert.ok(await page.locator('.note-row.is-lead .note-media img').evaluate(img => img.complete && img.naturalWidth > 0));
    await page.locator('#featured-title a').click();
    assert.ok(page.url().endsWith('/blog/entra-default-settings-that-you-should-change'));
    assert.equal(await page.locator('.post-heading .post-tags .tag').count(), 5);
    assert.doesNotMatch(await page.locator('.post-heading h1').evaluate(el => getComputedStyle(el).fontFamily), /Georgia|Times New Roman/i);
    assert.doesNotMatch(await page.locator('.prose h2').first().evaluate(el => getComputedStyle(el).fontFamily), /Georgia|Times New Roman/i);
    assert.match(await page.locator('.post-hero img').getAttribute('src'), /^\/assets\/blog\/entra-default-settings\.jpg\?v=[a-f0-9]{12}$/);
    assert.equal(await page.locator('.post-hero img').getAttribute('loading'), 'eager');
    assert.ok(await page.locator('.post-hero img').evaluate(img => img.complete && img.naturalWidth > 0));
    assert.equal(await page.locator('.prose img').count(), 3);
    assert.deepEqual(await page.locator('.prose img').evaluateAll(images => images.map(img => [img.getAttribute('loading'), img.getAttribute('decoding')])), [['lazy', 'async'], ['lazy', 'async'], ['lazy', 'async']]);
    const headingAnchor = page.locator('.prose h2 .heading-anchor').first();
    assert.equal(await headingAnchor.evaluate(el => getComputedStyle(el).opacity), '0');
    await page.locator('.prose h2').first().hover();
    assert.equal(await headingAnchor.evaluate(el => getComputedStyle(el).opacity), '1');
    assert.equal(await page.locator('.prose table').count(), 1);
    assert.ok(await page.getByRole('heading', {name:/Security Defaults vs\. Conditional Access/}).isVisible());
    await page.getByRole('link', {name:'All field notes'}).click();
    await page.locator('.site-menu summary').click();
    await page.getByRole('navigation', {name:'Mobile navigation'}).getByRole('link', {name:'Toolbox'}).click();
    assert.ok(page.url().endsWith('/tools'));
    assert.ok(await page.getByRole('heading', { name: /^Toolbox$/i }).isVisible());
    assert.equal(await page.locator('.toolbox-wordmark').count(), 0);
    assert.equal(await page.locator('.tools-intro .kicker').count(), 0);
    assert.equal(await page.getByText('Built to be useful. Shared to be explored.').count(), 0);
    assert.equal(await page.locator('.tool-launch').count(), 4);
    assert.ok(await page.locator('.trail-stops').isVisible());
    assert.ok(await page.locator('.lookup-code').isVisible());
    assert.ok(await page.locator('#cap-evaluator').isVisible());
    assert.ok(await page.locator('.cap-visual').isVisible());
    assert.ok(await page.locator('#entra-token-lab').isVisible());
    assert.ok(await page.locator('.token-visual').isVisible());
    assert.deepEqual(await page.locator('.tool-row').evaluateAll(rows => rows.map(row => row.id)), ['cap-evaluator', 'copilot-security-trail', 'passkey-aaguid-lookup', 'entra-token-lab']);
    assert.deepEqual(await page.locator('.tool-row h2').allTextContents(), ['CAP Evaluator', 'Copilot Security Trail', 'Passkey AAGUID Lookup', 'Entra Token Lab']);
    assert.equal(await page.locator('.tool-top, .tool-pill, .tool-card').count(), 0);
    const rowBackgrounds = await page.locator('.tool-row').evaluateAll(rows => rows.map(row => getComputedStyle(row).backgroundColor));
    assert.ok(rowBackgrounds.every(color => color === 'rgba(0, 0, 0, 0)'), 'tool rows have no tinted tile');
    const capVisualBg = await page.locator('.cap-visual').evaluate(el => getComputedStyle(el).backgroundColor);
    assert.equal(capVisualBg, 'rgba(0, 0, 0, 0)', 'CAP graphic must sit on the tile with no inset box');
    const tokenVisualBg = await page.locator('.token-visual').evaluate(el => getComputedStyle(el).backgroundColor);
    assert.equal(tokenVisualBg, 'rgba(0, 0, 0, 0)', 'token graphic must sit on the tile with no inset box');
    assert.equal(await page.locator('#entra-token-lab .tool-launch').getAttribute('href'), 'https://servicelogon.github.io/entra-auth-flow-visualizer/');
    assert.equal(await page.locator('.tool-launch').first().evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
    assert.equal(await page.locator('.tool-launch').first().evaluate(el => getComputedStyle(el).color), 'rgb(247, 255, 0)');
    for (const anchor of await page.locator('.tool-actions a').all()) {
      assert.match(await anchor.getAttribute('href'), /^https:\/\//);
      assert.match(await anchor.getAttribute('rel'), /noopener/);
      assert.equal(await anchor.getAttribute('target'), '_blank');
      assert.match(await anchor.getAttribute('aria-label'), /opens in a new tab/);
    }
    await fs.writeFile(path.join(postsDirectory, 'another-post.md'), sample.replace('Entra Default Settings That You Should Change', 'A second field note').replace('2026-09-14', '2026-09-15')); // drop-in file should appear without restarting the server
    await page.goto(base);
    assert.match(await page.locator('#featured-title').textContent(), /A second field note/);
    assert.equal(await page.locator('.post-tile').count(), 2);
    assert.equal(await page.locator('.note-row').count(), 2);
    assert.equal(await page.locator('[data-figure], .figure-row').count(), 0);
    assert.equal(await page.locator('.feature-image').count(), 0);
    await fs.rm(path.join(postsDirectory, 'another-post.md'));
    await fs.rm(path.join(postsDirectory, 'entra-default-settings-that-you-should-change.md'));
    await page.reload();
    assert.ok(await page.getByText('A new chapter is on the way.').isVisible());
    const response = await page.goto(base + '/blog/missing');
    assert.equal(response.status(),404);
    assert.ok(await page.getByRole('link', {name:'Back to the blog'}).isVisible());
    const missingTag = await page.goto(base + '/blog/tag/not-a-real-tag');
    assert.equal(missingTag.status(), 404);
    assert.ok(await page.getByRole('heading', {name:'No notes under that tag.'}).isVisible());
    assert.deepEqual(errors,[]);
    console.log('Blog, post, tools, newsroom navigation, responsive layouts, and folder refresh checks passed.');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(postsDirectory, {recursive:true, force:true});
  }
})().catch(error => { console.error(error); process.exitCode=1; });
