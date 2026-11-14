// Shareable newsroom selection: topic and Microsoft view.
// The front page is the default. Any recognized selection opens the briefing.

import { TOPIC_BY_ID } from './news-topics.js';

const MICROSOFT_FILTERS = new Set(['news', 'message-center']);

export function filtersFromSearch(search = '') {
  const params = new URLSearchParams(String(search).replace(/^\?/, ''));
  const topicParam = params.get('topic');
  const microsoftParam = params.get('microsoft');
  const topicValid = Boolean(topicParam && TOPIC_BY_ID.has(topicParam));
  const microsoftValid = MICROSOFT_FILTERS.has(microsoftParam);
  if (!topicValid && !microsoftValid) {
    return { front: true, topic: 'all', microsoftFilter: 'all', query: '' };
  }
  const topic = topicValid ? topicParam : (microsoftValid ? 'microsoft' : 'all');
  return {
    front: false,
    topic,
    microsoftFilter: topic === 'microsoft' && microsoftValid ? microsoftParam : 'all',
    query: '',
  };
}

export function searchFromFilters({ front, topic = 'all', microsoftFilter = 'all' } = {}) {
  if (front) return '';
  const params = new URLSearchParams();
  params.set('topic', topic || 'all');
  if (topic === 'microsoft' && microsoftFilter && microsoftFilter !== 'all') params.set('microsoft', microsoftFilter);
  return params.toString();
}
