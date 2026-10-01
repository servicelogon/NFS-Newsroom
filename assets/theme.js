// Apply the saved preference before the page paints, including on navigation.
let theme = 'dark';
try { theme = localStorage.getItem('nfs-theme') === 'light' ? 'light' : 'dark'; } catch {} // private mode / blocked storage is fine
document.documentElement.dataset.theme = theme;
