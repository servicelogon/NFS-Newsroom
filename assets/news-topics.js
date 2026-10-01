// One topic and Microsoft-view contract for the API and the newsroom.
export const TOPICS = [
  { id: 'all', name: 'All coverage', description: 'Cloud, identity, and the surrounding security picture.', color: '#58e08d' },
  { id: 'cloud', name: 'Cloud security', description: 'Cloud platforms, SaaS, containers, and supply chain exposure.', color: '#f59e0b' },
  { id: 'identity', name: 'Identity security', description: 'Access, authentication, tokens, and account compromise.', color: '#c084fc' },
  { id: 'vulnerabilities', name: 'Vulnerabilities', description: 'Exploitation, advisories, and the decisions behind a patch.', color: '#ff6b6b' },
  { id: 'incidents', name: 'Incidents', description: 'Incidents and the lessons that follow.', color: '#c084fc' },
  { id: 'malware', name: 'Malware & ransomware', description: 'Evolving tactics and defensive context.', color: '#fb7185' },
  { id: 'operations', name: 'Security operations', description: 'Detection, governance, and resilient systems.', color: '#2dd4bf' },
  { id: 'microsoft', name: 'Microsoft', description: 'Microsoft News and community Message Center updates, excluding CVE advisories.', color: '#60a5fa' },
];
export const TOPIC_BY_ID = new Map(TOPICS.map(topic => [topic.id, topic]));
const MICROSOFT_NEWS = new Set(['Microsoft Security Blog', 'Defender for Cloud Blog', 'Microsoft Entra Blog', 'Microsoft Security Community']);
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
