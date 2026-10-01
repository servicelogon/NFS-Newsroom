import { TOPICS, TOPIC_BY_ID, matchesTopic, isMicrosoftStory } from './assets/news-topics.js';
import { searchHaystack } from './assets/search.js';
import { countLast24h } from './assets/coverage-pulse.js';

const ALLOWED = new Set(['topic', 'query', 'offset', 'limit', 'microsoftFilter', 'refresh']);
export function newsQuery(params, { search = false } = {}) {
  const allowed = search ? new Set(['query']) : ALLOWED;
  for (const key of params.keys()) {
    if (!allowed.has(key) || params.getAll(key).length !== 1) throw new Error('Unsupported or repeated query parameter');
  }
  const integer = (key, fallback, max, min = 0) => {
    if (!params.has(key)) return fallback;
    const raw = params.get(key);
    if (!/^\d+$/.test(raw) || Number(raw) < min || Number(raw) > max) throw new Error(`Invalid ${key}`);
    return Number(raw);
  };
  const topic = params.get('topic') || 'all';
  const microsoftFilter = params.get('microsoftFilter') || 'all';
  const query = (params.get('query') || '').trim();
  if (!TOPIC_BY_ID.has(topic) || !['all', 'news', 'message-center'].includes(microsoftFilter) || query.length > 200) throw new Error('Invalid news filter');
  if (params.has('refresh') && params.get('refresh') !== '1') throw new Error('Invalid refresh');
  return { topic, microsoftFilter, query, offset: integer('offset', 0, 100_000), limit: integer('limit', 40, 100, 1), force: params.get('refresh') === '1' };
}

// Weak keys release old snapshots; one normalization/search index per refresh.
const indexes = new WeakMap();
function indexFor(snapshot) {
  if (!indexes.has(snapshot)) {
    const articles = snapshot.articles || [];
    indexes.set(snapshot, {
      entries: articles.map(article => ({ article, text: searchHaystack(article) })),
      topicCounts: Object.fromEntries(TOPICS.map(topic => [topic.id, articles.filter(a => matchesTopic(a, topic.id)).length])),
      frontPage: (() => {
        const byId = new Map(articles.map(article => [article.id, article]));
        return (snapshot.frontPageIds || []).map(id => byId.get(id)).filter(Boolean).slice(0, 8);
      })(),
    });
  }
  return indexes.get(snapshot);
}

export function newsPage(snapshot, options = {}) {
  const { topic = 'all', microsoftFilter = 'all', query = '', offset = 0, limit = 40 } = options;
  const index = indexFor(snapshot);
  const q = query.toLowerCase();
  const matches = index.entries.filter(({ article, text }) => matchesTopic(article, topic, microsoftFilter) && text.includes(q));
  const minute = Math.floor(Date.now() / 60000);
  if (index.pulseMinute !== minute) {
    index.pulseMinute = minute;
    index.pulseCounts = countLast24h(snapshot.articles, { isMicrosoftStory });
  }
  const articles = matches.slice(offset, offset + limit).map(entry => entry.article);
  return {
    articles, sources: snapshot.sources || [], updatedAt: snapshot.updatedAt || null,
    checkedAt: snapshot.checkedAt || null, refreshAvailableAt: snapshot.refreshAvailableAt || null,
    frontPage: index.frontPage, frontPageIds: snapshot.frontPageIds || [],
    topicCounts: index.topicCounts,
    pulseCounts: index.pulseCounts,
    total: matches.length, totalArticles: index.entries.length,
    offset, limit, nextOffset: offset + articles.length < matches.length ? offset + articles.length : null,
  };
}

export function headlineSearch(snapshot, query = '') {
  const q = query.toLowerCase();
  return { articles: indexFor(snapshot).entries.filter(entry => entry.text.includes(q)).slice(0, q ? 20 : 8)
    .map(({ article }) => ({ title: article.title, url: article.url, source: article.source, stale: Boolean(article.stale) })) };
}
