// Apply the saved preference before the page paints, including on navigation.
let theme = 'dark';
try { theme = localStorage.getItem('nfs-theme') === 'light' ? 'light' : 'dark'; } catch {}
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
  const menu = document.querySelector('.site-menu');
  if (menu) {
    menu.addEventListener('toggle', () => {
      menu.querySelector('summary').setAttribute('aria-label', menu.open ? 'Close navigation menu' : 'Open navigation menu');
    });
    document.addEventListener('click', event => {
      if (!menu.contains(event.target)) menu.open = false;
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menu.open && !document.querySelector('.command-palette:not([hidden])')) {
        menu.open = false;
        menu.querySelector('summary').focus();
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
