// Shared chrome for blog, tools, and newsroom: theme + mobile nav.
// Apply the saved preference before the page paints, including on navigation.
let theme = 'dark';
try { theme = localStorage.getItem('nfs-theme') === 'light' ? 'light' : 'dark'; } catch {} // private mode / blocked storage is fine
document.documentElement.dataset.theme = theme;

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

function haystack(item) {
  return [item.title, item.description, item.source].filter(Boolean).join(' ').toLowerCase();
}

function matchesQuery(item, query) {
  return !query || haystack(item).includes(query);
}

function newsFromPage() {
  return Array.isArray(window.nfsNewsArticles) ? window.nfsNewsArticles : null;
}

let newsPromise = null;
function loadNewsHeadlines() {
  const cached = newsFromPage();
  if (cached) return Promise.resolve(cached);
  if (!newsPromise) {
    newsPromise = fetch('/api/news', { signal: AbortSignal.timeout(15000) })
      .then(response => {
        if (!response.ok) throw new Error('News request failed');
        return response.json();
      })
      .then(data => {
        const articles = Array.isArray(data.articles) ? data.articles : [];
        window.nfsNewsArticles = articles;
        return articles;
      })
      .catch(() => newsFromPage() || []);
  }
  return newsPromise;
}

function collectResults(index, articles, query) {
  const q = String(query || '').trim().toLowerCase();
  const posts = index.posts.filter(item => matchesQuery(item, q)).map(item => ({ ...item, kind: 'post', group: 'Posts' }));
  const tools = index.tools.filter(item => matchesQuery(item, q)).map(item => ({ ...item, kind: 'tool', group: 'Tools' }));
  const headlines = articles
    .filter(item => item && typeof item.title === 'string' && typeof item.url === 'string' && matchesQuery({ title: item.title, description: item.summary, source: item.source }, q))
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
// shooting stars and a warp boost while the logo is hovered. Only animates on
// screen; reduced motion gets a single still frame.
function initFooterSky() {
  const mark = document.querySelector('.footer-mark');
  const canvas = mark?.querySelector('.footer-starfield');
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;
  const logo = mark.querySelector('.footer-logo');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const TAU = Math.PI * 2;
  const palette = ['#ffffff', '#ffffff', '#f4f7ff', '#d7e4ff', '#b9d3ff', '#9ec5ff', '#ffeccc', '#edb3c7'];
  const pick = list => list[Math.floor(Math.random() * list.length)];
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

  function makeStar(x) {
    const z = Math.random() ** 1.7;
    return { x, y: Math.random() * height, z, r: 0.35 + z * 1.25, color: pick(palette), phase: Math.random() * TAU, rate: 0.5 + Math.random() * 2.4 };
  }

  function seed() {
    const count = Math.round(Math.min(460, (width * height) / 2400));
    stars = Array.from({ length: count }, () => makeStar(Math.random() * width));
    beacons = Array.from({ length: Math.max(3, Math.round(width / 240)) }, () => ({
      ...makeStar(Math.random() * width),
      y: height * (0.3 + Math.random() * 0.5),
      z: 0.55 + Math.random() * 0.45,
      r: 1.3 + Math.random() * 0.9,
      color: pick(['#ffffff', '#d7e4ff', '#fff6cf', '#f7ff00']),
    }));
    meteors = [];
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
      length: 140 + Math.random() * 180,
      age: 0,
      life: 0.8 + Math.random() * 0.6,
      tint: Math.random() < 0.3 ? '247, 255, 0' : '158, 197, 255',
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

  function draw() {
    ctx.clearRect(0, 0, width, height);
    const streak = warp * 70;
    for (const star of stars) {
      const x = star.x + pointer.x * star.z * 26;
      const y = star.y + pointer.y * star.z * 16;
      const alpha = (0.3 + 0.7 * star.z) * (0.62 + 0.38 * Math.sin(clock * star.rate + star.phase));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = star.color;
      if (streak * star.z > 1.5) {
        ctx.strokeStyle = star.color;
        ctx.lineWidth = star.r * 1.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + streak * star.z * star.z * 2, y);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, star.r, 0, TAU);
        ctx.fill();
      }
    }
    for (const beacon of beacons) {
      const x = beacon.x + pointer.x * beacon.z * 26;
      const y = beacon.y + pointer.y * beacon.z * 16;
      const pulse = 0.55 + 0.45 * Math.sin(clock * beacon.rate * 0.6 + beacon.phase);
      const glow = ctx.createRadialGradient(x, y, 0, x, y, beacon.r * 9);
      glow.addColorStop(0, beacon.color);
      glow.addColorStop(0.18, 'rgba(158, 197, 255, 0.35)');
      glow.addColorStop(1, 'rgba(158, 197, 255, 0)');
      ctx.globalAlpha = 0.5 + pulse * 0.5;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, beacon.r * 9, 0, TAU);
      ctx.fill();
      const spike = beacon.r * (7 + pulse * 7 + warp * 20);
      ctx.strokeStyle = beacon.color;
      ctx.lineWidth = 0.7;
      ctx.globalAlpha = 0.25 + pulse * 0.45;
      ctx.beginPath();
      ctx.moveTo(x - spike * (1 + warp * 2), y);
      ctx.lineTo(x + spike * (1 + warp * 2), y);
      ctx.moveTo(x, y - spike * 0.8);
      ctx.lineTo(x, y + spike * 0.8);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, beacon.r * 0.75, 0, TAU);
      ctx.fill();
    }
    for (const meteor of meteors) {
      const fade = Math.sin(Math.PI * (meteor.age / meteor.life));
      const speed = Math.hypot(meteor.vx, meteor.vy);
      const tailX = meteor.x - (meteor.vx / speed) * meteor.length * fade;
      const tailY = meteor.y - (meteor.vy / speed) * meteor.length * fade;
      const tail = ctx.createLinearGradient(meteor.x, meteor.y, tailX, tailY);
      tail.addColorStop(0, `rgba(255, 255, 255, ${0.95 * fade})`);
      tail.addColorStop(0.25, `rgba(${meteor.tint}, ${0.45 * fade})`);
      tail.addColorStop(1, `rgba(${meteor.tint}, 0)`);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = tail;
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(meteor.x, meteor.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();
      ctx.fillStyle = `rgba(255, 255, 255, ${fade})`;
      ctx.beginPath();
      ctx.arc(meteor.x, meteor.y, 1.6, 0, TAU);
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
  logo?.addEventListener('pointerenter', () => {
    warpTarget = 1;
    mark.classList.add('is-warping');
  });
  logo?.addEventListener('pointerleave', () => {
    warpTarget = 0;
    mark.classList.remove('is-warping');
  });
  new ResizeObserver(resize).observe(canvas);
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

document.addEventListener('DOMContentLoaded', () => {
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
      <p id="command-palette-title" class="command-palette-title">Search the site</p>
      <input id="command-palette-input" type="search" role="combobox" aria-autocomplete="list" aria-controls="command-palette-results" aria-expanded="true" placeholder="Search posts, tools, and headlines" autocomplete="off" spellcheck="false">
      <ul id="command-palette-results" class="command-palette-results" role="listbox"></ul>
      <p class="command-palette-empty" hidden>No matching posts, tools, or headlines.</p>
      <p class="command-palette-hint">↑↓ to move · Enter to open · Esc to close</p>
    </div>`;
  document.body.append(root);
  const input = root.querySelector('#command-palette-input');
  const list = root.querySelector('#command-palette-results');
  const empty = root.querySelector('.command-palette-empty');
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
    renderResults(collectResults(index, newsFromPage() || [], input.value));
  }

  function openPalette() {
    if (!root.hidden) {
      input.focus();
      input.select();
      return;
    }
    lastFocus = document.activeElement;
    menu && (menu.open = false);
    root.hidden = false;
    document.body.classList.add('command-palette-open');
    input.value = '';
    refresh();
    input.focus();
    loadNewsHeadlines().then(() => {
      if (!root.hidden) refresh();
    });
  }

  function closePalette() {
    if (root.hidden) return;
    root.hidden = true;
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
  input.addEventListener('input', refresh);
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
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActive(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActive(items.length - 1);
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
});
