import { itemMatchesQuery } from './search.js';

function readSearchIndex() {
  const node = document.getElementById('nfs-search-index');
  if (!node) return { posts: [], tools: [] };
  try {
    const data = JSON.parse(node.textContent);
    return {
      posts: Array.isArray(data.posts) ? data.posts : [],
      tools: Array.isArray(data.tools) ? data.tools : [],
    };
  } catch {
    return { posts: [], tools: [] };
  }
}

function collectResults(index, articles, query) {
  const q = String(query || '').trim().toLowerCase();
  const posts = index.posts.filter(item => itemMatchesQuery(item, q)).map(item => ({ ...item, kind: 'post', group: 'Posts' }));
  const tools = index.tools.filter(item => itemMatchesQuery(item, q)).map(item => ({ ...item, kind: 'tool', group: 'Tools' }));
  const headlines = articles
    .filter(item => item && typeof item.title === 'string' && typeof item.url === 'string' && itemMatchesQuery({ title: item.title, description: item.summary, source: item.source }, q))
    .slice(0, q ? 20 : 8)
    .map(item => ({
      title: item.title,
      href: item.url,
      description: item.source || '',
      kind: 'news',
      group: 'Newsroom',
      external: true,
    }));
  return [...posts, ...tools, ...headlines];
}


