// Shareable newsroom selection: topic and Microsoft view.
// All coverage is the only browse mode. A blank query, ?front, or an unknown topic lands there.

import { TOPIC_BY_ID } from './news-topics.js';

const MICROSOFT_FILTERS = new Set(['news', 'message-center']);

export function filtersFromSearch(search = '') {
  const params = new URLSearchParams(String(search).replace(/^\?/, ''));
  const topicParam = params.get('topic');
  const microsoftParam = params.get('microsoft');
  const topicValid = Boolean(topicParam && TOPIC_BY_ID.has(topicParam));
  const microsoftValid = MICROSOFT_FILTERS.has(microsoftParam);
  if (!topicValid && !microsoftValid) {
    return { topic: 'all', microsoftFilter: 'all', query: '' };
  }
  const topic = topicValid ? topicParam : 'microsoft';
  return {
    topic,
    microsoftFilter: topic === 'microsoft' && microsoftValid ? microsoftParam : 'all',
    query: '',
  };
}

export function searchFromFilters({ topic = 'all', microsoftFilter = 'all' } = {}) {
  if (!topic || topic === 'all') return '';
  const params = new URLSearchParams();
  params.set('topic', topic);
  if (topic === 'microsoft' && microsoftFilter && microsoftFilter !== 'all') params.set('microsoft', microsoftFilter);
  return params.toString();
}
