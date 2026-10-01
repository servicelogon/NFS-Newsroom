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

// Footer sky: stars stream right-to-left past the mark (it faces right), with
// shooting stars and a warp boost while the logo is hovered. The canvas backing
// store is sized to whole device pixels and drawing snaps to that grid so stars
// stay sharp. Only animates on screen; reduced motion gets a single still frame.
function initFooterSky() {
  const mark = document.querySelector('.footer-mark');
  const canvas = mark?.querySelector('.footer-starfield');
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;
  const logo = mark.querySelector('.footer-logo');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const TAU = Math.PI * 2;
  const palette = ['#ffffff', '#ffffff', '#ffffff', '#eef3ff', '#d7e4ff', '#b9d3ff', '#ffeccc'];
  const pick = list => list[Math.floor(Math.random() * list.length)];
  let dpr = 1;
  let width = 0;
  let height = 0;
  let stars = [];
  let beacons = [];
  let meteors = [];
  let frame = 0;
  let last = 0;
  let clock = 0;
  let nextMeteor = 1.2;
  let warp = 0;
  let warpTarget = 0;
  let visible = false;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const snap = value => Math.round(value * dpr) / dpr;
  const hairline = () => 1 / dpr;

  function makeStar(x) {
    const z = Math.random() ** 1.7;
    return { x, y: Math.random() * height, z, size: z > 0.75 ? 2 : z > 0.35 ? 1.5 : 1, color: pick(palette), phase: Math.random() * TAU, rate: 0.5 + Math.random() * 2.2 };
  }

  function seed() {
    const count = Math.round(Math.min(460, (width * height) / 2200));
    stars = Array.from({ length: count }, () => makeStar(Math.random() * width));
    beacons = Array.from({ length: Math.max(3, Math.round(width / 280)) }, () => ({
      ...makeStar(Math.random() * width),
      y: height * (0.3 + Math.random() * 0.55),
      z: 0.6 + Math.random() * 0.4,
      color: pick(['#ffffff', '#e3ecff', '#fff6d8']),
    }));
    meteors = [];
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const box = mark.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(box.width * dpr));
    canvas.height = Math.max(1, Math.round(box.height * dpr));
    width = canvas.width / dpr;
    height = canvas.height / dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    seed();
    draw();
  }

  function spawnMeteor() {
    const angle = (6 + Math.random() * 18) * (Math.PI / 180);
    const speed = 700 + Math.random() * 600;
    meteors.push({
      x: width * (Math.random() * 0.75 - 0.1),
      y: height * (0.3 + Math.random() * 0.4),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      length: 120 + Math.random() * 160,
      age: 0,
      life: 0.8 + Math.random() * 0.6,
      tint: Math.random() < 0.3 ? '247, 255, 0' : '200, 220, 255',
    });
  }

  function update(dt) {
    clock += dt;
    warp += (warpTarget - warp) * Math.min(1, dt * (warpTarget ? 2.2 : 1.4));
    pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 2.5);
    pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 2.5);
    mark.style.setProperty('--sky-x', pointer.x.toFixed(3));
    mark.style.setProperty('--sky-y', pointer.y.toFixed(3));
    const boost = 1 + warp * 22;
    for (const list of [stars, beacons]) {
      for (const star of list) {
        star.x -= (3 + star.z * 24) * boost * dt;
        if (star.x < -60) {
          star.x = width + 60;
          if (list === stars) star.y = Math.random() * height;
        }
      }
    }
    nextMeteor -= dt * (1 + warp * 3);
    if (nextMeteor <= 0) {
      spawnMeteor();
      nextMeteor = 2.2 + Math.random() * 4.5;
    }
    meteors = meteors.filter(meteor => {
      meteor.age += dt;
      meteor.x += meteor.vx * dt;
      meteor.y += meteor.vy * dt;
      return meteor.age < meteor.life;
    });
  }

  function spike(x, y, dx, dy, color, alpha) {
    const line = ctx.createLinearGradient(x - dx, y - dy, x + dx, y + dy);
    line.addColorStop(0, 'rgba(255, 255, 255, 0)');
    line.addColorStop(0.5, color);
    line.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = line;
    ctx.beginPath();
    ctx.moveTo(x - dx, y - dy);
    ctx.lineTo(x + dx, y + dy);
    ctx.stroke();
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = 'butt';
    const streak = warp * 70;
    for (const star of stars) {
      const size = Math.max(hairline(), snap(star.size));
      const x = snap(star.x + pointer.x * star.z * 26 - size / 2);
      const y = snap(star.y + pointer.y * star.z * 16 - size / 2);
      ctx.globalAlpha = (0.6 + 0.4 * star.z) * (0.74 + 0.26 * Math.sin(clock * star.rate + star.phase));
      ctx.fillStyle = star.color;
      const length = streak * star.z * star.z * 2;
      if (length > 1 || star.size === 1) {
        ctx.fillRect(x, y, length > 1 ? snap(length) : size, size);
      } else {
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, star.size / 2, 0, TAU);
        ctx.fill();
      }
    }
    ctx.lineWidth = hairline();
    for (const beacon of beacons) {
      const x = snap(beacon.x + pointer.x * beacon.z * 26) + hairline() / 2;
      const y = snap(beacon.y + pointer.y * beacon.z * 16) + hairline() / 2;
      const pulse = 0.5 + 0.5 * Math.sin(clock * beacon.rate * 0.6 + beacon.phase);
      const reach = 8 + pulse * 6 + warp * 30;
      spike(x, y, reach * (1 + warp * 2), 0, beacon.color, 0.55 + pulse * 0.35);
      spike(x, y, 0, reach * 0.75, beacon.color, 0.45 + pulse * 0.35);
      ctx.globalAlpha = 1;
      ctx.fillStyle = beacon.color;
      ctx.beginPath();
      ctx.arc(x, y, 1.4, 0, TAU);
      ctx.fill();
    }
    ctx.lineWidth = Math.max(hairline(), snap(1.25));
    for (const meteor of meteors) {
      const fade = Math.sin(Math.PI * (meteor.age / meteor.life));
      const speed = Math.hypot(meteor.vx, meteor.vy);
      const tailX = meteor.x - (meteor.vx / speed) * meteor.length * fade;
      const tailY = meteor.y - (meteor.vy / speed) * meteor.length * fade;
      const tail = ctx.createLinearGradient(meteor.x, meteor.y, tailX, tailY);
      tail.addColorStop(0, `rgba(255, 255, 255, ${fade})`);
      tail.addColorStop(0.3, `rgba(${meteor.tint}, ${0.5 * fade})`);
      tail.addColorStop(1, `rgba(${meteor.tint}, 0)`);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = tail;
      ctx.beginPath();
      ctx.moveTo(meteor.x, meteor.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();
      ctx.fillStyle = `rgba(255, 255, 255, ${fade})`;
      ctx.beginPath();
      ctx.arc(meteor.x, meteor.y, 1.2, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function tick(now) {
    frame = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    update(dt);
    draw();
  }

  function start() {
    if (frame || !visible || document.hidden || reduceMotion.matches) return;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
  }

  mark.addEventListener('pointermove', event => {
    const box = mark.getBoundingClientRect();
    pointer.tx = ((event.clientX - box.left) / box.width) * 2 - 1;
    pointer.ty = ((event.clientY - box.top) / box.height) * 2 - 1;
  });
  mark.addEventListener('pointerleave', () => {
    pointer.tx = 0;
    pointer.ty = 0;
  });
  logo?.addEventListener('pointerenter', () => { warpTarget = 1; });
  logo?.addEventListener('pointerleave', () => { warpTarget = 0; });
  new ResizeObserver(resize).observe(mark);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    visible ? start() : stop();
  }).observe(mark);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  reduceMotion.addEventListener('change', () => {
    if (reduceMotion.matches) {
      stop();
      draw();
    } else {
      start();
    }
  });
}

document.addEventListener('DOMContentLoaded', initFooterSky);

function initSite() {
  const toggle = document.querySelector('.theme-toggle');
  const updateToggle = () => {
    const isLight = document.documentElement.dataset.theme === 'light';
    toggle?.setAttribute('aria-pressed', String(isLight));
    toggle?.setAttribute('aria-label', `Switch to ${isLight ? 'dark' : 'light'} mode`);
    toggle?.setAttribute('title', `Switch to ${isLight ? 'dark' : 'light'} mode`);
  };
  updateToggle();
  toggle?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('nfs-theme', next); } catch {}
    updateToggle();
  });
  // Newsroom uses this file too; skip menu wiring if the page has no hamburger.
  const menu = document.querySelector('.site-menu');
  if (menu) {
    menu.addEventListener('toggle', () => {
      menu.querySelector('summary').setAttribute('aria-label', menu.open ? 'Close navigation menu' : 'Open navigation menu');
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
      <p class="command-palette-status" role="status" aria-live="polite"></p><p class="command-palette-hint">↑↓ to move · Enter to open · Esc to close</p>
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
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSite, { once: true });
else initSite();
