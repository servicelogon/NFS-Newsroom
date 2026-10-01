import { classifyLegacy } from './fixtures/classify-legacy.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify, selectFrontPage, CLASSIFIER_CONSTANTS } from '../topic-classifier.js';

const root = dirname(fileURLToPath(import.meta.url));
const stories = JSON.parse(await readFile(join(root, 'fixtures/classify-stories.json'), 'utf8'));

const legacyCases = [
  {
    name: 'Okta OAuth phishing is identity',
    input: { title: 'Okta OAuth token phishing campaign', summary: 'SSO session credentials targeted' },
    category: 'identity',
  },
  {
    name: 'Kubernetes posture is cloud',
    input: { title: 'Kubernetes cloud posture issue', summary: 'AWS storage bucket and container exposure' },
    category: 'cloud',
  },
  {
    name: 'Kubernetes CVE stays cloud under first-match order',
    input: { title: 'Kubernetes CVE patched in cloud controller', summary: 'Azure cluster exploit fixed' },
    category: 'cloud',
  },
  {
    name: 'Critical CVE is vulnerabilities',
    input: { title: 'Critical CVE vulnerability fixed', summary: 'A & B patch' },
    category: 'vulnerabilities',
  },
  {
    name: 'Microsoft + CVE keeps vulns with microsoft overlay',
    input: { title: 'Critical CVE vulnerability fixed', summary: 'A & B patch', forcedCategory: 'microsoft' },
    category: 'vulnerabilities',
    sourceCategory: 'microsoft',
  },
  {
    name: 'Microsoft + identity language leaves microsoft overlay',
    input: { title: 'Entra ID Conditional Access', summary: 'MFA', forcedCategory: 'microsoft' },
    category: 'identity',
    sourceCategory: 'microsoft',
  },
  {
    name: 'Microsoft without steal topics stays microsoft',
    input: { title: 'Secure Future Initiative update', summary: 'Engineering progress', forcedCategory: 'microsoft' },
    category: 'microsoft',
    sourceCategory: 'microsoft',
  },
  {
    name: 'breach wording is incidents',
    input: { title: 'Hospital data breach disclosed', summary: 'Records stolen' },
    category: 'incidents',
  },
  {
    name: 'ransomware without earlier buckets is malware',
    input: { title: 'New ransomware strain spotted', summary: 'Trojan loader dropped' },
    category: 'malware',
  },
  {
    name: 'no keywords is operations',
    input: { title: 'Quarterly board briefing', summary: 'Governance metrics' },
    category: 'operations',
  },
];

test('classifyLegacy snapshots today’s first-match regex and Microsoft overlay', () => {
  for (const item of legacyCases) {
    const result = classifyLegacy(item.input);
    assert.equal(result.category, item.category, item.name);
    if (item.sourceCategory) assert.equal(result.sourceCategory, item.sourceCategory, item.name);
    else assert.equal(result.sourceCategory, undefined, item.name);
  }
});

test('golden corpus: scored classify matches expected topic labels', () => {
  assert.ok(stories.length >= 30, 'dozens of fixture stories');
  for (const story of stories) {
    const result = classify(story);
    assert.equal(result.category, story.expected, `${story.id}: ${story.title}`);
    if (story.expectedSourceCategory) {
      assert.equal(result.sourceCategory, story.expectedSourceCategory, story.id);
    }
    assert.ok(result.topicScore >= 0 && result.topicScore <= 1, `${story.id} topicScore bounds`);
    if (story.lowScore) assert.ok(result.topicScore < 0.7, `${story.id} should be a weak title-only hit`);
    if (result.category === 'operations') {
      assert.ok(result.topicScore < CLASSIFIER_CONSTANTS.OPERATIONS_THRESHOLD, `${story.id} operations threshold`);
    }
  }
});

test('mutex: CVE/advisory beats Entra, IAM without infra stays identity, malware family vs breach', () => {
  assert.equal(classify({ title: 'CVE-2026-9 in Entra ID', summary: 'Okta-adjacent advisory' }).category, 'vulnerabilities');
  assert.equal(classify({ title: 'Azure AD Conditional Access', summary: 'MFA for guests' }).category, 'identity');
  assert.equal(classify({ title: 'LockBit builder leak', summary: 'New malware family samples' }).category, 'malware');
  assert.equal(classify({ title: 'LockBit hits a hospital', summary: 'Data breach and ransom demand' }).category, 'incidents');
});

test('Microsoft overlay needs a score gap before cloud/identity steal a Message Center item', () => {
  const weak = classify({
    title: 'MC100: Azure Information Protection rollout',
    summary: 'Admin center change',
    forcedCategory: 'microsoft',
  });
  assert.equal(weak.category, 'microsoft');
  assert.equal(weak.sourceCategory, 'microsoft');
  const strong = classify({
    title: 'Microsoft Entra Conditional Access passkeys',
    summary: 'Identity MFA phishing-resistant authentication',
    forcedCategory: 'microsoft',
  });
  assert.equal(strong.category, 'identity');
  assert.equal(strong.sourceCategory, 'microsoft');
});

test('selectFrontPage keeps cloud/identity, drops low scores, caps per source, sorts by recency', () => {
  const articles = [
    { id: 'old-cloud', category: 'cloud', topicScore: 0.9, source: 'A', publishedAt: '2026-01-01T00:00:00Z' },
    { id: 'new-cloud', category: 'cloud', topicScore: 0.9, source: 'A', publishedAt: '2026-09-01T00:00:00Z' },
    { id: 'newer-cloud', category: 'cloud', topicScore: 0.95, source: 'A', publishedAt: '2026-09-02T00:00:00Z' },
    { id: 'identity', category: 'identity', topicScore: 0.8, source: 'B', publishedAt: '2026-09-03T00:00:00Z' },
    { id: 'low', category: 'cloud', topicScore: 0.1, source: 'C', publishedAt: '2026-09-04T00:00:00Z' },
    { id: 'vuln', category: 'vulnerabilities', topicScore: 0.99, source: 'D', publishedAt: '2026-09-05T00:00:00Z' },
    { id: 'no-date', category: 'identity', topicScore: 0.7, source: 'E', publishedAt: null },
    { id: 'bad-date', category: 'cloud', topicScore: 0.7, source: 'F', publishedAt: 'not-a-date' },
  ];
  const ids = selectFrontPage(articles);
  assert.deepEqual(ids.slice(0, 3), ['identity', 'newer-cloud', 'new-cloud']);
  assert.ok(!ids.includes('newer-cloud') || !ids.includes('old-cloud') || ids.filter(id => ['old-cloud', 'new-cloud', 'newer-cloud'].includes(id)).length <= 2);
  assert.equal(ids.filter(id => ['old-cloud', 'new-cloud', 'newer-cloud'].includes(id)).length, 2);
  assert.ok(!ids.includes('low'));
  assert.ok(!ids.includes('vuln'));
  assert.ok(ids.includes('no-date'));
  assert.ok(ids.includes('bad-date'));
  assert.ok(ids.length <= CLASSIFIER_CONSTANTS.FRONT_PAGE_LIMIT);
});
