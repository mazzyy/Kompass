// Records the assistant answering an English question (EN interface) and saves its exact answer text.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
const BASE = process.argv[2] ?? 'http://localhost:5173';
const Q = process.argv[3] ?? 'Why are people behind on goal 1?';
const OUT = new URL('./shots/', import.meta.url).pathname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'], defaultViewport: { width: 1920, height: 1080 } });
const page = await browser.newPage();
await page.goto(`${BASE}/#/run`, { waitUntil: 'networkidle0' });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('ic.lang', '"en"'); });
await page.goto(`${BASE}/?ask=1#/run`, { waitUntil: 'networkidle0' });
await sleep(800);
const click = (t) => page.evaluate((x) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(x))?.click(), t);
await click('November 2026'); await sleep(3500);
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Accept|übernehmen/i.test(b.textContent))?.click()); await sleep(500);
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /^(Run|Berechnen)$/.test(b.textContent.trim()))?.click()); await sleep(4000);
await page.evaluate(() => (location.hash = '#/ask')); await sleep(1200);
await page.type('.composer-input', Q);
await page.keyboard.press('Enter');
for (let i = 0; i < 120; i++) {
  await sleep(1000);
  if (await page.evaluate(() => !!document.querySelector('.bubble.bot p') && !document.querySelector('.typing') && !document.querySelector('.composer .muted'))) break;
}
await sleep(1500);
const answer = await page.evaluate(() => document.querySelector('.bubble.bot p')?.innerText ?? '');
fs.writeFileSync(new URL('./answer_en.txt', import.meta.url), answer);
await page.screenshot({ path: `${OUT}assistant_en.png` });
console.log(answer);
await browser.close();