function initSite() {
  // Newsroom uses this file too; skip menu wiring if the page has no hamburger.
  const menu = document.querySelector('.site-menu');
  if (menu) {
    menu.addEventListener('toggle', () => {
      menu.querySelector('summary').setAttribute('aria-label', menu.open ? 'Close navigation menu' : 'Open navigation menu');
      document.documentElement.classList.toggle('nav-open', menu.open);
    });
    document.addEventListener('click', event => {
      if (!menu.contains(event.target)) menu.open = false; // click outside closes the menu
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menu.open && !document.querySelector('.command-palette:not([hidden])')) {
        menu.open = false;
        menu.querySelector('summary').focus(); // return focus to the hamburger
      }
    });
  }

  const index = readSearchIndex();
  const root = document.createElement('div');
  root.className = 'command-palette';
  root.hidden = true;
  root.innerHTML = `
    <div class="command-palette-backdrop" data-palette-dismiss="true"></div>
    <div class="command-palette-dialog" role="dialog" aria-modal="true" aria-labelledby="command-palette-title">
      <div class="command-palette-heading"><p id="command-palette-title" class="command-palette-title">Search the site</p><button type="button" class="command-palette-close" aria-label="Close search" data-palette-dismiss="true">×</button></div>
      <input id="command-palette-input" type="search" maxlength="200" aria-label="Search posts, tools, and headlines" role="combobox" aria-autocomplete="list" aria-controls="command-palette-results" aria-expanded="true" placeholder="Search posts, tools, and headlines" autocomplete="off" spellcheck="false">
      <ul id="command-palette-results" class="command-palette-results" role="listbox" tabindex="-1"></ul>
      <p class="command-palette-empty" hidden>No matching posts, tools, or headlines.</p>
      <p class="command-palette-status" role="status" aria-live="polite"></p><p class="command-palette-hint"><kbd>↑↓</kbd> navigate · <kbd>↵</kbd> open · <kbd>esc</kbd> close</p>
    </div>`;
  document.body.append(root);
  const input = root.querySelector('#command-palette-input');
  const list = root.querySelector('#command-palette-results');
  const empty = root.querySelector('.command-palette-empty');
  const background = [...document.body.children].filter(element => element !== root);
  let backgroundState = [];
  let headlines = [];
  let searchController = null;
  let searchTimer;
  let items = [];
  let active = 0;
  let lastFocus = null;

  function setActive(next) {
    if (!items.length) {
      active = 0;
      input.removeAttribute('aria-activedescendant');
      return;
    }
    active = (next + items.length) % items.length;
    list.querySelectorAll('[role="option"]').forEach((option, index) => {
      option.setAttribute('aria-selected', String(index === active));
      option.classList.toggle('is-active', index === active);
    });
    const current = list.querySelector('[role="option"].is-active');
    if (current) {
      input.setAttribute('aria-activedescendant', current.id);
      current.scrollIntoView({ block: 'nearest' });
    }
  }

  function renderResults(results) {
    items = results;
    list.replaceChildren();
    empty.hidden = results.length !== 0;
    let lastGroup = '';
    results.forEach((item, index) => {
      if (item.group !== lastGroup) {
        lastGroup = item.group;
        const label = document.createElement('li');
        label.className = 'command-palette-group';
        label.setAttribute('role', 'presentation');
        label.textContent = item.group;
        list.append(label);
      }
      const option = document.createElement('li');
      option.id = `command-palette-option-${index}`;
      option.className = 'command-palette-option';
      option.setAttribute('role', 'option');
      option.tabIndex = -1;
      option.dataset.index = String(index);
      const title = document.createElement('span');
      title.className = 'command-palette-option-title';
      title.textContent = item.title;
      const meta = document.createElement('span');
      meta.className = 'command-palette-option-meta';
      meta.textContent = item.description || item.group;
      option.append(title, meta);
      list.append(option);
    });
    setActive(0);
  }

  function refresh() {
    renderResults(collectResults(index, headlines, input.value));
  }
  async function searchNews() {
    searchController?.abort();
    const controller = new AbortController();
    searchController = controller;
    try {
      const response = await fetch('/api/search?query=' + encodeURIComponent(input.value.trim()), { cache: 'no-cache', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) });
      if (!response.ok) throw new Error('Headlines unavailable');
      const data = await response.json();
      if (controller.signal.aborted || root.hidden) return;
      headlines = Array.isArray(data.articles) ? data.articles : [];
      refresh();
      root.querySelector('.command-palette-status').textContent = '';
    } catch (error) {
      if (!controller.signal.aborted && !root.hidden) root.querySelector('.command-palette-status').textContent = 'Newsroom search unavailable. Posts and tools are still searchable.';
    }
  }

  function openPalette() {
    if (!root.hidden) {
      input.focus();
      input.select();
      return;
    }
    lastFocus = document.activeElement;
    menu && (menu.open = false);
    backgroundState = background.map(element => [element, element.inert]);
    background.forEach(element => { element.inert = true; });
    root.hidden = false;
    document.body.classList.add('command-palette-open');
    input.value = '';
    refresh();
    input.focus();
    searchNews();
  }

  function closePalette() {
    if (root.hidden) return;
    root.hidden = true;
    searchController?.abort();
    clearTimeout(searchTimer);
    backgroundState.forEach(([element, inert]) => { element.inert = inert; });
    document.body.classList.remove('command-palette-open');
    input.value = '';
    items = [];
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  }

  function openResult(item) {
    if (!item?.href) return;
    closePalette();
    if (item.external) {
      window.open(item.href, '_blank', 'noopener,noreferrer');
      return;
    }
    location.href = item.href;
  }

  root.addEventListener('click', event => {
    if (event.target.closest('[data-palette-dismiss]')) {
      closePalette();
      return;
    }
    const option = event.target.closest('[role="option"]');
    if (option) openResult(items[Number(option.dataset.index)]);
  });
  document.querySelector('.search-toggle')?.addEventListener('click', openPalette);
  input.addEventListener('input', () => {
    // Cancel immediately: an earlier response cannot overwrite a newer query.
    searchController?.abort();
    headlines = [];
    refresh();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(searchNews, 150);
  });
  root.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const close = root.querySelector('.command-palette-close');
    if (!event.shiftKey && document.activeElement === input) { event.preventDefault(); close.focus(); }
    else if (event.shiftKey && document.activeElement === close) { event.preventDefault(); input.focus(); }
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(active + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(active - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      openResult(items[active]);
    }
  });

  document.addEventListener('keydown', event => {
    const chord = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !event.altKey && !event.shiftKey;
    if (chord) {
      event.preventDefault();
      root.hidden ? openPalette() : closePalette();
      return;
    }
    if (event.key === 'Escape' && !root.hidden) {
      event.preventDefault();
      event.stopPropagation();
      closePalette();
    }
  }, true);
}
function startSite() {
  initSite();
  initToolboxSchematics();
  initFooterWire();
}

function initToolboxSchematics() {
  const row = document.getElementById('passkey-aaguid-lookup');
  const code = row?.querySelector('.lookup-code');
  const answer = row?.querySelector('.lookup-answer');
  if (!row || !code || !answer) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const samples = [
    ['ea9b8d66-4d01-1d21', '-3ce4-b6b48cb575d4', 'Google Password Manager'],
    ['fbfc3007-154e-4ecc', '-8c0b-6e020557d7bd', 'iCloud Keychain'],
    ['bada5566-a7aa-401f', '-bd96-45619a55120d', '1Password'],
  ];
  const defaultLines = ['xxxxxxxx-xxxx-xxxx', '-xxxx-xxxxxxxxxxxx'];
  const defaultAnswer = answer.textContent;
  let timer = 0;
  let index = 0;

  function renderLines(first, second, label) {
    code.replaceChildren(document.createTextNode(first), document.createElement('br'), document.createTextNode(second));
    answer.textContent = label;
  }

  function startCycle() {
    if (reduce.matches || timer) return;
    const [a, b, label] = samples[index % samples.length];
    renderLines(a, b, label);
    index += 1;
    timer = setInterval(() => {
      const [first, second, nextLabel] = samples[index % samples.length];
      renderLines(first, second, nextLabel);
      index += 1;
    }, 1500);
  }

  function stopCycle() {
    clearInterval(timer);
    timer = 0;
    renderLines(defaultLines[0], defaultLines[1], defaultAnswer);
  }

  row.addEventListener('pointerenter', startCycle);
  row.addEventListener('focusin', startCycle);
  row.addEventListener('pointerleave', () => { if (!row.matches(':focus-within')) stopCycle(); });
  row.addEventListener('focusout', event => { if (!row.contains(event.relatedTarget) && !row.matches(':hover')) stopCycle(); });
  reduce.addEventListener('change', () => { if (reduce.matches) stopCycle(); });
}

