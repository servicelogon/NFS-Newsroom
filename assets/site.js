// Apply the saved preference before the page paints, including on navigation.
let theme = 'dark';
try { theme = localStorage.getItem('nfs-theme') === 'light' ? 'light' : 'dark'; } catch {}
document.documentElement.dataset.theme = theme;
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
  if (!menu) return;
  menu.addEventListener('toggle', () => {
    menu.querySelector('summary').setAttribute('aria-label', menu.open ? 'Close navigation menu' : 'Open navigation menu');
  });
  document.addEventListener('click', event => {
    if (!menu.contains(event.target)) menu.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.open) {
      menu.open = false;
      menu.querySelector('summary').focus();
    }
  });
});
