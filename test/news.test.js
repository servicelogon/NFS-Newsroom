import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const backend = await import('../server.js').catch(() => ({}));
test('disk TTL cache coalesces refreshes and preserves stale data with errors', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'beacon-cache-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const cacheFile = join(dir, 'cache.json');
  let calls = 0, time = Date.now(), offline = false;
  const options = { cacheFile, ttlMs: 100, now: () => time, fetchImpl: async () => {
    calls++;
    if (offline) return new Response('blocked', { status: 403 });
    return new Response(fixture);
  } };
  const service = backend.createNewsService(options);
  const [first] = await Promise.all([service.getNews(), service.getNews()]);
  assert.equal(calls, backend.FEEDS.length);
  await service.getNews();
  assert.equal(calls, backend.FEEDS.length);
  assert.ok(JSON.parse(await readFile(cacheFile, 'utf8')));
  const restarted = backend.createNewsService(options);
  await restarted.getNews();
  assert.equal(calls, backend.FEEDS.length);
  time += 101; offline = true;
  const stale = await restarted.getNews();
  assert.deepEqual(stale.articles, first.articles);
  assert.equal(stale.updatedAt, first.updatedAt);
  assert.ok(stale.sources.every(s => s.status === 'stale' && /403/.test(s.error)));
});
test('upstream failures, malformed XML, size limits, timeout and redirects are bounded', async t => {
  for (const mode of ['http', 'xml', 'size', 'timeout', 'redirect']) {
    const service = await setup(t, { timeoutMs: 20, maxBytes: 1000, fetchImpl: async (_url, options) => {
      if (!options?.signal) return new Response(fixture);
      if (mode === 'http') return new Response('denied', { status: 403 });
      if (mode === 'xml') return new Response('<broken');
      if (mode === 'size') return new Response('x'.repeat(1001));
      if (mode === 'redirect') { assert.equal(options.redirect, 'error'); return new Response('', { status: 302 }); }
      return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('timeout'))));
    } });
    const result = await service.getNews();
    assert.equal(result.articles.length, 0, mode);
    assert.equal(result.updatedAt, null);
    assert.ok(result.sources.every(s => s.status === 'error' && s.error), mode);
  }
});
test('health check is public JSON and does not fetch news', async t => {
  let calls = 0;
  const server = backend.createAppServer({ service: { getNews: async () => { calls++; return { articles: [], sources: [] }; } } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.match(health.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await health.json(), { ok: true });
  const head = await fetch(`${base}/health`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal(calls, 0);
});
test('HTTP serves app and API only, rejects arbitrary files and user feed URLs', async t => {
  assert.equal(typeof backend.createAppServer, 'function');
  const service = await setup(t);
  const server = backend.createAppServer({ service });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<!doctype html>/i);
  const logo = await fetch(`${base}/assets/newsroom-logo.png`);
  assert.equal(logo.status, 200);
  assert.match(logo.headers.get('content-type'), /image\/png/);
  const states = await fetch(`${base}/assets/newsroom-states.js`);
  assert.equal(states.status, 200);
  assert.match(states.headers.get('content-type'), /javascript/);
  assert.match(await states.text(), /describeEmptyState/);
  const weather = await fetch(`${base}/assets/threat-weather.js`);
  assert.equal(weather.status, 200);
  assert.match(weather.headers.get('content-type'), /javascript/);
  assert.match(await weather.text(), /describeThreatWeather/);
  const api = await fetch(`${base}/api/news`);
  assert.equal(api.status, 200);
  assert.equal(api.headers.get('cache-control'), 'public, max-age=60, stale-while-revalidate=300');
  assert.equal((await api.json()).articles.length, 1);
  for (const path of ['/server.js', '/package.json', '/.cache/news.json', '/.git/config', '/index.previous.html', '/api/news?url=http://localhost']) {
    const response = await fetch(base + path);
    assert.equal(response.status, path.includes('?') ? 400 : 404, path);
    assert.equal(response.headers.get('cache-control'), 'no-store', path);
  }
  assert.equal((await fetch(base + '/api/news', { method: 'POST' })).status, 405);
});
test('catalog changes preserve cached batches by source name and refresh additions', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'beacon-migrate-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const cacheFile = join(dir, 'news.json');
  const feeds = [{name: 'New', url: 'https://example.com/new'}, {name: 'Old', url: 'https://example.com/old'}];
  const saved = {id:'saved', title:'Saved', url:'https://example.com/saved', source:'Old', category:'operations', publishedAt:null, summary:''};
  await writeFile(cacheFile, JSON.stringify({version:1, checkedAt:Date.now(), updatedAt:null, batches:[{source:{name:'Old',status:'ok'},articles:[saved]}, {source:{name:'Removed',status:'ok'},articles:[]}]}));
  let calls = 0;
  const result = await backend.createNewsService({feeds,cacheFile, fetchImpl:async()=>{calls++; throw new Error('offline');}}).getNews();
  assert.equal(calls, 2);
  assert.deepEqual(result.sources.map(s=>[s.name,s.status]), [['New','error'],['Old','stale']]);
  assert.deepEqual(result.articles,[saved]);
});
test('large catalogs bound concurrency and stop queued work at total deadline', async t => {
  const feeds = Array.from({length:40}, (_,i)=>({name:`Feed ${i}`,url:`https://example.com/${i}`}));
  let active=0, peak=0, calls=0;
  const service = await setup(t, {feeds, concurrency:4, totalTimeoutMs:80, timeoutMs:1000, fetchImpl:async (_url,{signal})=>{
    calls++; active++; peak=Math.max(peak,active);
    return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{active--; reject(signal.reason);},{once:true}));
  }});
  const start=performance.now(); const result=await service.getNews();
  assert.ok(peak<=4, `peak concurrency ${peak}`);
  assert.equal(calls,4);
  assert.ok(performance.now()-start<500);
  assert.equal(active,0);
  assert.equal(result.sources.length,40);
  assert.ok(result.sources.every(s=>s.status==='error'));
});
test('Cloud and identity topics are classified ahead of general security buckets', async t => {
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Security</title>
    <item><title>Okta OAuth token phishing campaign</title><link>https://example.com/identity</link><description>SSO session credentials targeted</description></item>
    <item><title>Kubernetes cloud posture issue</title><link>https://example.com/cloud</link><description>AWS storage bucket and container exposure</description></item>
    <item><title>Kubernetes CVE patched in cloud controller</title><link>https://example.com/cloud-cve</link><description>Azure cluster exploit fixed</description></item>
  </channel></rss>`;
  const service = await setup(t, {feeds:[{name:'Focused',url:'https://example.com/rss'}], fetchImpl:async()=>new Response(xml)});
  const byUrl = new Map((await service.getNews()).articles.map(a => [a.url, a.category]));
  assert.equal(byUrl.get('https://example.com/identity'), 'identity');
  assert.equal(byUrl.get('https://example.com/cloud'), 'cloud');
  assert.equal(byUrl.get('https://example.com/cloud-cve'), 'cloud');
});
test('Microsoft feeds keep stronger cloud, identity and vulnerability signals out of the Microsoft category', async t => {
  const service = await setup(t, {feeds:[{name:'MSRC',url:'https://example.com/rss',category:'microsoft'}]});
  const article = (await service.getNews()).articles[0];
  assert.equal(article.category, 'vulnerabilities');
  assert.equal(article.sourceCategory, 'microsoft');
});
test('verified catalog contains 21 unique feeds with six Microsoft sources including Message Center preview', () => {
  assert.equal(backend.FEEDS.length, 21);
  assert.equal(new Set(backend.FEEDS.map(f=>f.name)).size,21);
  assert.deepEqual(
    backend.FEEDS.filter(f => f.category === 'microsoft').map(f => f.name),
    [
      'Microsoft Security Blog',
      'MSRC Security Update Guide',
      'Defender for Cloud Blog',
      'Microsoft Entra Blog',
      'Microsoft Security Community',
      'MS Message Center',
    ],
  );
  assert.ok(backend.FEEDS.some(f=>f.name==='MSRC Security Update Guide'));
  assert.ok(backend.FEEDS.some(f=>f.url==='https://msmessagecenter.com/feed.xml'));
  assert.ok(backend.FEEDS.every(f=>f.url.startsWith('https://')));
});
test('default byte budget admits MSRC-sized feeds but stays bounded at 3 MB', async t => {
  for (const [size, status] of [[2_300_000,'ok'],[3_000_001,'error']]) {
    const xml = fixture.replace('</channel>', `<!--${'x'.repeat(size)}--></channel>`);
    const service=await setup(t,{feeds:[{name:'MSRC',url:'https://example.com/rss',category:'microsoft'}],fetchImpl:async()=>new Response(xml)});
    assert.equal((await service.getNews()).sources[0].status,status);
  }
});
const fixture = `<?xml version="1.0"?><rss version="2.0"><channel><title>Security</title><item><title>Critical CVE vulnerability fixed</title><link>https://example.com/story?utm_source=rss</link><pubDate>Mon, 07 Sep 2026 10:00:00 GMT</pubDate><description><![CDATA[<p><img src="https://example.com/image.jpg?utm_campaign=x" />A &amp; B patch</p>]]></description><enclosure url="https://example.com/enclosure.jpg" type="image/jpeg" /></item><item><title>Duplicate</title><link>https://example.com/story</link></item><item><title>Bad URL</title><link>javascript:alert(1)</link></item></channel></rss>`;
async function setup(t, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'beacon-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  assert.equal(typeof backend.createNewsService, 'function', 'news service exists');
  return backend.createNewsService({ cacheFile: join(dir, 'news.json'), fetchImpl: async () => new Response(fixture), ...options });
}
test('RSS produces sanitized, URL-deduplicated articles and source statuses', async t => {
  const service = await setup(t);
  const result = await service.getNews();
  assert.equal(result.articles.length, 1);
  const article = result.articles[0];
  assert.equal(article.url, 'https://example.com/story');
  assert.equal(article.title, 'Critical CVE vulnerability fixed');
  assert.equal(article.summary, 'A & B patch');
  assert.equal(article.imageUrl, 'https://example.com/enclosure.jpg');
  assert.equal(article.category, 'vulnerabilities');
  assert.equal(article.publishedAt, '2026-09-07T10:00:00.000Z');
  assert.match(article.id, /^[a-f0-9]{24}$/);
  assert.equal(result.sources.length, backend.FEEDS.length);
  assert.ok(result.sources.every(s => s.status === 'ok'));
  assert.ok(Date.parse(result.updatedAt));
});
