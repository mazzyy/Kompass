// Payment forecast (§10): goals expected to be reached ON TIME per quarter, next N quarters. Counts, never per-person scores.
import { addMonths, parts, ymd, type Day } from './dates';
import type { Household, Person } from './model';

export interface Quarter {
  label: string; // e.g. Q1 2027
  from: Day;
  to: Day;
  goal1: number; // course ends before deadline (assumes exam passed)
  goal2: number; // job of >= 60 % running, 6 months complete in this quarter
  goal3: number; // household off social assistance, 12 months complete in this quarter
}

export function forecast(persons: Person[], households: Household[], st: Day, n: number): Quarter[] {
  const p0 = parts(st);
  let qStart = ymd(p0.y, Math.floor((p0.m - 1) / 3) * 3 + 1, 1);
  const qs: Quarter[] = [];
  for (let i = 0; i < n; i++) {
    const next = addMonths(qStart, 3);
    const p = parts(qStart);
    qs.push({ label: `Q${Math.floor((p.m - 1) / 3) + 1} ${p.y}`, from: qStart, to: next - 1, goal1: 0, goal2: 0, goal3: 0 });
    qStart = next;
  }
  const put = (d: Day | undefined, k: 'goal1' | 'goal2' | 'goal3') => {
    if (d === undefined || d < st) return;
    const q = qs.find((x) => d >= x.from && d <= x.to);
    if (q) q[k]++;
  };
  for (const p of persons) {
    const g1 = p.goals[1];
    if (g1?.status === 'on_track' && g1.reason.key === 'g1.on_track.course') {
      const [dd, mm, yy] = String(g1.reason.p?.end ?? '').split('.').map(Number);
      if (yy) put(ymd(yy, mm, dd), 'goal1');
    }
    const g2 = p.goals[2];
    if (g2?.status === 'on_track' && g2.reason.key === 'g2.on_track.running') put(g2.latestAction, 'goal2');
  }
  for (const h of households) if (h.goal3?.status === 'on_track' && h.goal3.reason.key === 'g3.on_track.free') put(h.goal3.latestAction, 'goal3');
  return qs;
}
