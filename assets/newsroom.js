import { TOPICS, TOPIC_BY_ID } from './news-topics.js';
import { describeCoveragePulse, shouldShowCoveragePulse } from './coverage-pulse.js';
import { describeEmptyState, summarizeSourceHealth } from '/assets/newsroom-states.js';
import { createArticleCard } from './article-card.js';

const $ = selector => document.querySelector(selector);
const state = {
  front: true, topic: 'all', microsoftFilter: 'all', query: '', stories: [], frontPage: [],
  sources: [], total: 0, totalArticles: 0, nextOffset: null, topicCounts: {}, pulseCounts: {},
  updatedAt: null, checkedAt: null, refreshAvailableAt: null, loading: true, error: '',
};
let controller, searchTimer, refreshTimer;
let requestId = 0;
const dateLabel = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'not yet available';
const viewKey = () => JSON.stringify([state.topic, state.microsoftFilter, state.query]);

function renderHealth() {
  const health = summarizeSourceHealth(state.sources);
  const trouble = health.error.length + health.stale.length;
  const status = $('#feed-status');
  status.dataset.warning = String(Boolean(trouble || state.error));
  status.textContent = state.error || (state.updatedAt ? `Last refreshed ${dateLabel(state.updatedAt)}${trouble ? ' · limited coverage' : ''}` : state.loading ? 'Connecting to publisher feeds…' : 'No successful refresh yet');
  $('#source-summary').textContent = health.total
    ? `${state.error ? 'Last report · ' : ''}${health.ok.length} of ${health.total} sources live${health.stale.length ? ` · ${health.stale.length} cached` : ''}${health.error.length ? ` · ${health.error.length} unavailable` : ''}`
    : 'Source health · awaiting feeds';
  const items = state.sources.map(source => {
    const item = document.createElement('li');
    const title = document.createElement('div');
    title.className = 'source-title';
    const name = document.createElement('span');
    name.textContent = source.name;
    const status = document.createElement('span');
    status.className = 'source-state';
    status.dataset.status = source.status;
    status.textContent = ({ ok: 'Live', stale: 'Cached', error: 'Unavailable' })[source.status] || 'Unknown';
    title.append(name, status);
    const date = document.createElement('p');
    date.className = 'source-date';
    date.textContent = `Last collected: ${dateLabel(source.lastSuccessAt)}`;
    item.append(title, date);
    if (source.error) {
      const error = document.createElement('p');
      error.className = 'source-error';
      error.textContent = source.error;
      item.append(error);
    }
    return item;
  });
  $('#source-status').replaceChildren(...items);
  clearTimeout(refreshTimer);
  const remaining = Math.max(0, Math.ceil((Date.parse(state.refreshAvailableAt) - Date.now()) / 1000)) || 0;
  const button = $('#refresh-news');
  button.disabled = state.loading || remaining > 0;
  button.textContent = state.loading ? 'Refreshing…' : remaining ? `Refresh in ${remaining}s` : 'Refresh news';
  if (remaining && !state.loading) refreshTimer = setTimeout(renderHealth, 1000);
}

function renderPulse() {
  const mode = shouldShowCoveragePulse({ loading: state.loading, articleCount: state.totalArticles });
  const root = $('#coverage-pulse');
  root.hidden = mode === 'hidden';
  if (root.hidden) root.open = false;
  root.dataset.loading = String(mode === 'placeholder');
  root.setAttribute('aria-busy', String(mode === 'placeholder'));
  const strip = $('#coverage-pulse-strip');
  const lead = $('#coverage-pulse-lead');
  lead.hidden = mode !== 'ready';
  if (mode === 'hidden') { strip.replaceChildren(); return; }
  if (mode === 'placeholder') {
    const placeholder = document.createElement('div');
    placeholder.className = 'coverage-pulse-placeholder';
    placeholder.setAttribute('aria-hidden', 'true');
    strip.replaceChildren(placeholder);
    return;
  }
  const { sentence, topics } = describeCoveragePulse(state.pulseCounts);
  lead.textContent = sentence;
  strip.replaceChildren(...topics.map(topic => {
    const button = document.createElement('button');
    button.className = 'coverage-pulse-chip';
    button.type = 'button';
    button.dataset.topic = topic.id;
    button.setAttribute('aria-pressed', String(!state.front && state.topic === topic.id));
    button.setAttribute('aria-label', `${topic.name}, ${topic.count} stories in the last 24 hours`);
    const label = document.createElement('span');
    label.textContent = topic.name;
    const count = document.createElement('span');
    count.className = 'coverage-pulse-chip-count';
    count.textContent = topic.count;
    button.append(label, count);
    button.addEventListener('click', () => selectTopic(topic.id));
    return button;
  }));
  const partial = state.sources.some(source => source.status !== 'ok') || Boolean(state.error);
  $('.coverage-pulse-note').textContent = `Article volume, not threat severity. Microsoft coverage overlaps other topics.${partial ? ' Some feeds are unavailable; counts may be incomplete.' : ''}`;
}

