export function summarizeSourceHealth(sources = []) {
  const list = Array.isArray(sources) ? sources.filter((source) => source && typeof source === 'object') : [];
  const error = list.filter((source) => source.status === 'error');
  const stale = list.filter((source) => source.status === 'stale');
  const ok = list.filter((source) => source.status === 'ok');
  return { total: list.length, error, stale, ok };
}

function joinNames(sources) {
  const names = sources.map((source) => source.name).filter(Boolean);
  if (!names.length) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  const shown = names.slice(0, 3);
  const remaining = names.length - shown.length;
  return remaining > 0 ? `${shown.join(', ')}, and ${remaining} more` : `${shown[0]}, ${shown[1]}, and ${shown[2]}`;
}

function sourceTroubleCopy(health) {
  const troubled = [...health.error, ...health.stale];
  const names = joinNames(troubled);
  if (health.error.length === health.total && health.total > 0 && !health.stale.length) {
    return names
      ? `${names} did not return stories. Try again in a moment.`
      : 'Publisher feeds did not return stories. Try again in a moment.';
  }
  if (troubled.length) {
    return names
      ? `${names} reported a problem. Check back or retry the feeds.`
      : 'Some publisher feeds reported a problem. Check back or retry the feeds.';
  }
  return 'Feeds reported no stories right now. Try again in a moment.';
}

export function describeEmptyState({
  loading = false,
  articleCount = 0,
  visibleCount = 0,
  sources = [],
  loadError = '',
  hasQuery = false,
  view = 'front-page',
} = {}) {
  if (loading || visibleCount > 0) return null;

  const health = summarizeSourceHealth(sources);
  const troubled = health.error.length + health.stale.length;
  const frontPage = view === 'front-page';

  if (articleCount === 0 && loadError) {
    return {
      kind: 'unavailable',
      eyebrow: 'Sources unavailable',
      title: frontPage ? 'The briefing could not be loaded.' : 'The briefing could not be loaded.',
      body: String(loadError),
      retry: true,
      reset: false,
    };
  }

  if (articleCount === 0 && troubled) {
    const allDown = health.error.length === health.total && health.total > 0 && health.stale.length === 0;
    return {
      kind: allDown ? 'down' : 'limited',
      eyebrow: allDown ? 'Sources down' : 'Limited coverage',
      title: allDown ? 'News sources are not responding.' : 'No stories made it through.',
      body: sourceTroubleCopy(health),
      retry: true,
      reset: false,
    };
  }

  if (articleCount === 0) {
    return {
      kind: 'empty',
      eyebrow: frontPage ? 'No headlines available' : 'No articles yet',
      title: frontPage ? 'The front page is waiting for today’s briefing.' : 'No articles to show.',
      body: health.total
        ? 'Feeds are connected, but there are no stories right now.'
        : 'Check the sources and try again.',
      retry: true,
      reset: false,
    };
  }

  return {
    kind: 'filter',
    eyebrow: 'No matching articles',
    title: 'No articles to show.',
    body: hasQuery ? 'Try another search or browse all coverage.' : 'Try another topic or browse all coverage.',
    retry: false,
    reset: true,
  };
}
