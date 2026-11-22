// One topic and Microsoft-view contract for the API and the newsroom.
export const TOPICS = [
  { id: 'all', name: 'All coverage', description: 'Cloud, identity, AI, and the surrounding security picture.', color: '#84cc16' },
  { id: 'cloud', name: 'Cloud security', description: 'Cloud platforms, SaaS, containers, and supply chain exposure.', color: '#3b82f6' },
  { id: 'identity', name: 'Identity security', description: 'Access, authentication, tokens, and account compromise.', color: '#a855f7' },
  { id: 'ai', name: 'AI security', description: 'AI, LLM, Copilot, and agentic security across identity and cloud.', color: '#06b6d4' },
  { id: 'vulnerabilities', name: 'Vulnerabilities', description: 'Exploitation, advisories, and the decisions behind a patch.', color: '#ef4444' },
  { id: 'incidents', name: 'Incidents', description: 'Incidents and the lessons that follow.', color: '#f97316' },
  { id: 'malware', name: 'Malware & ransomware', description: 'Evolving tactics and defensive context.', color: '#ec4899' },
  { id: 'operations', name: 'Security operations', description: 'Detection, governance, and resilient systems.', color: '#10b981' },
  { id: 'microsoft', name: 'Microsoft', description: 'Microsoft News and community Message Center updates, excluding CVE advisories.', color: '#6366f1' },
];
export const TOPIC_BY_ID = new Map(TOPICS.map(topic => [topic.id, topic]));
const TAG_TOPICS = [
  [/entra|identity|azure|mfa|conditional access|hybrid|hardening/, 'identity'],
  [/\bai\b|llm|copilot|chatgpt|openai|agentic/, 'ai'],
  [/microsoft/, 'microsoft'],
  [/phish|evilginx|hijack|malware|ransom/, 'malware'],
  [/incident|breach/, 'incidents'],
  [/vulnerab|cve|exploit/, 'vulnerabilities'],
  [/cloud|saas|container/, 'cloud'],
  [/security|cyber|operat/, 'operations'],
];
// One vivid color per label. Known words use the newsroom topic; anything else stays vivid and stable.
export function categoryColor(label) {
  const text = String(label || '').toLowerCase();
  for (const [pattern, id] of TAG_TOPICS) if (pattern.test(text)) return TOPIC_BY_ID.get(id).color;
  const palette = TOPICS.filter(topic => topic.id !== 'all');
  let hash = 0;
  for (const char of text) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length].color;
}
const MICROSOFT_NEWS = new Set(['Microsoft Security Blog', 'Defender for Cloud Blog', 'Microsoft Entra Blog', 'Microsoft Security Community']);
export const MESSAGE_CENTER_IMAGE = '/assets/mmc-logo.webp';
export const isMessageCenterStory = story => story.source === 'MS Message Center';
export function isMicrosoftStory(story) {
  return !/\bCVE(?:-\d{4}-\d{4,7})?\b/i.test([story.title, story.summary].join(' ')) &&
    (isMessageCenterStory(story) || MICROSOFT_NEWS.has(story.source));
}
export function matchesTopic(story, topic = 'all', microsoftFilter = 'all') {
  if (topic === 'all') return true;
  if (topic !== 'microsoft') return (story.category || story.topic) === topic;
  return isMicrosoftStory(story) && (microsoftFilter === 'all' ||
    (microsoftFilter === 'message-center' ? isMessageCenterStory(story) : !isMessageCenterStory(story)));
}