function applyEmptyState(root, visibleCount, front = false) {
  const empty = describeEmptyState({
    loading: state.loading, articleCount: state.totalArticles, visibleCount, sources: state.sources,
    loadError: state.error, hasQuery: Boolean(state.query), view: front ? 'front-page' : 'briefing',
  });
  root.hidden = !empty;
  if (!empty) return;
  root.querySelector('[data-empty-eyebrow]').textContent = empty.eyebrow;
  root.querySelector('[data-empty-title]').textContent = empty.title;
  root.querySelector('[data-empty-copy]').textContent = empty.body;
  root.querySelectorAll('[data-empty-retry]').forEach(button => { button.hidden = !empty.retry; button.disabled = state.loading; });
  root.querySelectorAll('[data-empty-reset]').forEach(button => { button.hidden = !empty.reset; });
}

function renderCards(container, articles, front = false) {
  container.setAttribute('aria-busy', String(state.loading));
  if (state.loading && articles.length === 0) {
    container.replaceChildren(...Array.from({ length: 4 }, () => {
      const item = document.createElement('article');
      item.className = `${front ? 'front-page-story' : 'story'} skeleton-story`;
      item.setAttribute('aria-hidden', 'true');
      item.innerHTML = '<div class="skeleton-line"></div><div class="skeleton-title"><div class="skeleton-line"></div><div class="skeleton-line"></div></div><div class="skeleton-line"></div>';
      return item;
    }));
    return;
  }
  const sources = new Map(state.sources.map(source => [source.name, source]));
  // One ordered DOM list: desktop grid, keyboard traversal, and mobile agree.
  container.replaceChildren(...articles.map((story, index) => createArticleCard({ ...story, stale: story.stale || Boolean(state.error) }, { frontPage: front, lead: index === 0, source: sources.get(story.source) })).filter(Boolean));
}

