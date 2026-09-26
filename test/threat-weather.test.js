import test from "node:test";
import assert from "node:assert/strict";
import {
  countLast24h,
  describeThreatWeather,
  isWithinLast24h,
  shouldShowThreatWeather,
  weatherBand,
} from "../threat-weather.js";

const NOW = Date.parse("2026-09-26T12:00:00.000Z");
const hour = (n) => new Date(NOW - n * 60 * 60 * 1000).toISOString();

function isMicrosoftStory(story) {
  if (/\bCVE(?:-\d{4}-\d{4,7})?\b/i.test([story.title, story.summary].join(" "))) return false;
  return story.source === "MS Message Center" || story.source === "Microsoft Entra Blog";
}

test("weatherBand uses absolute 24h thresholds", () => {
  assert.equal(weatherBand(0), "clear");
  assert.equal(weatherBand(1), "light");
  assert.equal(weatherBand(2), "light");
  assert.equal(weatherBand(3), "active");
  assert.equal(weatherBand(5), "active");
  assert.equal(weatherBand(6), "stormy");
  assert.equal(weatherBand(20), "stormy");
});

test("isWithinLast24h skips missing, invalid, future, and stale dates", () => {
  assert.equal(isWithinLast24h(hour(1), NOW), true);
  assert.equal(isWithinLast24h(hour(24), NOW), true);
  assert.equal(isWithinLast24h(hour(24.01), NOW), false);
  assert.equal(isWithinLast24h(null, NOW), false);
  assert.equal(isWithinLast24h("not-a-date", NOW), false);
  assert.equal(isWithinLast24h(new Date(NOW + 60_000).toISOString(), NOW), false);
});

test("countLast24h uses story.topic and isMicrosoftStory, not category alone", () => {
  const counts = countLast24h(
    [
      { topic: "identity", category: "identity", publishedAt: hour(1), source: "Fixture", title: "Tokens" },
      { topic: "identity", category: "identity", publishedAt: hour(2), source: "Microsoft Entra Blog", title: "Entra" },
      { topic: "cloud", category: "cloud", publishedAt: hour(30), source: "Fixture", title: "Old cloud" },
      { topic: "microsoft", category: "microsoft", publishedAt: hour(1), source: "Fixture", title: "Partner CVE-2026-1" },
      { topic: "vulnerabilities", category: "microsoft", publishedAt: hour(1), source: "MSRC", title: "CVE-2026-9 advisory" },
      { topic: "microsoft", category: "microsoft", publishedAt: hour(1), source: "MS Message Center", title: "MC1 note" },
      { topic: "operations", category: "operations", publishedAt: "bad", source: "Fixture", title: "Skip" },
    ],
    { now: NOW, isMicrosoftStory },
  );
  assert.deepEqual(counts, {
    cloud: 0,
    identity: 2,
    vulnerabilities: 1,
    incidents: 0,
    malware: 0,
    operations: 0,
    microsoft: 2,
  });
});

test("describeThreatWeather covers quiet, mixed, stormy, and ties", () => {
  assert.equal(
    describeThreatWeather({
      cloud: 0,
      identity: 0,
      vulnerabilities: 0,
      incidents: 0,
      malware: 0,
      operations: 0,
      microsoft: 0,
    }).sentence,
    "Clear skies across coverage.",
  );

  assert.equal(
    describeThreatWeather({
      cloud: 0,
      identity: 6,
      vulnerabilities: 1,
      incidents: 0,
      malware: 0,
      operations: 2,
      microsoft: 3,
    }).sentence,
    "Stormy in identity, clear in cloud.",
  );

  assert.equal(
    describeThreatWeather({
      cloud: 4,
      identity: 4,
      vulnerabilities: 1,
      incidents: 1,
      malware: 1,
      operations: 1,
      microsoft: 1,
    }).sentence,
    "Active in cloud and identity.",
  );

  assert.equal(
    describeThreatWeather({
      cloud: 1,
      identity: 1,
      vulnerabilities: 0,
      incidents: 0,
      malware: 0,
      operations: 0,
      microsoft: 0,
    }).sentence,
    "Light in cloud and identity, clear in vulnerabilities.",
  );
});

test("shouldShowThreatWeather hides empty feeds and avoids a clear-skies flash", () => {
  assert.equal(shouldShowThreatWeather({ loading: true, articleCount: 0 }), "placeholder");
  assert.equal(shouldShowThreatWeather({ loading: false, articleCount: 0 }), "hidden");
  assert.equal(shouldShowThreatWeather({ loading: true, articleCount: 4 }), "ready");
  assert.equal(shouldShowThreatWeather({ loading: false, articleCount: 4 }), "ready");
});
