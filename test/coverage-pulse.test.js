import test from "node:test";
import assert from "node:assert/strict";
import {
  PULSE_TOPICS,
  countLast24h,
  describeCoveragePulse,
  isWithinLast24h,
  shouldShowCoveragePulse,
  coverageBand,
  coverageIconSvg,
} from "../assets/coverage-pulse.js";

const NOW = Date.parse("2026-09-26T12:00:00.000Z");
const hour = (n) => new Date(NOW - n * 60 * 60 * 1000).toISOString();

function isMicrosoftStory(story) {
  if (/\bCVE(?:-\d{4}-\d{4,7})?\b/i.test([story.title, story.summary].join(" "))) return false;
  return story.source === "MS Message Center" || story.source === "Microsoft Entra Blog";
}

test("coverageBand uses absolute 24h thresholds", () => {
  assert.equal(coverageBand(0), "quiet");
  assert.equal(coverageBand(1), "low");
  assert.equal(coverageBand(2), "low");
  assert.equal(coverageBand(3), "active");
  assert.equal(coverageBand(5), "active");
  assert.equal(coverageBand(6), "high");
  assert.equal(coverageBand(20), "high");
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
      { topic: "incidents", category: "incidents", publishedAt: hour(1), source: "Fixture", title: "Breach note" },
      { topic: "microsoft", category: "microsoft", publishedAt: hour(1), source: "MS Message Center", title: "MC1 note" },
      { topic: "operations", category: "operations", publishedAt: "bad", source: "Fixture", title: "Skip" },
    ],
    { now: NOW, isMicrosoftStory },
  );
  assert.deepEqual(counts, {
    cloud: 0,
    identity: 2,
    vulnerabilities: 0,
    incidents: 1,
    malware: 0,
    operations: 0,
    microsoft: 2,
  });
});

test("describeCoveragePulse covers quiet, mixed, busy, and ties", () => {
  assert.equal(
    describeCoveragePulse({
      cloud: 0,
      identity: 0,
      incidents: 0,
      malware: 0,
      operations: 0,
      microsoft: 0,
    }).sentence,
    "No stories published in the last 24 hours.",
  );

  assert.equal(
    describeCoveragePulse({
      cloud: 0,
      identity: 6,
      incidents: 0,
      malware: 0,
      operations: 2,
      microsoft: 3,
    }).sentence,
    "Most coverage in identity.",
  );

  assert.equal(
    describeCoveragePulse({
      cloud: 4,
      identity: 4,
      incidents: 1,
      malware: 1,
      operations: 1,
      microsoft: 1,
    }).sentence,
    "Most coverage in cloud and identity.",
  );

  assert.equal(
    describeCoveragePulse({
      cloud: 1,
      identity: 1,
      incidents: 0,
      malware: 0,
      operations: 0,
      microsoft: 0,
    }).sentence,
    "Most coverage in cloud and identity.",
  );
});

test("coverage pulse covers seven topics and ships band icons", () => {
  assert.deepEqual(
    PULSE_TOPICS.map((topic) => topic.id),
    ["cloud", "identity", "vulnerabilities", "incidents", "malware", "operations", "microsoft"],
  );
  assert.match(coverageIconSvg("high"), /<svg/);
  assert.match(coverageIconSvg("quiet"), /<svg/);
});

test("shouldShowCoveragePulse hides empty feeds and avoids a zero-volume flash", () => {
  assert.equal(shouldShowCoveragePulse({ loading: true, articleCount: 0 }), "placeholder");
  assert.equal(shouldShowCoveragePulse({ loading: false, articleCount: 0 }), "hidden");
  assert.equal(shouldShowCoveragePulse({ loading: true, articleCount: 4 }), "ready");
  assert.equal(shouldShowCoveragePulse({ loading: false, articleCount: 4 }), "ready");
});
