import { TOPIC_BY_ID } from './news-topics.js';
import { describeCoveragePulse, shouldShowCoveragePulse } from './coverage-pulse.js';
import { describeEmptyState } from '/assets/newsroom-states.js';
import { createArticleCard } from './article-card.js';
import { formatCalendarDate } from './dates.js';
import { filtersFromSearch, searchFromFilters } from './newsroom-filters.js';

const $ = selector => document.querySelector(selector);
const state = {
  front: true, topic: 'all', microsoftFilter: 'all', query: '', stories: [], frontPage: [],
  sources: [], total: 0, totalArticles: 0, nextOffset: null, pulseCounts: {},
  checkedAt: null, loading: true, error: '',
};
let controller, switchMotion = false;
let requestId = 0;
const viewKey = () => JSON.stringify([state.topic, state.microsoftFilter, state.query]);

function renderPulse() {
  const mode = shouldShowCoveragePulse({ loading: state.loading, articleCount: state.totalArticles });
  const root = $('#coverage-pulse');
  root.hidden = mode === 'hidden';
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
    const palette = TOPIC_BY_ID.get(topic.id);
    if (palette?.color) button.style.setProperty('--topic-color', palette.color);
    const label = document.createElement('span');
    label.className = 'topic coverage-pulse-chip-label';
    label.textContent = topic.name;
    const count = document.createElement('span');
    count.className = 'coverage-pulse-chip-count';
    count.textContent = topic.count;
    button.append(count, label);
    button.addEventListener('click', () => selectTopic(topic.id));
    return button;
  }));
  $('.coverage-pulse-note').textContent = 'Article volume, not threat severity. Microsoft coverage overlaps other topics.';
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
  $('#briefing-bar').hidden = state.front;
  $('#front-page-link').setAttribute('aria-pressed', String(state.front));
  $('#pulse-all-coverage').setAttribute('aria-pressed', String(!state.front));
  if (switchMotion && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const view = $('.content');
    view.classList.remove('is-entering');
    void view.offsetWidth;
    view.classList.add('is-entering');
  }
  switchMotion = false;
  $('#microsoft-filter').hidden = state.topic !== 'microsoft';
  document.querySelectorAll('[data-microsoft-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.microsoftFilter === state.microsoftFilter)));
  const topic = TOPIC_BY_ID.get(state.topic);
  $('#section-title').textContent = state.topic === 'all' ? 'Latest coverage' : topic.name;
  $('#description').textContent = topic.description;
  const today = new Date();
  $('#front-page-date').dateTime = today.toISOString().slice(0, 10);
  $('#front-page-date').textContent = formatCalendarDate(today, { weekday: true });
  writeFilters();
  $('#front-page-status').textContent = state.loading ? 'Loading headlines…' : `${state.frontPage.length} headlines loaded.`;
  const matchCount = state.loading ? 'Loading coverage…' : `${state.stories.length} of ${state.total} matching articles`;
  $('#briefing-status').textContent = state.loading ? 'Loading…' : `${state.stories.length} of ${state.total}`;
  $('#briefing-status').setAttribute('aria-label', matchCount);
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
  selectTopic('all');
}
$('#pulse-all-coverage').addEventListener('click', () => {
  if (!state.front && state.topic === 'all' && state.microsoftFilter === 'all' && !state.query) return;
  switchMotion = true;
  reset();
});
$('#front-page-link').addEventListener('click', () => {
  if (state.front) return;
  switchMotion = true;
  state.front = true;
  render();
});
$('#load-more').addEventListener('click', () => loadNews({ append: true }));
document.querySelectorAll('[data-empty-reset]').forEach(button => button.addEventListener('click', reset));
document.querySelectorAll('[data-microsoft-filter]').forEach(button => button.addEventListener('click', () => {
  state.microsoftFilter = button.dataset.microsoftFilter;
  state.stories = [];
  state.nextOffset = null;
  loadNews();
}));
function applyUrlFilters() {
  const filters = filtersFromSearch(location.search);
  state.front = filters.front;
  state.topic = filters.topic;
  state.microsoftFilter = filters.microsoftFilter;
  state.query = '';
}

function writeFilters() {
  const query = searchFromFilters(state);
  const next = `${location.pathname}${query ? `?${query}` : ''}${location.hash}`;
  if (`${location.pathname}${location.search}${location.hash}` !== next) history.replaceState(null, '', next);
}

applyUrlFilters();
// Exposed for the browser test harness.
window.loadNews = loadNews;
loadNews();

// Quiet wireframe beside the category counts. One still frame when motion is reduced.
function initNewsroomGlobe() {
  const canvas = document.querySelector('.newsroom-globe');
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  let running = false;
  const tilt = 0.42;

  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth || 156;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = canvas.width;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function point(lat, lon, rotation) {
    const x = Math.cos(lat) * Math.sin(lon + rotation);
    const y = Math.sin(lat);
    const z = Math.cos(lat) * Math.cos(lon + rotation);
    return { x, y: y * Math.cos(tilt) - z * Math.sin(tilt), z: y * Math.sin(tilt) + z * Math.cos(tilt) };
  }

  function stroke(samples, rotation, front) {
    const width = canvas.clientWidth || 156;
    const radius = width * 0.42;
    const cx = width / 2;
    const cy = width / 2;
    ctx.beginPath();
    let drawing = false;
    for (const [lat, lon] of samples) {
      const p = point(lat, lon, rotation);
      if ((front && p.z < 0) || (!front && p.z >= 0)) { drawing = false; continue; }
      const x = cx + p.x * radius;
      const y = cy - p.y * radius;
      if (!drawing) { ctx.moveTo(x, y); drawing = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function draw(rotation) {
    const width = canvas.clientWidth || 156;
    ctx.clearRect(0, 0, width, width);
    ctx.lineWidth = 1;
    ctx.strokeStyle = getComputedStyle(canvas).color;
    ctx.beginPath();
    ctx.arc(width / 2, width / 2, width * 0.42, 0, Math.PI * 2);
    ctx.stroke();
    const rings = [];
    for (let i = 1; i <= 3; i++) {
      const lat = -Math.PI / 2 + (i * Math.PI) / 4;
      const samples = [];
      for (let step = 0; step <= 64; step++) samples.push([lat, (step / 64) * Math.PI * 2]);
      rings.push(samples);
    }
    for (let i = 0; i < 6; i++) {
      const lon = (i / 6) * Math.PI;
      const samples = [];
      for (let step = 0; step <= 48; step++) samples.push([-Math.PI / 2 + (step / 48) * Math.PI, lon]);
      rings.push(samples);
    }
    ctx.globalAlpha = 0.28;
    for (const samples of rings) stroke(samples, rotation, false);
    ctx.globalAlpha = 0.9;
    for (const samples of rings) stroke(samples, rotation, true);
    ctx.globalAlpha = 1;
  }

  function tick(now) {
    draw((now || 0) * 0.00022);
    frame = requestAnimationFrame(tick);
  }

  function start() {
    if (running || reduce.matches) return;
    running = true;
    frame = requestAnimationFrame(tick);
  }

  function stop(still = 0.8) {
    running = false;
    cancelAnimationFrame(frame);
    draw(still);
  }

  size();
  reduce.matches ? stop() : start();
  reduce.addEventListener('change', () => (reduce.matches ? stop() : start()));
  new ResizeObserver(() => { size(); if (!running) draw(0.8); }).observe(canvas);
  new IntersectionObserver(([entry]) => {
    if (reduce.matches) return;
    entry.isIntersecting ? start() : stop();
  }).observe(canvas);
}

initNewsroomGlobe();
