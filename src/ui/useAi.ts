import { useEffect, useState } from 'react';

export type AiStatus = 'unknown' | 'online' | 'offline';

/** Health check of the LOCAL model (Ollama on this computer). Never calls anything else. */
export function useAiStatus(endpoint: string): AiStatus {
  const [s, setS] = useState<AiStatus>('unknown');
  useEffect(() => {
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(endpoint)) {
      setS('offline');
      return;
    }
    let alive = true;
    const check = async () => {
      try {
        const ctl = new AbortController();
        const to = setTimeout(() => ctl.abort(), 1500);
        const r = await fetch(`${endpoint}/api/tags`, { signal: ctl.signal });
        clearTimeout(to);
        if (alive) setS(r.ok ? 'online' : 'offline');
      } catch {
        if (alive) setS('offline');
      }
    };
    check();
    const id = setInterval(check, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [endpoint]);
  return s;
}