// One hairline wireframe above the footer name. A single slow turn; a still frame when motion is reduced.
function initFooterWire() {
  const canvas = document.querySelector('.footer-wire');
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;
  const phi = (1 + Math.sqrt(5)) / 2;
  const verts = [[-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0], [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi], [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1]]
    .map(([x, y, z]) => { const length = Math.hypot(x, y, z); return [x / length, y / length, z / length]; });
  const edges = [[0, 1], [0, 5], [0, 7], [0, 10], [0, 11], [1, 5], [1, 7], [1, 8], [1, 9], [2, 3], [2, 4], [2, 6], [2, 10], [2, 11], [3, 4], [3, 6], [3, 8], [3, 9], [4, 5], [4, 9], [4, 11], [5, 9], [5, 11], [6, 7], [6, 8], [6, 10], [7, 8], [7, 10], [8, 9], [10, 11]];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const baseTilt = 0.62;
  let frame = 0;
  let running = false;
  let targetYaw = 0;
  let targetTilt = 0;
  let pointerYaw = 0;
  let pointerTilt = 0;

  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth || 168;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = canvas.width;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function project(vertex, yaw, tilt) {
    const [x, y, z] = vertex;
    const x1 = x * Math.cos(yaw) + z * Math.sin(yaw);
    const z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
    return { x: x1, y: y * Math.cos(tilt) - z1 * Math.sin(tilt), z: y * Math.sin(tilt) + z1 * Math.cos(tilt) };
  }

  function draw(yaw, tilt = baseTilt) {
    const width = canvas.clientWidth || 168;
    const radius = width * 0.36;
    const cx = width / 2;
    const cy = width / 2;
    ctx.clearRect(0, 0, width, width);
    ctx.lineWidth = 1;
    ctx.strokeStyle = getComputedStyle(canvas).color;
    const lines = edges.map(([a, b]) => {
      const start = project(verts[a], yaw, tilt);
      const end = project(verts[b], yaw, tilt);
      return { start, end, depth: (start.z + end.z) / 2 };
    }).sort((a, b) => a.depth - b.depth);
    for (const line of lines) {
      ctx.globalAlpha = line.depth < 0 ? 0.28 : 0.9;
      ctx.beginPath();
      ctx.moveTo(cx + line.start.x * radius, cy - line.start.y * radius);
      ctx.lineTo(cx + line.end.x * radius, cy - line.end.y * radius);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function tick(now) {
    pointerYaw += (targetYaw - pointerYaw) * 0.08;
    pointerTilt += (targetTilt - pointerTilt) * 0.08;
    draw((now || 0) * 0.00018 + pointerYaw, baseTilt + pointerTilt);
    frame = requestAnimationFrame(tick);
  }

  function start() {
    if (running || reduce.matches) return;
    running = true;
    frame = requestAnimationFrame(tick);
  }

  function stop(still = 0.4) {
    running = false;
    cancelAnimationFrame(frame);
    targetYaw = 0;
    targetTilt = 0;
    pointerYaw = 0;
    pointerTilt = 0;
    draw(still, baseTilt);
  }

  const host = canvas.closest('.footer-mark') || canvas;
  host.addEventListener('pointermove', event => {
    if (reduce.matches) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nx = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1));
    const ny = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1));
    targetYaw = nx * 0.32;
    targetTilt = ny * 0.22;
  });
  host.addEventListener('pointerleave', () => {
    targetYaw = 0;
    targetTilt = 0;
  });

  size();
  reduce.matches ? stop() : start();
  reduce.addEventListener('change', () => (reduce.matches ? stop() : start()));
  new ResizeObserver(() => { size(); if (!running) draw(0.4, baseTilt); }).observe(canvas);
  new IntersectionObserver(([entry]) => {
    if (reduce.matches) return;
    entry.isIntersecting ? start() : stop();
  }).observe(canvas);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startSite, { once: true });
else startSite();
