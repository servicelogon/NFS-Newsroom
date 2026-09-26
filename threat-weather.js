export const DAY_MS = 24 * 60 * 60 * 1000;

export const WEATHER_TOPICS = [
  { id: "cloud", name: "Cloud", phrase: "cloud" },
  { id: "identity", name: "Identity", phrase: "identity" },
  { id: "incidents", name: "Incidents", phrase: "incidents" },
  { id: "malware", name: "Malware", phrase: "malware" },
  { id: "operations", name: "Operations", phrase: "operations" },
  { id: "microsoft", name: "Microsoft", phrase: "microsoft" },
];

const ICON_PATHS = {
  clear:
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4"/>',
  light:
    '<circle cx="9.5" cy="9.5" r="3.2"/><path d="M9.5 3.2v1.5m-6.3 4.8h1.5m1-5.3 1.1 1.1M16 14.2a4.2 4.2 0 0 0-7.4-1.4 3.3 3.3 0 1 0-.3 6.5h7.4a3.5 3.5 0 0 0 .3-6.6Z"/>',
  active:
    '<path d="M16.2 13.2a4.2 4.2 0 0 0-7.5-1.5A3.3 3.3 0 1 0 8 18.4h7.6a3.5 3.5 0 0 0 .6-5.2Z"/><path d="m9 20-1 3m4-3-1 3m4-3-1 3"/>',
  stormy:
    '<path d="M16.2 12.4a4.2 4.2 0 0 0-7.5-1.5A3.3 3.3 0 1 0 8 17.6h7.6a3.5 3.5 0 0 0 .6-5.2Z"/><path d="m11.2 15 1.8 3h-2.2l1.6 3.4"/>',
};

export function weatherIconSvg(band) {
  const paths = ICON_PATHS[band] || ICON_PATHS.clear;
  return `<svg class="threat-weather-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

const STANDARD_TOPIC_IDS = new Set(
  WEATHER_TOPICS.filter((topic) => topic.id !== "microsoft").map((topic) => topic.id),
);

export function weatherBand(count) {
  const n = Number(count) || 0;
  if (n <= 0) return "clear";
  if (n <= 2) return "light";
  if (n <= 5) return "active";
  return "stormy";
}

export function isWithinLast24h(publishedAt, now = Date.now()) {
  const time = Date.parse(publishedAt);
  if (!Number.isFinite(time)) return false;
  return time <= now && time >= now - DAY_MS;
}

export function countLast24h(stories = [], { now = Date.now(), isMicrosoftStory } = {}) {
  const counts = Object.fromEntries(WEATHER_TOPICS.map((topic) => [topic.id, 0]));
  for (const story of Array.isArray(stories) ? stories : []) {
    if (!isWithinLast24h(story?.publishedAt, now)) continue;
    if (STANDARD_TOPIC_IDS.has(story.topic)) counts[story.topic] += 1;
    if (typeof isMicrosoftStory === "function" && isMicrosoftStory(story)) counts.microsoft += 1;
  }
  return counts;
}

function capitalize(word) {
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : "";
}

export function describeThreatWeather(counts = {}) {
  const topics = WEATHER_TOPICS.map((topic) => {
    const count = Number(counts[topic.id]) || 0;
    return { ...topic, count, band: weatherBand(count) };
  });
  const max = Math.max(...topics.map((topic) => topic.count));
  if (max <= 0) {
    return { sentence: "Clear skies across coverage.", topics, headlineBand: "clear" };
  }
  const stormiest = topics.filter((topic) => topic.count === max).slice(0, 2);
  const clear = topics.find((topic) => topic.count === 0);
  const names = stormiest.map((topic) => topic.phrase).join(" and ");
  let sentence = `${capitalize(stormiest[0].band)} in ${names}`;
  if (clear) sentence += `, clear in ${clear.phrase}`;
  return { sentence: `${sentence}.`, topics, headlineBand: stormiest[0].band };
}

export function shouldShowThreatWeather({ loading = false, articleCount = 0 } = {}) {
  if (loading && articleCount === 0) return "placeholder";
  if (articleCount > 0) return "ready";
  return "hidden";
}
