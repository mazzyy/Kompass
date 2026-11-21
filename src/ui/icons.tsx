import type { Status } from '../engine/model';

export function StatusIcon({ status, size = 15, label }: { status: Status | undefined; size?: number; label?: string }) {
  const a = label ? { role: 'img' as const, 'aria-label': label } : { 'aria-hidden': true as const };
  switch (status) {
    case 'reached':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" {...a}>
          <circle cx="8" cy="8" r="7" fill="#1A7F45" />
          <path d="M5 8.2l2 2 4-4.2" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'on_track':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" {...a}>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="#C99A00" strokeWidth="1.5" />
          <path d="M8 4.5a3.5 3.5 0 0 1 0 7z" fill="#F2C200" stroke="#C99A00" strokeWidth="0.75" />
        </svg>
      );
    case 'at_risk':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" {...a}>
          <path d="M8 1.5l7 12.5H1z" fill="#D12C1F" />
          <path d="M8 6v3.6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="11.8" r="0.85" fill="#fff" />
        </svg>
      );
    case 'missed':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" {...a}>
          <circle cx="8" cy="8" r="7" fill="#8A1C14" />
          <path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" {...a}>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="#A1A1AA" strokeWidth="1.5" strokeDasharray="2 2" />
        </svg>
      );
  }
}

const P = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

export const Icon = {
  mic: () => (
    <svg {...P}><rect x="5.5" y="1.75" width="5" height="8" rx="2.5" /><path d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2" /></svg>
  ),
  send: () => (
    <svg {...P}><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" /></svg>
  ),
  speaker: () => (
    <svg {...P}><path d="M2.5 6v4h2.5l3.5 3V3L5 6z" /><path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.8a6 6 0 0 1 0 8.4" /></svg>
  ),
  speakerOff: () => (
    <svg {...P}><path d="M2.5 6v4h2.5l3.5 3V3L5 6z" /><path d="m11 6 3.5 4M14.5 6 11 10" /></svg>
  ),
  wave: () => (
    <svg {...P}><path d="M2 7v2M4.5 5v6M7 3v10M9.5 5v6M12 6.5v3M14.5 7.5v1" /></svg>
  ),
  gear: () => (
    <svg {...P}><circle cx="8" cy="8" r="2.2" /><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" /></svg>
  ),
  stop: () => (
    <svg {...P}><rect x="4" y="4" width="8" height="8" rx="1.5" /></svg>
  ),
  plus: () => (
    <svg {...P}><path d="M8 3v10M3 8h10" /></svg>
  ),
  chart: () => (
    <svg {...P}><path d="M2.5 13.5h11M4.5 11V7.5M8 11V4M11.5 11V9" /></svg>
  ),
  ask: () => (
    <svg {...P}><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" /><path d="M6.3 6a1.7 1.7 0 1 1 2.2 1.6c-.3.1-.5.4-.5.7v.2" /></svg>
  ),
  target: () => (
    <svg {...P}><circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="3" /><circle cx="8" cy="8" r="0.5" /></svg>
  ),
  overview: () => (
    <svg {...P}><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></svg>
  ),
  calls: () => (
    <svg {...P}><path d="M3 2.5h2.5l1 3-1.5 1a7 7 0 0 0 4.5 4.5l1-1.5 3 1V13a1 1 0 0 1-1 1A11 11 0 0 1 2 3.5a1 1 0 0 1 1-1z" /></svg>
  ),
  clients: () => (
    <svg {...P}><circle cx="6" cy="5.5" r="2.5" /><path d="M1.5 13.5a4.5 4.5 0 0 1 9 0" /><path d="M11 3.2a2.5 2.5 0 0 1 0 4.6" /><path d="M12.5 9.5a4.5 4.5 0 0 1 2 4" /></svg>
  ),
  patterns: () => (
    <svg {...P}><path d="M2 4h12M2 8h12M2 12h12" /><circle cx="10" cy="4" r="1.6" fill="currentColor" /><circle cx="5" cy="8" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /></svg>
  ),
  run: () => (
    <svg {...P}><path d="M13.5 8A5.5 5.5 0 1 1 11 3.4" /><path d="M13.5 2.5v3h-3" /></svg>
  ),
  doc: () => (
    <svg {...P}><path d="M4 1.5h5.5l3 3v10H4z" /><path d="M9.5 1.5v3h3" /><path d="M6 8h4.5M6 10.5h3" /></svg>
  ),
  quality: () => (
    <svg {...P}><circle cx="8" cy="8" r="6" /><path d="M8 5v3.5" /><path d="M8 11h.01" /></svg>
  ),
  download: () => (
    <svg {...P}><path d="M8 2.5v8" /><path d="M5 7.5l3 3 3-3" /><path d="M2.5 11v1.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V11" /></svg>
  ),
  calendar: () => (
    <svg {...P} width={14} height={14}><rect x="2" y="3" width="12" height="11" rx="1.5" /><path d="M2 6.5h12" /><path d="M5.5 1.5v3M10.5 1.5v3" /></svg>
  ),
  play: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4.5 2.8v10.4a.6.6 0 0 0 .9.5l8.2-5.2a.6.6 0 0 0 0-1L5.4 2.3a.6.6 0 0 0-.9.5z" /></svg>
  ),
  warn: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="#C99A00" /><path d="M8 4.5v4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" /><circle cx="8" cy="11.2" r="0.9" fill="#fff" /></svg>
  ),
  ok: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="#1A7F45" /><path d="M5 8.2l2 2 4-4.2" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  check: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#121212" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8.5l3 3 7-7" /></svg>
  ),
};
