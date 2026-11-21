import { useCallback, useEffect, useRef, useState } from 'react';
import { hasPersonalData } from '../rag/ask';
import type { Rules } from '../engine/rules';

export type VoiceMode = 'local' | 'elevenlabs';
export type VoiceNote = 'personal' | 'cloud_unavailable' | 'cloud_error' | undefined;
export type VoicePhase = 'idle' | 'listening' | 'transcribing' | 'speaking';

function load(): VoiceMode | undefined {
  try {
    const v = localStorage.getItem('ic.voice');
    return v === 'local' || v === 'elevenlabs' ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Text without citation marks, ready to be spoken. */
const speakable = (t: string) => t.replace(/\s*\[(\d+|K)\]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Voice for the assistant.
 * - speak(): ElevenLabs through our own server (/api/tts; key stays in .env.local) when the text has no names
 *   or numbers, otherwise this computer's own voice (offline). Resolves when speaking has finished.
 * - listen(): records from the microphone, stops by itself after a pause, and turns speech into text with
 *   ElevenLabs Speech to Text through /api/stt.
 */
export function useVoice(rules: Rules) {
  const [mode, setModeState] = useState<VoiceMode>(() => load() ?? rules.voice?.default ?? 'elevenlabs');
  const [cloud, setCloud] = useState<boolean | undefined>();
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [speaking, setSpeaking] = useState<string | undefined>(); // id of the answer being read
  const [note, setNote] = useState<VoiceNote>();
  const [level, setLevel] = useState(0); // microphone level 0..1, for the animation
  const audio = useRef<HTMLAudioElement | null>(null);
  const done = useRef<(() => void) | null>(null);
  const rec = useRef<{ stop: () => void; cancel: () => void } | null>(null);

  useEffect(() => {
    fetch('./api/tts')
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((j: { available?: boolean }) => setCloud(!!j.available))
      .catch(() => setCloud(false));
  }, []);

  const setMode = (m: VoiceMode) => {
    setModeState(m);
    try {
      localStorage.setItem('ic.voice', m);
    } catch {
      /* not remembered */
    }
  };

  const finish = () => {
    setSpeaking(undefined);
    setPhase((p) => (p === 'speaking' ? 'idle' : p));
    const d = done.current;
    done.current = null;
    d?.();
  };

  const stop = useCallback(() => {
    audio.current?.pause();
    audio.current = null;
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const local = (text: string, lang: 'de' | 'en') => {
    if (typeof speechSynthesis === 'undefined') return finish();
    const u = new SpeechSynthesisUtterance(text);
    const want = lang === 'de' ? 'de' : 'en';
    // Only voices installed on this computer (localService), so the text does not go to an online voice.
    const v = speechSynthesis.getVoices().find((x) => x.localService && x.lang.toLowerCase().startsWith(want));
    if (v) u.voice = v;
    u.lang = v?.lang ?? (lang === 'de' ? 'de-CH' : 'en-GB');
    u.onend = finish;
    u.onerror = finish;
    speechSynthesis.speak(u);
  };

  /** Speak; resolves when finished (or stopped). */
  const speak = useCallback(
    (raw: string, lang: 'de' | 'en', id: string, blockNames: string[]) =>
      new Promise<void>((resolve) => {
        audio.current?.pause();
        if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
        done.current?.();
        done.current = resolve;
        setNote(undefined);
        const text = speakable(raw);
        if (!text) return finish();
        setSpeaking(id);
        setPhase('speaking');
        if (mode !== 'elevenlabs') return local(text, lang);
        if (!cloud) {
          setNote('cloud_unavailable');
          return local(text, lang);
        }
        if (hasPersonalData(text, blockNames)) {
          setNote('personal');
          return local(text, lang);
        }
        fetch('./api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, lang, voiceId: rules.voice?.elevenlabs_voice_id, model: rules.voice?.elevenlabs_model }),
        })
          .then(async (r) => {
            if (r.status === 422) {
              setNote('personal');
              return local(text, lang);
            }
            if (!r.ok) throw new Error(String(r.status));
            const url = URL.createObjectURL(await r.blob());
            const a = new Audio(url);
            audio.current = a;
            a.onended = () => {
              URL.revokeObjectURL(url);
              finish();
            };
            await a.play();
          })
          .catch(() => {
            setNote('cloud_error');
            local(text, lang);
          });
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, cloud, rules.voice?.elevenlabs_voice_id, rules.voice?.elevenlabs_model],
  );

  /**
   * Record one spoken question. Stops by itself after ~1.3 s of silence once speech was heard (max 20 s),
   * or when stopListening() is called. Resolves with the text ('' if nothing was said or it was cancelled).
   */
  const listen = useCallback(
    async (lang: 'de' | 'en'): Promise<string> => {
      stop();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
      const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const parts: Blob[] = [];
      mr.ondataavailable = (e) => e.data.size && parts.push(e.data);
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Float32Array(an.fftSize);
      let heard = false;
      let quietSince = performance.now();
      const started = performance.now();
      let cancelled = false;
      let timer = 0;
      setPhase('listening');
      const blob = await new Promise<Blob>((resolve) => {
        const end = () => {
          window.clearInterval(timer);
          if (mr.state !== 'inactive') mr.stop();
        };
        mr.onstop = () => resolve(new Blob(parts, { type: mr.mimeType || 'audio/webm' }));
        rec.current = {
          stop: end,
          cancel: () => {
            cancelled = true;
            end();
          },
        };
        mr.start(250);
        timer = window.setInterval(() => {
          an.getFloatTimeDomainData(buf);
          const rms = Math.sqrt(buf.reduce((s, x) => s + x * x, 0) / buf.length);
          setLevel(Math.min(1, rms * 12));
          const now = performance.now();
          if (rms > 0.02) {
            heard = true;
            quietSince = now;
          }
          if ((heard && now - quietSince > 1300) || now - started > 20000 || (!heard && now - started > 8000)) end();
        }, 80);
      });
      rec.current = null;
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
      setLevel(0);
      if (cancelled || !heard) {
        setPhase('idle');
        return '';
      }
      setPhase('transcribing');
      try {
        const r = await fetch(`./api/stt?lang=${lang}&model=${rules.voice?.stt_model ?? 'scribe_v1'}`, { method: 'POST', headers: { 'Content-Type': blob.type || 'audio/webm' }, body: blob });
        const j = (await r.json()) as { text?: string; error?: string };
        if (!r.ok) throw Object.assign(new Error(j.error ?? String(r.status)), { status: r.status });
        return j.text ?? '';
      } finally {
        setPhase('idle');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rules.voice?.stt_model],
  );

  const stopListening = () => rec.current?.stop();
  const cancelListening = () => rec.current?.cancel();

  useEffect(
    () => () => {
      rec.current?.cancel();
      audio.current?.pause();
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    },
    [],
  );

  return { mode, setMode, cloud, speak, stop, speaking, note, phase, setPhase, listen, stopListening, cancelListening, level };
}
