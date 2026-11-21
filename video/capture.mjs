// Records the real app (dev server) as 1920x1080 screenshots for the video.
// Usage: node video/capture.mjs [baseUrl]   (default http://localhost:5173)
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = new URL('./shots/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--hide-scrollbars', '--window-size=1920,1080', '--lang=de-CH'],
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));

const shot = async (name, { scrollTo } = {}) => {
  if (scrollTo) await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: 'start' }), scrollTo);
  else await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(700);
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log('shot', name);
};
const clickText = (text, sel = 'button') =>
  page.evaluate(
    (t, s) => {
      const el = [...document.querySelectorAll(s)].find((b) => b.textContent.trim().startsWith(t));
      el?.click();
      return !!el;
    },
    text,
    sel,
  );
const go = async (hash) => {
  await page.evaluate((h) => (location.hash = h), hash);
  await sleep(900);
};
const setSelect = (sel, value) =>
  page.evaluate(
    (s, v) => {
      const el = document.querySelector(s);
      if (!el) return false;
      const opt = [...el.options].find((o) => o.value === v || o.text.startsWith(v));
      if (!opt) return false;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, opt.value);
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
    sel,
    value,
  );

await page.goto(`${BASE}/#/run`, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.goto(`${BASE}/?rec=1#/run`, { waitUntil: 'networkidle0' });
await sleep(800);

// 1) Monthly run: load November, renamed column detected
await clickText('November 2026');
await sleep(3500);
await shot('run_mapping');
await clickText('Zuordnung übernehmen');
await sleep(500);
await clickText('Berechnen');
await sleep(4000);
await shot('run');

// 2) Overview
await go('#/overview');
await shot('overview');
await shot('overview_goals', { scrollTo: 'section[aria-label="Soll und Ist"]' });

// 3) Goal page (who is lagging behind)
await go('#/goal/1');
await shot('goal');

// 4) Calls: S. Keller -> Amina
await go('#/calls');
await setSelect('#calls-sw', 'S. Keller');
await sleep(600);
await page.evaluate(() => [...document.querySelectorAll('.call-row')].find((r) => r.textContent.includes('Amina'))?.click());
await sleep(600);
await shot('calls');

// 5) Situationsanalyse: Amina's report
await go('#/situation');
await setSelect('#sa-pick', 'SA_D12_8146.txt');
await sleep(1500);
await shot('situation');

// 6) Client page
await go('#/client/10482');
await shot('client');

// 7) Patterns (let the animations finish)
await go('#/patterns');
await sleep(1800);
await shot('patterns');

// 8) Excel export
await go('#/export');
await shot('export');

// 9) Assistant: "Visualisiere Ziel 2" (local model writes the explanation)
await go('#/ask');
await page.evaluate(() => [...document.querySelectorAll('.chat-example')].find((b) => b.textContent.includes('Visualisiere Ziel 2'))?.click());
for (let i = 0; i < 120; i++) {
  await sleep(1000);
  const done = await page.evaluate(() => {
    const p = document.querySelector('.bubble.bot p');
    return !!p && !document.querySelector('.typing') && !document.querySelector('.composer .muted');
  });
  if (done) break;
}
await sleep(1200);
await shot('assistant');

await browser.close();
