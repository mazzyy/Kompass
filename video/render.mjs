// Renders the silent video from stage.html, frame by frame (30 fps), and writes timings.json for the audio mix.
// Scene length = longest voice-over among the engines that exist (audio/<engine>/durations.json) + padding,
// so the same picture fits all three voice versions.
// Usage: node video/render.mjs [--preview]   (--preview renders every 4th second only, for a quick look)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const DIR = new URL('./', import.meta.url).pathname;
const FPS = 30;
const preview = process.argv.includes('--preview');
const script = JSON.parse(fs.readFileSync(`${DIR}script.json`, 'utf8'));
// One cut per voice: scene lengths follow that voice exactly (no silent gaps).
const engine = process.argv.find((x) => ['eleven', 'kokoro', 'qwen'].includes(x)) ?? 'eleven';
const dur = JSON.parse(fs.readFileSync(`${DIR}audio/${engine}/durations.json`, 'utf8'));
const appDur = fs.existsSync(`${DIR}audio/app/durations.json`) ? JSON.parse(fs.readFileSync(`${DIR}audio/app/durations.json`, 'utf8')) : {};
const LEAD = 0.2; // voice starts this long after the scene starts
const TAIL = 0.35; // and the scene ends this long after the voice
const APP_GAP = 0.35; // pause between the narrator and the app's own voice
let t = 0;
const scenes = script.scenes.map((s) => {
  const vo = dur[s.id] ?? 0;
  const app = s.app ? appDur[s.id] ?? 0 : 0;
  let d = LEAD + vo + (app ? APP_GAP + app : 0) + TAIL;
  if (s.kind === 'countdown') d = Math.max(d, 4.2);
  if (s.kind === 'logo') d = Math.max(d, 2.8);
  if (s.kind === 'statement') d = Math.max(d, 2.4 + 0.6 * s.lines.length);
  if (s.kind === 'end') d = LEAD + vo + 3.2;
  const out = { ...s, start: +t.toFixed(3), dur: +d.toFixed(3), voStart: +(t + LEAD).toFixed(3), appStart: app ? +(t + LEAD + vo + APP_GAP).toFixed(3) : undefined, appEnd: app ? +(t + LEAD + vo + APP_GAP + app).toFixed(3) : undefined };
  t += d;
  return out;
});
const total = +t.toFixed(3);
fs.writeFileSync(`${DIR}timings_${engine}.json`, JSON.stringify({ engine, total, scenes: scenes.map(({ id, start, dur, voStart, appStart, sfx, wow, kind }) => ({ id, start, dur, voStart, appStart, sfx, wow, kind })) }, null, 1));
console.log(`${engine} · total ${total.toFixed(1)} s`);

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--allow-file-access-from-files', '--hide-scrollbars', '--force-color-profile=srgb'],
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
await page.goto(`file://${DIR}stage.html`, { waitUntil: 'load' });
await page.evaluate((cfg, excel) => window.setup(cfg, excel), { scenes, total }, JSON.parse(fs.readFileSync(`${DIR}excel.json`, 'utf8')));
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => Promise.all([...document.images].map((i) => (i.complete ? 1 : new Promise((r) => (i.onload = i.onerror = r))))));

fs.mkdirSync(`${DIR}out`, { recursive: true });
const outFile = `${DIR}out/${preview ? 'preview' : 'video'}_${engine}_silent.mp4`;
const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(preview ? 1 : FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), outFile], { stdio: ['pipe', 'inherit', 'inherit'] });
const frames = preview ? Math.ceil(total / 1) : Math.ceil(total * FPS);
const t0 = Date.now();
for (let i = 0; i < frames; i++) {
  const time = preview ? i : i / FPS;
  await page.evaluate((x) => window.render(x), time);
  const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % 300 === 0) console.log(`frame ${i}/${frames} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
console.log('wrote', outFile);
