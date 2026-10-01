import { TOPIC_BY_ID } from './news-topics.js';
import { describeCoveragePulse, shouldShowCoveragePulse } from './coverage-pulse.js';
import { describeEmptyState } from '/assets/newsroom-states.js';
import { createArticleCard } from './article-card.js';

const $ = selector => document.querySelector(selector);
const state = {
  front: true, topic: 'all', microsoftFilter: 'all', query: '', stories: [], frontPage: [],
  sources: [], total: 0, totalArticles: 0, nextOffset: null, pulseCounts: {},
  checkedAt: null, loading: true, error: '',
};
let controller, searchTimer;
let requestId = 0;
const viewKey = () => JSON.stringify([state.topic, state.microsoftFilter, state.query]);

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
  root.querySelector('.empty-actions').hidden = !empty.reset;
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
  const errorNotice = $('#news-error');
  errorNotice.hidden = !state.error || !(state.front ? state.frontPage.length : state.stories.length);
  errorNotice.textContent = errorNotice.hidden ? '' : 'The latest headlines could not be loaded. Showing the last loaded results.';
  renderPulse();
}

async function loadNews({ append = false } = {}) {
  clearTimeout(searchTimer);
  controller?.abort();
  controller = new AbortController();
  const current = controller;
  const id = ++requestId;
  const key = viewKey();
  state.loading = true;
  render();
  const params = new URLSearchParams({ topic: state.topic, microsoftFilter: state.microsoftFilter, query: state.query, limit: '40', offset: String(append ? state.nextOffset || 0 : 0) });
  try {
    const response = await fetch('/api/news?' + params, { cache: 'no-cache', signal: AbortSignal.any([current.signal, AbortSignal.timeout(30000)]) });
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
    for (const field of ['sources', 'total', 'totalArticles', 'nextOffset', 'pulseCounts', 'checkedAt']) state[field] = data[field];
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
  if ($('#coverage-pulse').contains(document.activeElement)) $('#coverage-pulse summary').focus();
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
$('#pulse-all-coverage').addEventListener('click', reset);
$('#front-page-link').addEventListener('click', () => {
  state.front = true;
  $('#coverage-pulse').open = false;
  render();
});
document.addEventListener('click', event => {
  if (!$('#coverage-pulse').contains(event.target)) $('#coverage-pulse').open = false;
});
$('#load-more').addEventListener('click', () => loadNews({ append: true }));
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
// Exposed for the browser test harness.
window.loadNews = loadNews;
loadNews();
