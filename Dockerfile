# Kompass – container image for Heroku (or any Docker host). Synthetic data only.
# Builds the static app and serves it with `vite preview`, which also provides the optional /api/tts and /api/stt
# helpers (ElevenLabs; set ELEVENLABS_API_KEY as a config var to enable them, otherwise the browser voice is used).
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=development \
    PREVIEW_ALLOWED_HOSTS=all

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# Heroku sets $PORT at runtime; default 8080 for local `docker run`.
ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "npx vite preview --host 0.0.0.0 --port ${PORT} --strictPort"]
