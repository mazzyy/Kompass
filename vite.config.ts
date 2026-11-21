/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite'

// Content-Security-Policy for the built app: no external requests at all, except the local AI model
// (Ollama) on this computer. Speech from ElevenLabs goes through /api/tts on our own server ('self'),
// so the browser never talks to the cloud and never sees the API key.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "connect-src 'self' http://localhost:11434 http://127.0.0.1:11434",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ')

const csp = (): Plugin => ({
  name: 'csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<meta name="referrer"', `<meta http-equiv="Content-Security-Policy" content="${CSP}" />\n    <meta name="referrer"`),
})

/**
 * Local text-to-speech helper: POST /api/tts {text, lang, voiceId, model} -> audio/mpeg.
 * The ElevenLabs key is read from .env.local on this computer (never bundled, never sent to the browser).
 * Last safety net against personal data: client numbers, Zemis numbers, dossier numbers and dates of birth
 * are refused here even if the browser check missed them.
 */
const PERSONAL = [/\b\d{5,}\b/, /\bD\d{2}\.\d{3,}\b/i, /zemis/i, /\bK-\d+/, /geburtsdatum|date of birth/i]
const tts = (key: string | undefined): Plugin => {
  const handler: Connect.NextHandleFunction = (req: IncomingMessage, res: ServerResponse, next) => {
    if (req.url?.split('?')[0] === '/api/stt') return stt(req, res, next)
    if (req.url?.split('?')[0] !== '/api/tts') return next()
    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ available: !!key }))
      return
    }
    if (req.method !== 'POST') return next()
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', async () => {
      const fail = (code: number, msg: string) => {
        res.statusCode = code
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: msg }))
      }
      try {
        if (!key) return fail(503, 'no ELEVENLABS_API_KEY in .env.local')
        const { text, lang, voiceId, model } = JSON.parse(body || '{}') as { text?: string; lang?: string; voiceId?: string; model?: string }
        if (!text || typeof text !== 'string' || text.length > 1500) return fail(400, 'text missing or too long')
        if (PERSONAL.some((r) => r.test(text))) return fail(422, 'text looks like it contains personal data: not sent')
        if (!voiceId || !/^[A-Za-z0-9]{10,40}$/.test(voiceId)) return fail(400, 'bad voice id')
        const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
          method: 'POST',
          headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
          body: JSON.stringify({ text, model_id: model || 'eleven_multilingual_v2', language_code: lang === 'en' ? 'en' : 'de' }),
        })
        if (!r.ok) return fail(502, `ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`)
        res.setHeader('Content-Type', 'audio/mpeg')
        res.setHeader('Cache-Control', 'no-store')
        res.end(Buffer.from(await r.arrayBuffer()))
      } catch (e) {
        fail(500, String(e))
      }
    })
  }
  /**
   * Speech to text: POST /api/stt?lang=de (body = recorded audio) -> {text}. Uses ElevenLabs Speech to Text
   * (the user chose this over a local model). The spoken question goes to ElevenLabs; the UI says so.
   */
  const stt: Connect.NextHandleFunction = (req, res, next) => {
    if (req.method !== 'POST') return next()
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size <= 10 * 1024 * 1024) chunks.push(c)
    })
    req.on('end', async () => {
      const fail = (code: number, msg: string) => {
        res.statusCode = code
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: msg }))
      }
      try {
        if (!key) return fail(503, 'no ELEVENLABS_API_KEY in .env.local')
        if (size > 10 * 1024 * 1024 || size < 1000) return fail(400, 'recording too long or too short')
        const u = new URL(req.url ?? '', 'http://x')
        const lang = u.searchParams.get('lang') === 'en' ? 'en' : 'de'
        const model = /^[a-z0-9_]{3,40}$/.test(u.searchParams.get('model') ?? '') ? u.searchParams.get('model')! : 'scribe_v1'
        const type = String(req.headers['content-type'] || 'audio/webm')
        const fd = new FormData()
        fd.append('file', new Blob([Buffer.concat(chunks)], { type }), type.includes('mp4') ? 'speech.mp4' : type.includes('mpeg') ? 'speech.mp3' : 'speech.webm')
        fd.append('model_id', model)
        fd.append('language_code', lang)
        fd.append('tag_audio_events', 'false')
        const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': key }, body: fd })
        if (!r.ok) return fail(r.status === 401 ? 401 : 502, `ElevenLabs ${r.status}: ${(await r.text()).slice(0, 300)}`)
        const j = (await r.json()) as { text?: string }
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify({ text: (j.text ?? '').trim() }))
      } catch (e) {
        fail(500, String(e))
      }
    })
  }

  return {
    name: 'local-tts',
    configureServer: (s) => void s.middlewares.use(handler),
    configurePreviewServer: (s) => void s.middlewares.use(handler),
  }
}

export default defineConfig(({ mode }) => {
  // loadEnv with prefix '' reads ELEVENLABS_API_KEY for the server only; Vite exposes only VITE_* to the browser.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: './',
    plugins: [react(), csp(), tts(env.ELEVENLABS_API_KEY)],
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
    },
  }
})
