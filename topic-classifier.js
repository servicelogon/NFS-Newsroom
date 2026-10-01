// Scored topic classification and cloud/identity front-page selection.
// The former first-match classifier lives only in test fixtures.

const TITLE_WEIGHT = 1;
const RSS_WEIGHT = 0.6;
const SUMMARY_WEIGHT = 0.35;
const TITLE_ONLY_FACTOR = 0.55;
const OPERATIONS_THRESHOLD = 0.42;
const MICROSOFT_STEAL_MIN = 0.48;
const MICROSOFT_SCORE_GAP = 0.16;
const FRONT_PAGE_LIMIT = 8;
const FRONT_PAGE_MIN_SCORE = 0.4;
const FRONT_PAGE_SOURCE_CAP = 2;
const FRONT_PAGE_TOPICS = new Set(['cloud', 'identity']);
const MICROSOFT_STEAL_TOPICS = new Set(['identity', 'cloud', 'vulnerabilities']);

const TOPICS = ['identity', 'cloud', 'vulnerabilities', 'incidents', 'malware'];

function escapeRe(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compilePhrase(phrase) {
  const escaped = escapeRe(phrase).replace(/\\ /g, '\\s+');
  const bounded = /^[a-z0-9]+(?:[/-][a-z0-9]+)?$/i.test(phrase);
  return new RegExp(bounded ? `\\b${escaped}\\b` : escaped, 'i');
}

function phrases(entries) {
  return entries.map(entry => {
    const [phrase, weight = 1] = Array.isArray(entry) ? entry : [entry, 1];
    return { phrase, weight, re: compilePhrase(phrase) };
  });
}

// Phrase lists, not loose unigrams like "cloud". Weights live next to the strings.
const TOPIC_PHRASES = {
  identity: phrases([
    ['conditional access', 1.4],
    ['azure active directory', 1.3],
    ['microsoft entra', 1.3],
    ['entra id', 1.3],
    ['azure ad', 1.3],
    ['privileged identity', 1.2],
    ['identity provider', 1.15],
    ['identity security', 1.15],
    ['account takeover', 1.2],
    ['account access', 1.1],
    ['social engineering', 1.1],
    ['voice phishing', 1.2],
    ['credential stuffing', 1.2],
    ['session hijack', 1.2],
    ['token theft', 1.2],
    ['oauth token', 1.25],
    ['passwordless', 1.1],
    ['multi-factor', 1.1],
    ['multifactor', 1.1],
    ['passkey', 1.1],
    ['phishing', 1.05],
    ['vishing', 1.1],
    ['entra', 1.2],
    ['okta', 1.25],
    ['oauth', 1.05],
    ['oidc', 1.05],
    ['saml', 1.1],
    ['sso', 1.1],
    ['mfa', 1.15],
    ['iam', 1.15],
    ['identity', 1.1],
    ['credential', 0.9],
    ['credentials', 0.95],
    ['passkeys', 1.1],
    ['pim', 1.05],
    ['scim', 1.05],
  ]),
  cloud: phrases([
    ['amazon web services', 1.3],
    ['google cloud', 1.3],
    ['microsoft azure', 1.15],
    ['cloud posture', 1.4],
    ['cloud security', 1.2],
    ['cloud asset', 1.3],
    ['storage bucket', 1.3],
    ['blob storage', 1.25],
    ['s3 bucket', 1.3],
    ['supply chain', 1.1],
    ['cloud controller', 1.2],
    ['ci/cd', 1.1],
    ['kubernetes', 1.25],
    ['container', 1.05],
    ['terraform', 1.1],
    ['cloudformation', 1.1],
    ['workload identity', 1.05],
    ['defender for cloud', 1.2],
    ['k8s', 1.2],
    ['aws', 1.2],
    ['gcp', 1.2],
    ['eks', 1.15],
    ['aks', 1.15],
    ['gke', 1.15],
    ['lambda', 1.05],
    ['saas', 1.05],
    ['azure', 0.7],
  ]),
  vulnerabilities: phrases([
    ['security advisory', 1.35],
    ['security update', 1.15],
    ['zero-day', 1.3],
    ['zero day', 1.3],
    ['vulnerability', 1.15],
    ['vulnerabilities', 1.15],
    ['advisory', 1.1],
    ['exploit', 1.15],
    ['cvss', 1.2],
    ['patch tuesday', 1.2],
    ['cve-', 1.5],
    ['cve', 1.25],
    ['patch', 0.85],
  ]),
  incidents: phrases([
    ['data breach', 1.4],
    ['data leak', 1.3],
    ['data theft', 1.3],
    ['incident response', 1.2],
    ['ransomware attack', 1.25],
    ['ransom demand', 1.2],
    ['breached', 1.2],
    ['outage', 1.1],
    ['extortion', 1.2],
    ['compromise', 1.05],
    ['incident', 1.1],
    ['breach', 1.2],
  ]),
  malware: phrases([
    ['cobalt strike', 1.3],
    ['agent tesla', 1.25],
    ['infostealer', 1.2],
    ['ransomware', 1.2],
    ['lockbit', 1.3],
    ['blackcat', 1.25],
    ['alphv', 1.25],
    ['qakbot', 1.25],
    ['emotet', 1.25],
    ['trickbot', 1.25],
    ['lumma', 1.2],
    ['redline', 1.15],
    ['socgholish', 1.2],
    ['icedid', 1.2],
    ['malware', 1.2],
    ['trojan', 1.15],
    ['botnet', 1.15],
    ['akira', 1.15],
    ['clop', 1.25],
  ]),
};

const CVE_RE = /\bcve(?:-\d+)?\b/i;
const ADVISORY_RE = /\b(security advisory|security update guide|msrc)\b/i;
const ORG_BREACH_RE = /\b(data breach|data leak|data theft|breached|customers?' data|hospital|ransom demand|incident response|outage)\b/i;
const RANSOMWARE_RE = /\bransomware\b/i;
const MALWARE_FAMILY_RE = /\b(lockbit|clop|blackcat|alphv|akira|qakbot|emotet|trickbot|lumma|redline|socgholish|icedid|infostealer|cobalt strike|agent tesla|trojan|botnet)\b/i;
const IAM_RE = /\b(entra|okta|iam|sso|mfa|oauth|saml|passkey|conditional access|identity|azure ad|azure active directory)\b/i;
const INFRA_CLOUD_RE = /\b(kubernetes|k8s|aws|amazon web services|gcp|google cloud|storage bucket|blob storage|s3 bucket|container|terraform|eks|aks|gke|cloud posture|cloud asset|ci\/cd)\b/i;

function fieldText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function scoreField(text, topic) {
  if (!text) return 0;
  let score = 0;
  for (const { re, weight } of TOPIC_PHRASES[topic]) {
    if (re.test(text)) score += weight;
  }
  return score;
}

function rawScores({ title, summary, rss }) {
  const scores = Object.fromEntries(TOPICS.map(topic => [topic, 0]));
  const titleHits = Object.fromEntries(TOPICS.map(topic => [topic, 0]));
  const otherHits = Object.fromEntries(TOPICS.map(topic => [topic, 0]));
  for (const topic of TOPICS) {
    const titleScore = scoreField(title, topic);
    const rssScore = scoreField(rss, topic);
    const summaryScore = scoreField(summary, topic);
    titleHits[topic] = titleScore;
    otherHits[topic] = rssScore + summaryScore;
    scores[topic] = titleScore * TITLE_WEIGHT + rssScore * RSS_WEIGHT + summaryScore * SUMMARY_WEIGHT;
  }
  return { scores, titleHits, otherHits };
}

function applyMutex(scores, haystack) {
  const hasCve = CVE_RE.test(haystack);
  const hasAdvisory = ADVISORY_RE.test(haystack);
  if (hasCve || hasAdvisory) {
    const floor = Math.max(scores.identity, scores.cloud, scores.incidents, scores.malware) + 0.55;
    scores.vulnerabilities = Math.max(scores.vulnerabilities, floor);
  }

  const hasOrgBreach = ORG_BREACH_RE.test(haystack);
  const hasFamily = MALWARE_FAMILY_RE.test(haystack);
  const hasRansomware = RANSOMWARE_RE.test(haystack);
  if (hasFamily && !hasOrgBreach) {
    scores.malware = Math.max(scores.malware, scores.incidents + 0.35);
  } else if (hasOrgBreach && (hasRansomware || hasFamily)) {
    scores.incidents = Math.max(scores.incidents, scores.malware + 0.35);
  }

  if (IAM_RE.test(haystack) && !INFRA_CLOUD_RE.test(haystack)) {
    scores.cloud *= 0.35;
    scores.identity = Math.max(scores.identity, scores.cloud + 0.45);
  }
  return scores;
}

function ranked(scores) {
  return TOPICS.map(topic => [topic, scores[topic]]).sort((a, b) => b[1] - a[1] || TOPICS.indexOf(a[0]) - TOPICS.indexOf(b[0]));
}

function normalizeScore(raw, titleOnly) {
  const scaled = Math.min(1, Math.max(0, raw / 2.4));
  return Number((titleOnly ? scaled * TITLE_ONLY_FACTOR : scaled).toFixed(4));
}

export function classify({ title = '', summary = '', rssCategories = [], source, forcedCategory } = {}) {
  const titleText = fieldText(title);
  const summaryText = fieldText(summary);
  const rss = fieldText(Array.isArray(rssCategories) ? rssCategories.join(' ') : rssCategories);
  const haystack = `${titleText} ${summaryText} ${rss}`;
  const { scores, titleHits, otherHits } = rawScores({ title: titleText, summary: summaryText, rss });
  applyMutex(scores, haystack);
  const order = ranked(scores);
  const [winner, winnerRaw] = order[0];
  const secondRaw = order[1][1];
  const titleOnly = otherHits[winner] === 0 && titleHits[winner] > 0;
  let topicScore = winnerRaw <= 0 ? 0 : normalizeScore(winnerRaw, titleOnly);
  let category = winnerRaw >= OPERATIONS_THRESHOLD ? winner : 'operations';
  if (category === 'operations') topicScore = Number(Math.min(topicScore, OPERATIONS_THRESHOLD - 0.01).toFixed(4));

  const result = { category, topicScore };
  if (forcedCategory) result.sourceCategory = forcedCategory;

  if (forcedCategory === 'microsoft') {
    const steal = MICROSOFT_STEAL_TOPICS.has(category)
      && topicScore >= MICROSOFT_STEAL_MIN
      && (winnerRaw - secondRaw) >= MICROSOFT_SCORE_GAP;
    if (!steal) result.category = 'microsoft';
  } else if (forcedCategory && forcedCategory !== 'microsoft') {
    result.category = forcedCategory;
  }

  return result;
}

// Select a diverse set of high-confidence cloud/identity headlines.
export function selectFrontPage(articles = [], { limit = FRONT_PAGE_LIMIT, minScore = FRONT_PAGE_MIN_SCORE, sourceCap = FRONT_PAGE_SOURCE_CAP } = {}) {
  const eligible = articles.filter(article => FRONT_PAGE_TOPICS.has(article?.category) && (Number(article.topicScore) || 0) >= minScore);
  const ordered = [...eligible].sort((a, b) => {
    const tb = Date.parse(b.publishedAt);
    const ta = Date.parse(a.publishedAt);
    const nb = Number.isFinite(tb) ? tb : 0;
    const na = Number.isFinite(ta) ? ta : 0;
    if (nb !== na) return nb - na;
    return (Number(b.topicScore) || 0) - (Number(a.topicScore) || 0);
  });
  const perSource = new Map();
  const ids = [];
  for (const article of ordered) {
    const used = perSource.get(article.source) || 0;
    if (used >= sourceCap) continue;
    if (!article.id) continue;
    perSource.set(article.source, used + 1);
    ids.push(article.id);
    if (ids.length >= limit) break;
  }
  return ids;
}

export const CLASSIFIER_CONSTANTS = {
  OPERATIONS_THRESHOLD,
  MICROSOFT_STEAL_MIN,
  MICROSOFT_SCORE_GAP,
  FRONT_PAGE_LIMIT,
  FRONT_PAGE_MIN_SCORE,
  FRONT_PAGE_SOURCE_CAP,
};
