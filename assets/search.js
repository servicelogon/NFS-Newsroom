// Shared by browser search and the server's cached news index.
export function searchHaystack(item = {}) {
  return [item.title, item.description ?? item.summary, item.source].filter(Boolean).join(' ').toLowerCase();
}

export function itemMatchesQuery(item, query) {
  return searchHaystack(item).includes(String(query || '').trim().toLowerCase());
}
