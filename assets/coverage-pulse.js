export const DAY_MS = 24 * 60 * 60 * 1000;

export const PULSE_TOPICS = [
  { id: "cloud", name: "Cloud", phrase: "cloud" },
  { id: "identity", name: "Identity", phrase: "identity" },
  { id: "vulnerabilities", name: "Vulnerabilities", phrase: "vulnerabilities" },
  { id: "incidents", name: "Incidents", phrase: "incidents" },
  { id: "malware", name: "Malware", phrase: "malware" },
  { id: "operations", name: "Operations", phrase: "operations" },
  { id: "microsoft", name: "Microsoft", phrase: "microsoft" },
];

const ICON_PATHS = {
  quiet: '<path d="M5 16h14"/>',
  low: '<path d="M6 18v-4m6 4v-6m6 6v-8"/>',
  active: '<path d="M6 18v-6m6 6V8m6 10V4"/>',
  high: '<path d="M6 18V4m6 14V4m6 14V4"/>',
};

export function coverageIconSvg(band) {
  const paths = ICON_PATHS[band] || ICON_PATHS.quiet;
  return `<svg class="coverage-pulse-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

const STANDARD_TOPIC_IDS = new Set(
  PULSE_TOPICS.filter((topic) => topic.id !== "microsoft").map((topic) => topic.id),
);

export function coverageBand(count) {
  const n = Number(count) || 0;
  if (n <= 0) return "quiet";
  if (n <= 2) return "low";
  if (n <= 5) return "active";
  return "high";
}

export function isWithinLast24h(publishedAt, now = Date.now()) {
  const time = Date.parse(publishedAt);
  if (!Number.isFinite(time)) return false;
  return time <= now && time >= now - DAY_MS;
}

export function countLast24h(stories = [], { now = Date.now(), isMicrosoftStory } = {}) {
  const counts = Object.fromEntries(PULSE_TOPICS.map((topic) => [topic.id, 0]));
  for (const story of Array.isArray(stories) ? stories : []) {
    if (!isWithinLast24h(story?.publishedAt, now)) continue;
    if (STANDARD_TOPIC_IDS.has(story.topic || story.category)) counts[story.topic || story.category] += 1;
    if (typeof isMicrosoftStory === "function" && isMicrosoftStory(story)) counts.microsoft += 1;
  }
  return counts;
}

export function describeCoveragePulse(counts = {}) {
  const topics = PULSE_TOPICS.map((topic) => {
    const count = Number(counts[topic.id]) || 0;
    return { ...topic, count, band: coverageBand(count) };
  });
  const max = Math.max(...topics.map((topic) => topic.count));
  if (max <= 0) {
    return { sentence: "No stories published in the last 24 hours.", topics, leadingBand: "quiet" };
  }
  const busiest = topics.filter((topic) => topic.count === max).slice(0, 2);
  const names = busiest.map((topic) => topic.phrase).join(" and ");
  const sentence = `Most coverage in ${names}`;
  return { sentence: `${sentence}.`, topics, leadingBand: busiest[0].band };
}

export function shouldShowCoveragePulse({ loading = false, articleCount = 0 } = {}) {
  if (loading && articleCount === 0) return "placeholder";
  if (articleCount > 0) return "ready";
  return "hidden";
}
