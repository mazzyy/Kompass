import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { postprocess, sentences, splitReport, fieldCorrect } from '../src/ai/extract';

const amina = fs.readFileSync('sample-data/2026-11/situationsanalyse/' + JSON.parse(fs.readFileSync('sample-data/2026-11/situationsanalyse/index.json', 'utf8')).find((x: { persona: string }) => x.persona === 'amina').file, 'utf8');

describe('Situationsanalyse extraction (AI guardrails)', () => {
  it('splits a report into one block per person, keyed by Zemis-Nr.', () => {
    const sp = splitReport(amina);
    expect(sp.persons.map((p) => p.name)).toEqual(['Amina Tesfay', 'Filmon Tesfay']);
    expect(sp.persons[0].zemis).toMatch(/^\d{8}$/);
  });
  it('sentences are the same for .txt and for wrapped PDF text', () => {
    const p = splitReport(amina).persons[0];
    const wrapped = p.text.replace(/ (\w+) (\w+) /g, ' $1\n$2 ');
    expect(sentences(wrapped)).toEqual(sentences(p.text));
    expect(sentences(p.text)).toContain('Versteht kein Schweizerdeutsch.');
  });
  it('evidence is the referenced sentence; bad enum -> unclear; missing sentence -> not stated', () => {
    const s = ['Lerntempo gut.', 'Keine Diplome.'];
    const r = postprocess(
      {
        learning_pace: { value: 'good', sentence: 1 },
        diplomas: { value: 'maybe', sentence: 2 },
        driving_licence: { value: 'no', sentence: null },
        career_wish: { value: 'Pflege', sentence: 9 },
      },
      s,
    );
    expect(r.learning_pace).toEqual({ value: 'good', status: 'stated', evidence: 'Lerntempo gut.' });
    expect(r.diplomas.status).toBe('unclear');
    expect(r.driving_licence.status).toBe('not_stated');
    expect(r.career_wish.status).toBe('unclear');
  });
  it('accuracy scoring: not_stated must be not_stated; text fields by shared word', () => {
    expect(fieldCorrect('debts' as never, { value: null, status: 'not_stated', evidence: '' }, 'not_stated')).toBe(true);
    expect(fieldCorrect('career_wish', { value: 'Textil oder Pflege', status: 'stated', evidence: 'x' }, 'Textil / Schneiderei oder Pflege')).toBe(true);
  });
});

import { buildPrompt, collectNames, pseudonymize } from '../src/ai/extract';

describe('De-identification before the AI step', () => {
  it('no names, ID numbers or dates reach the model; values are restored afterwards', () => {
    const sp = splitReport(amina);
    const p = sp.persons[0];
    const extra = ['Frau Tesfay wohnt bei Amina Tesfay, Tel. 031 321 64 11, Zemis 37988676, geb. 05.05.1992.', 'Möchte wie Lidia in der Pflege arbeiten.'];
    const ps = pseudonymize([...sentences(p.text), ...extra], collectNames(sp.household, p));
    const prompt = buildPrompt(p, ps.masked);
    for (const secret of ['Amina', 'Tesfay', 'Lidia', 'Filmon', '37988676', '05.05.1992', '031 321 64 11', p.zemis]) expect(prompt).not.toContain(secret);
    expect(ps.replaced).toBeGreaterThan(5);
    const masked = ps.masked[ps.masked.length - 1];
    expect(ps.restore(masked)).toBe(extra[1]);
    expect(prompt).toContain('Versteht kein Schweizerdeutsch.');
  });
});
