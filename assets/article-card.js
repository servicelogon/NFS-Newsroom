import { TOPIC_BY_ID, isMessageCenterStory, MESSAGE_CENTER_IMAGE } from './news-topics.js';
import { formatTimestamp } from './dates.js';

const safeUrl = value => {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
};
function storyMedia(imageUrl, title, lead) {
  const media = document.createElement('div');
  media.className = 'story-media';
  const image = document.createElement('img');
  image.src = imageUrl;
  image.alt = title;
  image.loading = lead ? 'eager' : 'lazy';
  image.decoding = 'async';
  if (lead) image.fetchPriority = 'high';
  image.referrerPolicy = 'no-referrer';
  image.addEventListener('error', () => media.remove(), { once: true });
  media.append(image);
  return media;
}

function storyTime(publishedAt) {
  const date = document.createElement('time');
  if (Number.isFinite(Date.parse(publishedAt))) {
    date.dateTime = publishedAt;
    date.textContent = formatTimestamp(publishedAt);
    date.title = 'Publisher publication date';
  } else date.textContent = 'Publication date unavailable';
  return date;
}

function storyBadges(story, source) {
  const badges = [];
  if (isMessageCenterStory(story)) {
    const badge = document.createElement('span');
    badge.className = 'message-center-badge';
    badge.textContent = 'Message Center';
    badge.title = 'Community RSS preview; not tenant-specific Microsoft 365 messages';
    badges.push(badge);
  }
  if (story.stale || source.status === 'stale') {
    const badge = document.createElement('span');
    badge.className = 'stale-badge';
    badge.textContent = 'Cached story';
    badge.title = source.lastSuccessAt ? `Feed last collected ${formatTimestamp(source.lastSuccessAt)}` : 'This publisher could not be refreshed';
    badges.push(badge);
  }
  return badges;
}

export function createArticleCard(story, { frontPage = false, lead = false, source = {} } = {}) {
  const href = safeUrl(story.url);
  if (!href || typeof story.title !== 'string') return null;
  const topic = TOPIC_BY_ID.get(story.category || story.topic) || TOPIC_BY_ID.get('operations');
  const title = isMessageCenterStory(story) ? story.title.replace(/^MC\d+\s*[–—:-]\s*/i, '') : story.title;
  const article = document.createElement('article');
  article.className = `${frontPage ? 'front-page-story' : 'story'}${lead ? ' lead-story' : ' story-row'}`;
  article.dataset.articleId = story.id;
  article.style.setProperty('--topic-color', topic.color);
  if (isMessageCenterStory(story)) article.classList.add('message-center-story');
  const tag = document.createElement('span');
  tag.className = 'topic';
  tag.textContent = topic.name;
  const date = storyTime(story.publishedAt);
  const publisher = document.createElement('span');
  publisher.className = 'story-source';
  publisher.textContent = story.source || 'Publisher';
  const heading = document.createElement('h2');
  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = title;
  heading.append(link);
  const badges = storyBadges(story, source);
  const imageUrl = isMessageCenterStory(story) ? MESSAGE_CENTER_IMAGE : safeUrl(story.imageUrl);
  if (imageUrl) article.append(storyMedia(imageUrl, title, lead));
  const copy = document.createElement('div');
  copy.className = 'story-copy';
  const meta = document.createElement('div');
  meta.className = 'story-meta';
  meta.append(publisher, tag, ...badges);
  copy.append(date, heading);
  if (lead && story.summary) {
    const deck = document.createElement('p');
    deck.className = 'story-deck';
    deck.textContent = story.summary;
    copy.append(deck);
  }
  copy.append(meta);
  article.append(copy);
  return article;
}
