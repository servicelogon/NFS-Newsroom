import { TOPIC_BY_ID, isMessageCenterStory } from './news-topics.js';

const safeUrl = value => {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
};
export function createArticleCard(story, { frontPage = false, lead = false, source = {} } = {}) {
  const href = safeUrl(story.url);
  if (!href || typeof story.title !== 'string') return null;
  const topic = TOPIC_BY_ID.get(story.category || story.topic) || TOPIC_BY_ID.get('operations');
  const article = document.createElement('article');
  article.className = frontPage ? 'front-page-story' : 'story';
  article.dataset.articleId = story.id;
  article.style.setProperty('--topic-color', topic.color);
  if (isMessageCenterStory(story)) article.classList.add('message-center-story');
  const imageUrl = safeUrl(story.imageUrl);
  if (imageUrl) {
    const media = document.createElement('div');
    media.className = 'story-media';
    const image = document.createElement('img');
    image.src = imageUrl;
    image.alt = '';
    image.loading = lead ? 'eager' : 'lazy';
    image.decoding = 'async';
    if (lead) image.fetchPriority = 'high';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => media.remove(), { once: true });
    media.append(image);
    article.append(media);
  }
  const meta = document.createElement('div');
  meta.className = 'story-meta';
  const tag = document.createElement('span');
  tag.className = 'topic';
  tag.textContent = topic.name;
  const date = document.createElement('time');
  if (Number.isFinite(Date.parse(story.publishedAt))) {
    date.dateTime = story.publishedAt;
    date.textContent = new Date(story.publishedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    date.title = 'Publisher publication date';
  } else date.textContent = 'Publication date unavailable';
  meta.append(tag, date);
  if (isMessageCenterStory(story)) {
    const badge = document.createElement('span');
    badge.className = 'message-center-badge';
    badge.textContent = 'Message Center';
    badge.title = 'Community RSS preview; not tenant-specific Microsoft 365 messages';
    meta.append(badge);
  }
  if (story.stale || source.status === 'stale') {
    const badge = document.createElement('span');
    badge.className = 'stale-badge';
    badge.textContent = 'Cached story';
    badge.title = source.lastSuccessAt ? `Feed last collected ${new Date(source.lastSuccessAt).toLocaleString()}` : 'This publisher could not be refreshed';
    meta.append(badge);
  }
  const title = isMessageCenterStory(story) ? story.title.replace(/^MC\d+\s*[–—:-]\s*/i, '') : story.title;
  const heading = document.createElement('h2');
  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = title;
  heading.append(link);
  const summary = document.createElement('p');
  summary.textContent = story.summary || '';
  const footer = document.createElement('div');
  footer.className = 'story-footer';
  const publisher = document.createElement('span');
  publisher.textContent = story.source || 'Publisher';
  const read = link.cloneNode(false);
  read.textContent = 'Read original ';
  const arrow = document.createElement('span');
  arrow.className = 'arrow-icon';
  arrow.setAttribute('aria-hidden', 'true');
  read.append(arrow);
  read.setAttribute('aria-label', `Read ${story.title} at ${story.source || 'publisher'} (opens in a new tab)`);
  footer.append(publisher, read);
  article.append(meta, heading, summary, footer);
  return article;
}
