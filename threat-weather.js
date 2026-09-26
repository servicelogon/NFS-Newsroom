export const DAY_MS = 24 * 60 * 60 * 1000;

export const WEATHER_TOPICS = [
  { id: "cloud", name: "Cloud", phrase: "cloud" },
  { id: "identity", name: "Identity", phrase: "identity" },
  { id: "vulnerabilities", name: "Vulnerabilities", phrase: "vulnerabilities" },
  { id: "incidents", name: "Incidents", phrase: "incidents" },
  { id: "malware", name: "Malware", phrase: "malware" },
  { id: "operations", name: "Operations", phrase: "operations" },
  { id: "microsoft", name: "Microsoft", phrase: "microsoft" },
];

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
    return { sentence: "Clear skies across coverage.", topics };
  }
  const stormiest = topics.filter((topic) => topic.count === max).slice(0, 2);
  const clear = topics.find((topic) => topic.count === 0);
  const names = stormiest.map((topic) => topic.phrase).join(" and ");
  let sentence = `${capitalize(stormiest[0].band)} in ${names}`;
  if (clear) sentence += `, clear in ${clear.phrase}`;
  return { sentence: `${sentence}.`, topics };
}

export function shouldShowThreatWeather({ loading = false, articleCount = 0 } = {}) {
  if (loading && articleCount === 0) return "placeholder";
  if (articleCount > 0) return "ready";
  return "hidden";
}
