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
  const server = createAppServer({ postsDirectory, service: { getNews:async () => ({articles:[],sources:[],updatedAt:null}) } });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch();
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({width, height:1000});
      for (const route of ['/', '/blog/entra-default-settings-that-you-should-change', '/tools', '/newsroom']) {
        await page.goto(base + route);
        assert.equal(await page.locator('main').count(), 1);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} overflows at ${width}`);
        if (width > 700) {
          assert.ok(await page.locator('.desktop-nav').isVisible());
          assert.equal(await page.locator('.desktop-nav a').count(), 3);
          assert.equal(await page.locator('.desktop-nav [aria-current="page"]').count(), 1);
          assert.equal(await page.locator('.site-menu').isVisible(), false);
        } else {
          assert.equal(await page.locator('.desktop-nav').isVisible(), false);
          await page.locator('.site-menu summary').click();
          assert.ok(await page.getByRole('navigation', {name:'Mobile navigation'}).isVisible());
          assert.equal(await page.locator('.site-menu [aria-current="page"]').count(), 1);
          await page.keyboard.press('Escape');
          assert.equal(await page.locator('.site-menu').getAttribute('open'), null);
          assert.ok(await page.locator('.site-menu summary').evaluate(el => document.activeElement === el));
          assert.equal((await page.locator('.site-menu summary').textContent()).trim(), '');
        }
        await page.getByRole('button', {name:'Switch to light mode'}).click();
        assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
        await page.reload();
        assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} light mode overflows at ${width}`);
        if (process.env.SCREENSHOTS && width === 390 && route === '/') {
          await page.screenshot({path:'/private/tmp/nfs-blog-light-390.png',fullPage:true});
        }
        await page.getByRole('button', {name:'Switch to dark mode'}).click();
        if (process.env.SCREENSHOTS && width !== 320 && route !== '/newsroom') {
          await page.locator('.feature-image img, .post-hero img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
          const name = route === '/' ? 'blog' : route === '/tools' ? 'tools' : 'post';
          await page.screenshot({path:`/private/tmp/nfs-${name}-${width}.png`,fullPage:true});
        }
      }
    }
    await page.goto(base);
    await page.getByRole('button', {name:'Switch to light mode'}).click();
    await page.goto(base + '/tools');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await page.getByRole('button', {name:'Switch to dark mode'}).click();
    await page.goto(base);
    assert.equal(await page.locator('.featured-post .tag').count(), 0);
    assert.equal(await page.getByRole('link', {name:'Read the story'}).count(), 0);
    assert.equal(await page.locator('.site-footer .social-placeholder').count(), 3);
    assert.ok(await page.getByRole('img', {name:'X placeholder'}).isVisible());
    assert.ok(await page.getByRole('img', {name:'Bluesky placeholder'}).isVisible());
    assert.ok(await page.getByRole('img', {name:'Medium placeholder'}).isVisible());
    assert.ok(await page.getByRole('heading', {name:/Notes from the frontier/}).isVisible());
    assert.equal(await page.locator('.feature-image img').getAttribute('src'), '/assets/blog/entra-default-settings-header.jpg');
    assert.ok(await page.locator('.feature-image img').evaluate(img => img.complete && img.naturalWidth > 0));
    await page.locator('#featured-title a').click();
    assert.ok(page.url().endsWith('/blog/entra-default-settings-that-you-should-change'));
    assert.equal(await page.locator('.post-heading .tag').count(), 0);
    assert.doesNotMatch(await page.locator('.post-heading h1').evaluate(el => getComputedStyle(el).fontFamily), /Georgia|Times New Roman/i);
    assert.doesNotMatch(await page.locator('.prose h2').first().evaluate(el => getComputedStyle(el).fontFamily), /Georgia|Times New Roman/i);
    assert.equal(await page.locator('.post-hero img').getAttribute('src'), '/assets/blog/entra-default-settings-header.jpg');
    assert.ok(await page.locator('.post-hero img').evaluate(img => img.complete && img.naturalWidth > 0));
    assert.equal(await page.locator('.prose img').count(), 3);
    assert.equal(await page.locator('.prose table').count(), 1);
    assert.ok(await page.getByRole('heading', {name:/Security Defaults vs\. Conditional Access/}).isVisible());
    await page.getByRole('link', {name:'All field notes'}).click();
    await page.locator('.site-menu summary').click();
    await page.getByRole('navigation', {name:'Mobile navigation'}).getByRole('link', {name:'Tools'}).click();
    assert.ok(page.url().endsWith('/tools'));
    assert.equal(await page.locator('.tool-launch').count(), 2);
    for (const anchor of await page.locator('.tool-actions a').all()) {
      assert.match(await anchor.getAttribute('href'), /^https:\/\//);
      assert.match(await anchor.getAttribute('rel'), /noopener/);
    }
    await fs.writeFile(path.join(postsDirectory, 'another-post.md'), sample.replace('Entra Default Settings That You Should Change', 'A second field note').replace('2026-09-14', '2026-09-15'));
    await page.goto(base);
    assert.match(await page.locator('#featured-title').textContent(), /A second field note/);
    assert.equal(await page.locator('.post-tile').count(), 2);
    assert.equal(await page.locator('.post-tile .feature-image').count(), 2);
    await fs.rm(path.join(postsDirectory, 'another-post.md'));
    await fs.rm(path.join(postsDirectory, 'entra-default-settings-that-you-should-change.md'));
    await page.reload();
    assert.ok(await page.getByText('A new chapter is on the way.').isVisible());
    const response = await page.goto(base + '/blog/missing');
    assert.equal(response.status(),404);
    assert.ok(await page.getByRole('link', {name:'Back to the blog'}).isVisible());
    assert.deepEqual(errors,[]);
    console.log('Blog, post, tools, newsroom navigation, responsive layouts, and folder refresh checks passed.');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(postsDirectory, {recursive:true, force:true});
  }
})().catch(error => { console.error(error); process.exitCode=1; });
