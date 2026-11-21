import { TOPIC_BY_ID } from './news-topics.js';
import { PULSE_TOPICS, describeCoveragePulse, shouldShowCoveragePulse } from './coverage-pulse.js';
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
const PULSE_NOTE = 'Select a topic to filter. Article volume, not threat severity. Microsoft coverage overlaps other topics.';
const touchFocusChips = new WeakSet();

function pulseActionLabel(topic, pressed) {
  return pressed
    ? `${topic.name} filter on, ${topic.count} articles. Activate to clear.`
    : `Filter briefing to ${topic.name}, ${topic.count} articles`;
}

function paintPulseChip(button, topic) {
  const pressed = !state.front && state.topic === topic.id;
  button.setAttribute('aria-pressed', String(pressed));
  button.setAttribute('aria-label', pulseActionLabel(topic, pressed));
  button.querySelector('.coverage-pulse-chip-count').textContent = String(topic.count);
}

function previewPulseTopic(topic, color) {
  if (!matchMedia('(hover: hover)').matches || !color) return;
  previewNewsroomGlobe?.({ id: topic.id, color });
}

function createPulseChip(topic) {
  const button = document.createElement('button');
  button.className = 'coverage-pulse-chip';
  button.type = 'button';
  button.dataset.topic = topic.id;
  const palette = TOPIC_BY_ID.get(topic.id);
  if (palette?.color) button.style.setProperty('--topic-color', palette.color);
  const label = document.createElement('span');
  label.className = 'topic coverage-pulse-chip-label';
  label.textContent = topic.name;
  const count = document.createElement('span');
  count.className = 'coverage-pulse-chip-count';
  button.append(count, label);
  paintPulseChip(button, topic);
  button.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch') touchFocusChips.add(button);
    else touchFocusChips.delete(button);
  });
  button.addEventListener('pointerenter', event => {
    if (event.pointerType === 'touch') return;
    previewPulseTopic(topic, palette?.color || '');
  });
  button.addEventListener('pointerleave', () => {
    if (document.activeElement === button) return;
    clearNewsroomGlobePreview?.();
  });
  button.addEventListener('focus', () => {
    if (touchFocusChips.has(button)) return;
    previewPulseTopic(topic, palette?.color || '');
  });
  button.addEventListener('blur', () => {
    touchFocusChips.delete(button);
    if (button.matches(':hover') && matchMedia('(hover: hover)').matches) return;
    clearNewsroomGlobePreview?.();
  });
  button.addEventListener('click', () => {
    if (!state.front && state.topic === topic.id) {
      switchMotion = true;
      reset();
      return;
    }
    selectTopic(topic.id);
  });
  return button;
}

