/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Content-Security-Policy for the built app: no external requests at all,
// except the local AI model (Ollama) on this computer.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
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

export default defineConfig({
  base: './',
  plugins: [react(), csp()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
