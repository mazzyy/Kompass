import { describe, expect, it } from 'vitest';
import { d } from '../src/engine/dates';
import type { Person } from '../src/engine/model';
import { computePatterns, wilson, type Features } from '../src/engine/patterns';
import { addPerson, Fx, lang } from './fixtures';

function cohort(spec: { latin: boolean; reached: boolean; gender?: 'w' | 'm' }[]) {
  const persons: Person[] = [];
  const feats = new Map<string, Features>();
  spec.forEach((s, i) => {
    const id = String(i);
    persons.push({ id, zemis: id, goals: { 1: { goal: 1, status: s.reached ? 'reached' : 'missed', late: false, deadline: d('01.01.2025'), reason: { key: 'x' }, trace: [] } } } as unknown as Person);
    feats.set(id, { latin: s.latin, gender: s.gender ?? 'w' });
  });
  return { persons, feats };
}

describe('Patterns (TP)', () => {
  it('TP-02 8 of 10 -> Wilson 95 % about [49 %, 94 %]', () => {
    const [lo, hi] = wilson(8, 10);
    expect(Math.round(lo * 100)).toBe(49);
    expect(Math.round(hi * 100)).toBe(94);
  });
  it('TP-01 a group of 9 in a two-group factor hides the whole factor', () => {
    const spec = [...Array(9)].map(() => ({ latin: false, reached: false })).concat([...Array(30)].map(() => ({ latin: true, reached: true })));
    const { persons, feats } = cohort(spec);
    const r = computePatterns(persons, feats, d('20.11.2026'), 10);
    const latin = r.factors.find((f) => f.id === 'latin')!;
    expect(latin.hidden).toBe(true);
    expect(latin.groups).toEqual([]);
  });
  it('visible groups with rates and gap; actionable factors listed first, nationality last', () => {
    const spec = [...Array(20)].map((_, i) => ({ latin: false, reached: i < 8 })).concat([...Array(20)].map((_, i) => ({ latin: true, reached: i < 18, gender: 'm' as const })));
    const { persons, feats } = cohort(spec);
    const r = computePatterns(persons, feats, d('20.11.2026'), 10);
    const latin = r.factors.find((f) => f.id === 'latin')!;
    expect(latin.groups.map((g) => [g.label, g.n, g.reached])).toEqual([['yes', 20, 18], ['no', 20, 8]]);
    expect(latin.gap).toBe(50);
    expect(r.factors[0].kind).toBe('actionable');
    expect(r.factors[r.factors.length - 1].id).toBe('nationality');
    expect(r.factors.find((f) => f.id === 'gender')!.groups.length).toBe(2);
  });
  it('TP-04/05 Situationsanalyse factors use confirmed fields only; others are counted as left out', () => {
    const spec = [...Array(24)].map((_, i) => ({ latin: true, reached: i % 2 === 0 }));
    const { persons, feats } = cohort(spec);
    const confirmed: Record<string, Record<string, unknown>> = {};
    for (let i = 0; i < 10; i++) confirmed[String(i)] = { childcare_duty_without_care: i < 5 ? 'yes' : 'no' };
    const r = computePatterns(persons, feats, d('20.11.2026'), 5, confirmed);
    const cc = r.factors.find((f) => f.id === 'childcare')!;
    expect(cc.leftOut).toBe(14);
    expect(cc.groups.reduce((s, g) => s + g.n, 0)).toBe(10);
  });
  it('TP-03 cohort = deadline before the Stichtag; result has no per-person values', () => {
    const fx = new Fx();
    const a = addPerson(fx, { entry: '01.01.2022' });
    lang(fx, a, 'A1', 'Zertifikat fide', '01.06.2023');
    addPerson(fx, { entry: '01.01.2025' });
    const res = fx.run();
    const r = computePatterns(res.persons, new Map(Object.entries(res.features)), res.stichtag, 10);
    expect(r.cohortSize).toBe(1);
    expect(JSON.stringify(r)).not.toContain(a.knr);
  });
});