function render() {
  $('#front-page').hidden = !state.front;
  $('#briefing-view').hidden = state.front;
  $('#front-page-link').setAttribute('aria-pressed', String(state.front));
  $('#topic-select').value = state.front ? 'front' : state.topic;
  document.querySelectorAll('#topic-select option[data-topic]').forEach(option => {
    const count = state.topicCounts[option.dataset.topic];
    option.textContent = `${TOPIC_BY_ID.get(option.dataset.topic).name}${count === undefined ? '' : ` (${count})`}`;
  });
  $('#microsoft-filter').hidden = state.topic !== 'microsoft';
  document.querySelectorAll('[data-microsoft-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.microsoftFilter === state.microsoftFilter)));
  const topic = TOPIC_BY_ID.get(state.topic);
  $('#section-title').textContent = state.topic === 'all' ? 'Latest coverage' : topic.name;
  $('#description').textContent = topic.description;
  const today = new Date();
  $('#front-page-date').dateTime = today.toISOString().slice(0, 10);
  $('#front-page-date').textContent = today.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  $('#front-page-status').textContent = state.loading ? 'Loading headlines…' : `${state.frontPage.length} headlines loaded.`;
  $('#briefing-status').textContent = state.loading ? 'Loading coverage…' : `${state.stories.length} of ${state.total} matching articles`;
  if (state.front) renderCards($('#front-page-feed'), state.frontPage, true);
  else renderCards($('#feed'), state.stories);
  applyEmptyState($('#front-page-empty'), state.frontPage.length, true);
  applyEmptyState($('#empty'), state.stories.length);
  const more = $('#load-more');
  more.hidden = state.nextOffset === null;
  more.disabled = state.loading;
  more.textContent = state.loading ? 'Loading…' : `Load more articles (${Math.max(0, state.total - state.stories.length)} remaining)`;
  renderHealth();
  renderPulse();
}

async function loadNews({ append = false, force = false } = {}) {
  clearTimeout(searchTimer);
  controller?.abort();
  controller = new AbortController();
  const current = controller;
  const id = ++requestId;
  const key = viewKey();
  state.loading = true;
  render();
  const params = new URLSearchParams({ topic: state.topic, microsoftFilter: state.microsoftFilter, query: state.query, limit: '40', offset: String(append ? state.nextOffset || 0 : 0) });
  if (force) params.set('refresh', '1');
  try {
    const response = await fetch('/api/news?' + params, { cache: force ? 'no-store' : 'no-cache', signal: AbortSignal.any([current.signal, AbortSignal.timeout(30000)]) });
    if (!response.ok) throw new Error(`News service returned HTTP ${response.status}.`);
    const data = await response.json();
    if (!Array.isArray(data.articles) || !Array.isArray(data.sources) || !Array.isArray(data.frontPage)) throw new Error('Invalid response from news service.');
    if (id !== requestId || key !== viewKey()) return;
    if (append && state.checkedAt && data.checkedAt !== state.checkedAt) {
      // A refreshed snapshot may have a different ordering; restart paging.
      return await loadNews();
    }
    state.stories = append ? [...state.stories, ...data.articles] : data.articles;
    state.frontPage = data.frontPage;
    for (const field of ['sources', 'total', 'totalArticles', 'nextOffset', 'topicCounts', 'pulseCounts', 'updatedAt', 'checkedAt', 'refreshAvailableAt']) state[field] = data[field];
    state.error = '';
  } catch (error) {
    if (!current.signal.aborted && id === requestId) {
      state.error = `${error.message}${state.stories.length || state.frontPage.length ? ' Showing the last loaded results.' : ''}`;
    }
  } finally {
    if (id === requestId) { state.loading = false; render(); }
  }
}

function selectTopic(topic) {
  if ($('#coverage-pulse').contains(document.activeElement)) $('#topic-select').focus();
  $('#coverage-pulse').open = false;
  state.front = false;
  state.topic = topic;
  if (topic !== 'microsoft') state.microsoftFilter = 'all';
  state.stories = [];
  state.nextOffset = null;
  loadNews();
}
function reset() {
  state.query = '';
  state.microsoftFilter = 'all';
  $('#search').value = '';
  selectTopic('all');
}
TOPICS.forEach(topic => {
  const option = document.createElement('option');
  option.value = topic.id;
  option.dataset.topic = topic.id;
  option.textContent = topic.name;
  $('#topic-select').append(option);
});
$('#topic-select').addEventListener('change', event => selectTopic(event.target.value));
$('#front-page-link').addEventListener('click', () => {
  state.front = true;
  $('#coverage-pulse').open = false;
  render();
});
document.addEventListener('click', event => {
  if (!$('#coverage-pulse').contains(event.target)) $('#coverage-pulse').open = false;
});
$('#refresh-news').addEventListener('click', () => loadNews({ force: true }));
$('#load-more').addEventListener('click', () => loadNews({ append: true }));
document.querySelectorAll('[data-empty-retry]').forEach(button => button.addEventListener('click', () => loadNews({ force: true })));
document.querySelectorAll('[data-empty-reset], #clear').forEach(button => button.addEventListener('click', reset));
document.querySelectorAll('[data-microsoft-filter]').forEach(button => button.addEventListener('click', () => {
  state.microsoftFilter = button.dataset.microsoftFilter;
  state.stories = [];
  state.nextOffset = null;
  loadNews();
}));
$('#search').addEventListener('input', event => {
  controller?.abort();
  ++requestId;
  clearTimeout(searchTimer);
  state.query = event.target.value.trim();
  state.stories = [];
  state.nextOffset = null;
  state.loading = true;
  render();
  searchTimer = setTimeout(loadNews, 150);
});
document.addEventListener('keydown', event => {
  if ($('#main').inert || $('.shell').inert || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === 'Escape' && $('#coverage-pulse').open) {
    $('#coverage-pulse').open = false;
    $('#coverage-pulse summary').focus();
    return;
  }
  if (event.key === '/' && !document.activeElement.matches('input,textarea,select,[contenteditable="true"]')) {
    event.preventDefault();
    if (state.front) reset();
    $('#search').focus();
  }
  if (event.key === 'Escape' && document.activeElement === $('#search')) {
    state.query = '';
    $('#search').value = '';
    state.stories = [];
    loadNews();
    $('#search').blur();
  }
});
// Exposed only for manual retries and the existing browser test harness.
window.loadNews = loadNews;
loadNews();
