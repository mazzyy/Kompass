import { useCallback, useEffect, useRef, useState } from 'react';
import { hasPersonalData } from '../rag/ask';
import type { Rules } from '../engine/rules';

export type VoiceMode = 'local' | 'elevenlabs';
export type VoiceNote = 'personal' | 'cloud_unavailable' | 'cloud_error' | undefined;

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
 * Reading answers aloud. "local" uses the computer's own voice (offline). "elevenlabs" sends the answer text
 * to our own server (/api/tts), which calls ElevenLabs with the key from .env.local, and only when the text
 * has no names, client numbers or dates of birth; otherwise it falls back to the local voice and says why.
 */
export function useVoice(rules: Rules) {
  const [mode, setModeState] = useState<VoiceMode>(() => load() ?? rules.voice?.default ?? 'local');
  const [cloud, setCloud] = useState<boolean | undefined>();
  const [speaking, setSpeaking] = useState<string | undefined>(); // id of the answer being read
  const [note, setNote] = useState<VoiceNote>();
  const audio = useRef<HTMLAudioElement | null>(null);

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

  const stop = useCallback(() => {
    audio.current?.pause();
    audio.current = null;
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    setSpeaking(undefined);
  }, []);

  const local = (text: string, lang: 'de' | 'en', id: string) => {
    if (typeof speechSynthesis === 'undefined') return;
    const u = new SpeechSynthesisUtterance(text);
    const want = lang === 'de' ? 'de' : 'en';
    // Only voices installed on this computer (localService), so the text does not go to an online voice.
    const v = speechSynthesis.getVoices().find((x) => x.localService && x.lang.toLowerCase().startsWith(want));
    if (v) u.voice = v;
    u.lang = v?.lang ?? (lang === 'de' ? 'de-CH' : 'en-GB');
    u.onend = () => setSpeaking((s) => (s === id ? undefined : s));
    setSpeaking(id);
    speechSynthesis.speak(u);
  };

  const speak = useCallback(
    async (raw: string, lang: 'de' | 'en', id: string, blockNames: string[]) => {
      stop();
      setNote(undefined);
      const text = speakable(raw);
      if (!text) return;
      if (mode === 'elevenlabs') {
        if (!cloud) {
          setNote('cloud_unavailable');
          return local(text, lang, id);
        }
        if (hasPersonalData(text, blockNames)) {
          setNote('personal');
          return local(text, lang, id);
        }
        try {
          setSpeaking(id);
          const r = await fetch('./api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, lang, voiceId: rules.voice?.elevenlabs_voice_id, model: rules.voice?.elevenlabs_model }),
          });
          if (r.status === 422) {
            setNote('personal');
            return local(text, lang, id);
          }
          if (!r.ok) throw new Error(String(r.status));
          const url = URL.createObjectURL(await r.blob());
          const a = new Audio(url);
          audio.current = a;
          a.onended = () => {
            URL.revokeObjectURL(url);
            setSpeaking((s) => (s === id ? undefined : s));
          };
          await a.play();
          return;
        } catch {
          setNote('cloud_error');
          return local(text, lang, id);
        }
      }
      local(text, lang, id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, cloud, rules.voice?.elevenlabs_voice_id, rules.voice?.elevenlabs_model, stop],
  );

  useEffect(() => stop, [stop]);

  return { mode, setMode, cloud, speak, stop, speaking, note };
}
