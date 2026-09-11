import { chromium } from '@playwright/test';
import fs from 'node:fs';
const b = await chromium.launch();
const p = await b.newPage();
await p.route('http://beacon.test/**', r => r.fulfill({ contentType: 'text/html', body: fs.readFileSync('index.html', 'utf8') }));
await p.goto('http://beacon.test/');
await p.waitForSelector('[data-topic=vulnerabilities]');
await p.$eval('[data-topic=vulnerabilities]', e => e.setAttribute('aria-pressed', 'true'));
console.log(await p.$eval('[data-topic=vulnerabilities]', e => ({
  matches: e.matches('.category[aria-pressed="true"]'),
  color: getComputedStyle(e).color,
  css: [...document.styleSheets[0].cssRules].filter(r => r.selectorText?.includes('aria-pressed')).map(r => r.cssText)
})));
await b.close();
