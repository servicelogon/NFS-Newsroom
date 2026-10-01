const fieldText = value => String(value || '').replace(/\s+/g, ' ').trim();
export function classifyLegacy({ title = '', summary = '', rssCategories = [], forcedCategory } = {}) {
  const value = `${fieldText(title)} ${fieldText(summary)} ${fieldText(Array.isArray(rssCategories) ? rssCategories.join(' ') : rssCategories)}`;
  let detectedCategory = 'operations';
  if (/\b(identity|entra|okta|iam|sso|mfa|oauth|saml|passkey|token|session|credential|account access|phishing|voice call|social engineering)\b/i.test(value)) detectedCategory = 'identity';
  else if (/\b(cloud|aws|amazon web services|azure|gcp|google cloud|kubernetes|k8s|container|saas|cloud posture|cloud asset|storage bucket|blob storage|ci\/cd|pipeline|supply chain)\b/i.test(value)) detectedCategory = 'cloud';
  else if (/vulnerab|\bcve-|patch|zero.day|exploit/i.test(value)) detectedCategory = 'vulnerabilities';
  else if (/breach|data leak|data theft|extortion|compromise|incident|outage/i.test(value)) detectedCategory = 'incidents';
  else if (/malware|ransomware|trojan|botnet/i.test(value)) detectedCategory = 'malware';
  const category = forcedCategory === 'microsoft' && ['identity', 'cloud', 'vulnerabilities'].includes(detectedCategory)
    ? detectedCategory
    : forcedCategory || detectedCategory;
  const result = { category, topicScore: category === 'operations' ? 0 : 1 };
  if (forcedCategory) result.sourceCategory = forcedCategory;
  return result;
}
