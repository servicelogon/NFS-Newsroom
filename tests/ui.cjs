const { chromium } = require("@playwright/test");
const fs = require("node:fs");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    let fail = false;
    let stale = false;
    let large = false;
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("http://beacon.test/**", async (r) => {
      if (r.request().url().endsWith("/assets/new-frontier-security-logo.png"))
        return r.fulfill({
          contentType: "image/png",
          body: fs.readFileSync("assets/new-frontier-security-logo.png"),
        });
      if (r.request().url().endsWith("/assets/newsroom-logo.png"))
        return r.fulfill({
          contentType: "image/png",
          body: fs.readFileSync("assets/newsroom-logo.png"),
        });
      if (r.request().url() === "https://example.com/advisory.jpg")
        return r.fulfill({
          contentType: "image/png",
          body: fs.readFileSync("assets/newsroom-logo.png"),
        });
      if (r.request().url().endsWith("/api/news")) {
        if (fail) return r.fulfill({ status: 503, body: "unavailable" });
        return r.fulfill({
          json: {
            articles: [
              ...(large
                ? Array.from({ length: 100 }, (_, i) => ({
                    title: "Bulk " + i,
                    category: "microsoft",
                    source: "Fixture",
                    summary: "",
                    url: "https://example.com/bulk/" + i,
                  }))
                : []),
              {
                title: "Fixture operations note",
                summary: "Detection and governance update",
                category: "operations",
                source: "Fixture operations",
                url: "https://example.com/operations",
                imageUrl: "https://example.com/advisory.jpg",
                publishedAt: "2026-09-01T12:00:00Z",
              },
              {
                title: "Fixture cloud posture issue",
                summary: "Cloud asset exposure in Kubernetes",
                category: "cloud",
                source: "Fixture cloud",
                url: "https://example.com/cloud",
                publishedAt: "2026-09-01T11:30:00Z",
              },
              {
                title: "Fixture identity token theft",
                summary: "OAuth session token phishing campaign",
                category: "identity",
                source: "Fixture identity",
                url: "https://example.com/identity",
                publishedAt: "2026-09-01T11:15:00Z",
              },
              {
                title: "Fixture Entra update",
                summary: "Identity release notes",
                category: "microsoft",
                source: "Microsoft Entra Blog",
                url: "https://techcommunity.microsoft.com/example",
                publishedAt: "2026-09-01T11:00:00Z",
              },
            ],
            sources: [
              {
                name: "Fixture publisher",
                status: stale ? "stale" : "ok",
                ...(stale ? { error: "HTTP 503" } : {}),
              },
            ],
            updatedAt: "2026-09-01T12:00:00Z",
          },
        });
      }
      return r.fulfill({
        contentType: "text/html",
        body: fs.readFileSync("index.html", "utf8"),
      });
    });
    await page.goto("http://beacon.test/");
    await page.waitForFunction(
      () =>
        document.querySelector(".front-page-story h2")?.textContent === "Fixture cloud posture issue",
      {},
      { timeout: 3000 },
    );
    assert.equal(await page.locator("#front-page-link span").textContent(), "Front Page");
    assert.deepEqual(
      await page.locator(".category span").allTextContents(),
      [
        "All coverage",
        "Cloud security",
        "Identity security",
        "Vulnerabilities",
        "Incidents",
        "Malware & ransomware",
        "Security operations",
        "Microsoft",
      ],
    );
    assert.equal(await page.locator("#front-page").isVisible(), true);
    assert.equal(await page.locator("#briefing-view").isVisible(), false);
    assert.equal(await page.locator('.category[aria-pressed="true"]').count(), 0);
    assert.ok((await page.locator("#front-page-date").textContent()).trim());
    assert.equal(await page.locator(".front-page-story img").count(), 1);
    assert.match(
      await page.locator("#front-page-title").evaluate((e) => getComputedStyle(e).fontFamily),
      /Georgia/i,
    );
    assert.equal(await page.locator("#front-page-feed > .front-page-column").count(), 2);
    assert.match(
      await page.locator("#front-page-link span").evaluate((e) => getComputedStyle(e).fontFamily),
      /Georgia/i,
    );
    assert.doesNotMatch(
      await page.locator(".front-page-story h2").first().evaluate((e) => getComputedStyle(e).fontFamily),
      /Georgia|Times New Roman/i,
    );
    assert.equal(
      await page.locator(".front-page-story h2").first().textContent(),
      "Fixture cloud posture issue",
    );
    assert.equal(await page.locator(".front-page-story").count(), 4);
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForFunction(
      () => document.querySelector("#front-page").style.getPropertyValue("--front-page-star-near-y") !== "0px",
    );
    assert.notEqual(
      await page.locator("#front-page").evaluate((e) => e.style.getPropertyValue("--front-page-star-near-y")),
      "0px",
    );
    assert.equal(
      await page.locator("#front-page").evaluate((e) => e.style.getPropertyValue("--front-page-star-near-x")),
      "",
    );
    assert.equal(
      await page.locator("#front-page").evaluate((e) => e.style.getPropertyValue("--front-page-dust-near-x")),
      "",
    );
    await page.locator("#front-page-link").click();
    assert.equal(await page.locator("#front-page").isVisible(), false);
    assert.equal(await page.locator("#briefing-view").isVisible(), true);
    assert.equal(
      await page.locator(".story a").first().getAttribute("href"),
      "https://example.com/operations",
    );
    assert.equal(await page.locator(".category .count").count(), 0);
    await page.locator('[data-topic="cloud"]').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-topic="cloud"]')?.getAttribute("aria-pressed") === "true",
    );
    assert.equal(await page.locator("#feed .story").count(), 1);
    assert.equal(await page.locator("#feed .story h2").textContent(), "Fixture cloud posture issue");
    await page.waitForFunction(() =>
      getComputedStyle(document.querySelector('[data-topic="cloud"]')).color === "rgb(245, 158, 11)",
    );
    assert.equal(
      await page.locator('[data-topic="cloud"]').evaluate((e) => getComputedStyle(e).color),
      "rgb(245, 158, 11)",
    );
    assert.match(
      await page.locator(".story").first().evaluate((e) => getComputedStyle(e).getPropertyValue("--topic-color")),
      /#f59e0b/i,
    );
    assert.equal(
      await page.locator(".story p").first().evaluate((e) => getComputedStyle(e, "::selection").backgroundColor),
      "rgb(245, 158, 11)",
    );
    const titleLink = page.locator(".story h2 a").first();
    await titleLink.hover();
    await page.waitForFunction(() => {
      const link = document.querySelector(".story h2 a");
      const topic = document.querySelector(".story .topic");
      return link?.matches(":hover") &&
        getComputedStyle(link).color === getComputedStyle(topic).color;
    });
    assert.equal(
      await titleLink.evaluate((e) => getComputedStyle(e).color),
      await page.locator(".story .topic").first().evaluate((e) => getComputedStyle(e).color),
    );
    await page.locator('[data-topic="identity"]').click();
    await page.waitForFunction(() =>
      getComputedStyle(document.querySelector('[data-topic="identity"]')).color === "rgb(192, 132, 252)",
    );
    assert.equal(await page.locator(".story h2").textContent(), "Fixture identity token theft");
    await page.locator('[data-topic="all"]').click();
    await page.waitForFunction(() =>
      getComputedStyle(document.querySelector('[data-topic="all"]')).color === "rgb(88, 224, 141)",
    );
    assert.equal(
      await page.locator('[data-topic="all"]').evaluate((e) => getComputedStyle(e).color),
      "rgb(88, 224, 141)",
    );
    assert.equal(await page.locator('[data-topic="microsoft"]').count(), 1);
    await page.locator('[data-topic="microsoft"]').click();
    await page.waitForFunction(() =>
      getComputedStyle(document.querySelector('[data-topic="microsoft"]')).color === "rgb(96, 165, 250)",
    );
    assert.equal(
      await page.locator('[data-topic="microsoft"]').evaluate((e) => getComputedStyle(e).color),
      "rgb(96, 165, 250)",
    );
    assert.equal(await page.locator(".story").count(), 1);
    assert.equal(
      await page.locator(".story h2").textContent(),
      "Fixture Entra update",
    );
    assert.equal(await page.locator("#message-center").isVisible(), true);
    assert.match(
      await page.locator("#message-center").textContent(),
      /RSS preview/,
    );
    assert.match(
      await page.locator("#message-center").textContent(),
      /Waiting for the Message Center RSS feed/,
    );
    await page.locator('[data-topic="incidents"]').click();
    assert.equal(await page.locator("#empty").isVisible(), true);
    await page.locator("#reset").click();
    await page.locator("#search").fill("no-match-xyz");
    assert.equal(await page.locator(".story").count(), 0);
    await page.locator("#clear").click();
    assert.equal(await page.locator(".story").count(), 4);
    await page.keyboard.press("/");
    assert.equal(
      await page
        .locator("#search")
        .evaluate((e) => e === document.activeElement),
      true,
    );
    await page.keyboard.press("Escape");
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      assert.equal(await page.locator(".ascii-header").count(), 0);
      assert.equal(
        await page
          .locator(".newsroom-logo")
          .evaluate(
            (e) =>
              e.complete &&
              e.naturalWidth > 0 &&
              e.getBoundingClientRect().right <= innerWidth,
          ),
        true,
      );
      assert.equal(await page.title(), "New Frontier Security — Newsroom");
      assert.equal(
        await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
        "rgb(21, 21, 21)",
      );
      assert.equal(
        await page.locator(".brand-logo").evaluate((e) =>
          e.complete &&
          e.naturalWidth > 0 &&
          e.getAttribute("alt") === "New Frontier Security",
        ),
        true,
      );
    }
    large = true;
    await page.reload();
    await page.waitForFunction(
      () => document.querySelectorAll(".front-page-story").length === 8,
    );
    await page.locator("#front-page-link").click();
    await page.waitForFunction(() => document.querySelectorAll(".story").length === 40);
    assert.equal(await page.locator(".story").count(), 40);
    await page.locator("#load-more").click();
    assert.equal(await page.locator(".story").count(), 80);
    await page.locator("#load-more").click();
    assert.equal(await page.locator(".story").count(), 104);
    large = false;
    await page.reload();
    await page.waitForFunction(
      () => document.querySelectorAll(".front-page-story").length === 4,
    );
    await page.locator("#front-page-link").click();
    await page.waitForFunction(() => document.querySelectorAll(".story").length === 4);
    assert.equal(await page.locator("#source-status").count(), 0);
    assert.equal(await page.locator("#feed-status").count(), 0);
    assert.equal(await page.locator("#retry").count(), 0);
    stale = true;
    await page.evaluate(() => loadNews());
    await page.waitForFunction(() => document.querySelectorAll(".story").length === 4);
    assert.equal(await page.locator(".story").count(), 4);
    fail = true;
    await page.evaluate(() => loadNews());
    await page.waitForFunction(() => document.querySelectorAll(".story").length === 4);
    assert.equal(await page.locator(".story").count(), 4);
    await page.reload();
    await page.waitForFunction(
      () => document.querySelectorAll(".story").length === 0,
      {},
      { timeout: 3000 },
    );
    assert.equal(await page.locator(".story").count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      "PASS live rendering, source link, category counts, empty state, failure without invented stories",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