function renderPulse() {
  const mode = shouldShowCoveragePulse({ loading: state.loading, articleCount: state.totalArticles });
  const root = $('#coverage-pulse');
  root.hidden = mode === 'hidden';
  root.dataset.loading = String(mode === 'placeholder');
  root.setAttribute('aria-busy', String(mode === 'placeholder'));
  const strip = $('#coverage-pulse-strip');
  const lead = $('#coverage-pulse-lead');
  lead.hidden = mode !== 'ready';
  if (mode !== 'hidden') $('.coverage-pulse-note').textContent = PULSE_NOTE;
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
  const chips = [...strip.querySelectorAll(':scope > .coverage-pulse-chip')];
  const reusable = chips.length === topics.length && chips.every((chip, index) => chip.dataset.topic === topics[index].id);
  if (!reusable) strip.replaceChildren(...topics.map(createPulseChip));
  else topics.forEach((topic, index) => paintPulseChip(chips[index], topic));
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
  const pulseTopic = PULSE_TOPICS.find(item => item.id === state.topic);
  const briefingText = state.loading
    ? 'Loading…'
    : state.front
      ? ''
      : !pulseTopic || state.topic === 'all'
        ? 'Showing all coverage.'
        : `Showing ${pulseTopic.name}, ${Number(state.pulseCounts?.[state.topic]) || 0} articles.`;
  const briefingStatus = $('#briefing-status');
  briefingStatus.textContent = briefingText;
  if (briefingText) briefingStatus.setAttribute('aria-label', briefingText);
  else briefingStatus.removeAttribute('aria-label');
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
  const activeTopic = !state.front && state.topic !== 'all' ? topic : null;
  syncNewsroomGlobeAccent?.(activeTopic ? { id: activeTopic.id, color: activeTopic.color || '' } : null);
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

let syncNewsroomGlobeAccent = null;
let previewNewsroomGlobe = null;
let clearNewsroomGlobePreview = null;

applyUrlFilters();
initNewsroomGlobe();
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
  const baseTilt = 0.42;
  const meridianCount = PULSE_TOPICS.length;
  const meridianByTopic = new Map(PULSE_TOPICS.map((topic, index) => [topic.id, index]));
  let accentTopic = '';
  let accentColor = '';
  let accentMeridian = -1;
  let accentAlpha = 0;
  let accentAlphaTarget = 0;
  let committedId = '';
  let committedColor = '';
  let previewId = '';
  let previewColor = '';
  let lastTick = 0;
  let targetYaw = 0;
  let targetTilt = 0;
  let pointerYaw = 0;
  let pointerTilt = 0;

  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth || 156;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = canvas.width;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function point(lat, lon, rotation, tilt) {
    const x = Math.cos(lat) * Math.sin(lon + rotation);
    const y = Math.sin(lat);
    const z = Math.cos(lat) * Math.cos(lon + rotation);
    return { x, y: y * Math.cos(tilt) - z * Math.sin(tilt), z: y * Math.sin(tilt) + z * Math.cos(tilt) };
  }

  function stroke(samples, rotation, tilt, front) {
    const width = canvas.clientWidth || 156;
    const radius = width * 0.42;
    const cx = width / 2;
    const cy = width / 2;
    ctx.beginPath();
    let drawing = false;
    for (const [lat, lon] of samples) {
      const p = point(lat, lon, rotation, tilt);
      if ((front && p.z < 0) || (!front && p.z >= 0)) { drawing = false; continue; }
      const x = cx + p.x * radius;
      const y = cy - p.y * radius;
      if (!drawing) { ctx.moveTo(x, y); drawing = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function draw(rotation, tilt = baseTilt) {
    const width = canvas.clientWidth || 156;
    const baseStroke = getComputedStyle(canvas).color;
    ctx.clearRect(0, 0, width, width);
    ctx.lineWidth = 1;
    ctx.strokeStyle = baseStroke;
    ctx.beginPath();
    ctx.arc(width / 2, width / 2, width * 0.42, 0, Math.PI * 2);
    ctx.stroke();
    const latitudes = [];
    for (let i = 1; i <= 3; i++) {
      const lat = -Math.PI / 2 + (i * Math.PI) / 4;
      const samples = [];
      for (let step = 0; step <= 64; step++) samples.push([lat, (step / 64) * Math.PI * 2]);
      latitudes.push(samples);
    }
    const meridians = [];
    for (let i = 0; i < meridianCount; i++) {
      const lon = (i / meridianCount) * Math.PI;
      const samples = [];
      for (let step = 0; step <= 96; step++) samples.push([(step / 96) * Math.PI * 2, lon]);
      meridians.push(samples);
    }
    ctx.globalAlpha = 0.28;
    for (const samples of latitudes) stroke(samples, rotation, tilt, false);
    for (const samples of meridians) stroke(samples, rotation, tilt, false);
    ctx.globalAlpha = 0.9;
    for (const samples of latitudes) stroke(samples, rotation, tilt, true);
    for (let i = 0; i < meridians.length; i++) {
      if (accentColor && i === accentMeridian) continue;
      stroke(meridians[i], rotation, tilt, true);
    }
    if (accentColor && accentAlpha > 0 && accentMeridian >= 0 && accentMeridian < meridians.length) {
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = accentAlpha;
      stroke(meridians[accentMeridian], rotation, tilt, true);
      ctx.lineWidth = 1;
      ctx.strokeStyle = baseStroke;
    }
    ctx.globalAlpha = 1;
    canvas.dataset.globeAccentAlpha = accentAlpha.toFixed(2);
  }

  function tick(now) {
    const time = now || 0;
    if (accentAlpha !== accentAlphaTarget) {
      const dt = lastTick ? Math.min(48, time - lastTick) : 16;
      const step = reduce.matches ? 1 : dt / 150;
      const delta = accentAlphaTarget - accentAlpha;
      accentAlpha = Math.abs(delta) <= step ? accentAlphaTarget : accentAlpha + Math.sign(delta) * step;
    }
    if (accentAlpha === 0 && accentColor && !previewColor && !committedColor) {
      accentTopic = '';
      accentColor = '';
      accentMeridian = -1;
    }
    lastTick = time;
    pointerYaw += (targetYaw - pointerYaw) * 0.08;
    pointerTilt += (targetTilt - pointerTilt) * 0.08;
    draw(time * 0.00022 + pointerYaw, baseTilt + pointerTilt);
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
    targetYaw = 0;
    targetTilt = 0;
    pointerYaw = 0;
    pointerTilt = 0;
    draw(still, baseTilt);
  }

  function writeCommittedGlobe() {
    if (committedColor && meridianByTopic.has(committedId)) {
      canvas.style.setProperty('--globe-accent', committedColor);
      canvas.dataset.globeTopic = committedId;
      canvas.dataset.globeMeridian = String(meridianByTopic.get(committedId));
    } else {
      canvas.style.removeProperty('--globe-accent');
      delete canvas.dataset.globeTopic;
      delete canvas.dataset.globeMeridian;
    }
    if (previewColor && meridianByTopic.has(previewId)) {
      canvas.dataset.globePreview = previewId;
      canvas.dataset.globePreviewMeridian = String(meridianByTopic.get(previewId));
    } else {
      delete canvas.dataset.globePreview;
      delete canvas.dataset.globePreviewMeridian;
    }
  }

  // Hover preview fades over 150ms. A committed selection snaps on, so a click does not animate.
  function applyGlobe(fade) {
    const next = previewColor
      ? { id: previewId, color: previewColor, alpha: 0.5 }
      : committedColor
        ? { id: committedId, color: committedColor, alpha: 1 }
        : { id: '', color: '', alpha: 0 };
    const instant = !fade || reduce.matches;
    accentAlphaTarget = next.alpha;
    if (next.color && meridianByTopic.has(next.id)) {
      const changed = next.id !== accentTopic || next.color !== accentColor;
      accentTopic = next.id;
      accentColor = next.color;
      accentMeridian = meridianByTopic.get(next.id);
      if (instant) accentAlpha = next.alpha;
      else if (changed) accentAlpha = 0;
    } else if (instant || accentAlpha === 0) {
      accentTopic = '';
      accentColor = '';
      accentMeridian = -1;
      accentAlpha = 0;
    }
    writeCommittedGlobe();
    if (!running) {
      accentAlpha = accentAlphaTarget;
      if (!accentAlpha && !next.color) {
        accentTopic = '';
        accentColor = '';
        accentMeridian = -1;
      }
      draw(0.8, baseTilt);
    } else canvas.dataset.globeAccentAlpha = accentAlpha.toFixed(2);
  }

  syncNewsroomGlobeAccent = topic => {
    committedId = topic?.id || '';
    committedColor = topic?.color || '';
    previewId = '';
    previewColor = '';
    applyGlobe(false);
  };
  previewNewsroomGlobe = topic => {
    if (!matchMedia('(hover: hover)').matches || !topic?.id || !topic.color) return;
    previewId = topic.id;
    previewColor = topic.color;
    applyGlobe(true);
  };
  clearNewsroomGlobePreview = () => {
    if (!previewColor) return;
    previewId = '';
    previewColor = '';
    applyGlobe(true);
  };

  const band = canvas.closest('.coverage-pulse-band') || canvas;
  band.addEventListener('pointermove', event => {
    if (reduce.matches) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nx = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1));
    const ny = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1));
    targetYaw = nx * 0.28;
    targetTilt = ny * 0.18;
  });
  band.addEventListener('pointerleave', () => {
    targetYaw = 0;
    targetTilt = 0;
  });

  size();
  reduce.matches ? stop() : start();
  reduce.addEventListener('change', () => {
    if (reduce.matches) accentAlpha = accentAlphaTarget;
    reduce.matches ? stop() : start();
  });
  new ResizeObserver(() => { size(); if (!running) draw(0.8, baseTilt); }).observe(canvas);
  new IntersectionObserver(([entry]) => {
    if (reduce.matches) return;
    entry.isIntersecting ? start() : stop();
  }).observe(canvas);
}
