// Newsroom is for external publishers; NFS posts belong in Field Notes.
const ownHosts = new Set(['newfrontiersecurity.net']);
try {
  if (process.env.SITE_ORIGIN) ownHosts.add(new URL(process.env.SITE_ORIGIN).hostname.toLowerCase().replace(/\.$/, ''));
} catch { /* Invalid site metadata does not change the publisher policy. */ }

function isOwnUrl(value) {
  if (!value) return false;
  try {
    const host = new URL(value, 'https://newfrontiersecurity.net').hostname.toLowerCase().replace(/\.$/, '');
    return [...ownHosts].some(own => host === own || host.endsWith('.' + own));
  } catch { return false; }
}

export function externalNewsArticle(article) {
  if (!article || isOwnUrl(article.url) || /^(?:nfs|new frontier security)(?: (?:blog|field notes|newsroom))?$/i.test(String(article.source || '').trim().replace(/\s+/g, ' '))) return null;
  if (isOwnUrl(article.imageUrl)) {
    const { imageUrl, ...external } = article;
    return external;
  }
  return article;
}
