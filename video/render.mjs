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
const engines = ['eleven', 'kokoro', 'qwen'].filter((e) => fs.existsSync(`${DIR}audio/${e}/durations.json`));
const durs = Object.fromEntries(engines.map((e) => [e, JSON.parse(fs.readFileSync(`${DIR}audio/${e}/durations.json`, 'utf8'))]));
const LABEL = {
  s04_run: 'Monthly run',
  s05_overview: 'Overview',
  s06_calls: 'Calls this week',
  s07_ai: 'Local AI · Situationsanalyse',
  s08_patterns: 'Patterns',
  s09_assistant: 'Assistant',
  s10_out: 'Excel out · Privacy',
};
const SHOTS = {
  s04_run: { shots: ['run_mapping', 'run'], focus: [0.235, 0.1, 0.885, 0.72] },
  s05_overview: { shots: ['overview', 'overview_goals'], focus: [0.235, 0.12, 0.885, 0.62] },
  s06_calls: { shots: ['calls'], focus: [0.235, 0.2, 0.885, 0.5] },
  s07_ai: { shots: ['situation'], focus: [0.585, 0.26, 0.885, 0.62] },
  s08_patterns: { shots: ['patterns'], focus: [0.235, 0.2, 0.6, 0.68] },
  s09_assistant: { shots: ['assistant'], focus: [0.55, 0.2, 0.885, 0.78] },
  s10_out: { shots: ['export'], focus: [0.235, 0.1, 0.885, 0.62] },
};
const LEAD = 0.45; // voice starts this long after the scene starts
let t = 0;
let n = 0;
const scenes = script.scenes.map((s) => {
  const vo = Math.max(...engines.map((e) => durs[e][s.id] ?? 0));
  let dur = vo + LEAD + 0.85;
  if (s.kind === 'logo') dur = Math.max(dur, 3.4);
  if (s.kind === 'end') dur = vo + LEAD + 4.2;
  if (s.kind === 'title') dur = Math.max(dur, 6);
  const out = { ...s, ...(SHOTS[s.id] ?? {}), label: LABEL[s.id], n: s.kind === 'screen' ? ++n : 0, start: +t.toFixed(3), dur: +dur.toFixed(3), voStart: +(t + LEAD).toFixed(3) };
  t += dur;
  return out;
});
const total = +t.toFixed(3);
fs.writeFileSync(`${DIR}timings.json`, JSON.stringify({ engines, total, scenes: scenes.map(({ id, start, dur, voStart, sfx, wow, kind }) => ({ id, start, dur, voStart, sfx, wow, kind })) }, null, 1));
console.log(`engines: ${engines.join(', ')} · total ${total.toFixed(1)} s`);

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
const outFile = `${DIR}out/${preview ? 'preview' : 'video'}_silent.mp4`;
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
