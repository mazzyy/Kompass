import { describe, expect, it } from 'vitest';
import { buildMessages, hasPersonalData, INDEX_INFO, retrieve } from '../src/rag/ask';

describe('Frag das Cockpit (local RAG)', () => {
  it('index has the brief, the rules, the German help and the build docs, and nothing else', () => {
    expect(INDEX_INFO.size).toBeGreaterThan(40);
    expect(INDEX_INFO.sources.sort()).toEqual(['Brief (ASD challenge)', 'Hilfe (Regeln erklärt)', 'WHAT_WE_BUILT.md', 'rules.yaml']);
  });
  it('keyword retrieval (model offline) finds the goal-2 exclusion rule for "Praktikum"', () => {
    const top = retrieve('Warum zählt ein Praktikum nicht für Ziel 2?', undefined, 5);
    const help = top.slice(0, 3).find((p) => p.title === 'Ziel 2: Arbeit oder Ausbildung'); // the help section that explains the exclusion
    expect(help?.text).toMatch(/Praktika ohne Lohn/);
  });
  it('prompt tells the model to cite, not to guess and not to judge individuals', () => {
    const m = buildMessages('de', 'Frage?', retrieve('A1 Nachweis', undefined, 2), 'Ziel 1: 319 gezählt');
    expect(m[1].content).toMatch(/finde ich in den Unterlagen nichts/);
    expect(m[0].content).toMatch(/keine einzelnen Personen/);
    expect(m[1].content).toMatch(/\[1\]/);
    expect(m[1].content).toMatch(/\[K\]/);
  });
  it('personal-data check blocks names and numbers, lets totals and rule dates through', () => {
    expect(hasPersonalData('Amina T. hat die A1-Frist am 12.03.2027', ['Amina'])).toBe(true);
    expect(hasPersonalData('Klient 10482 ist gefährdet', [])).toBe(true);
    expect(hasPersonalData('Zemis 37988676', [])).toBe(true);
    expect(hasPersonalData('Dossier D12.8146', [])).toBe(true);
    expect(hasPersonalData('Ziel 1: 164 von 319 erreicht (51 %). Die 2027-Regel gilt ab 01.01.2027.', ['Amina', 'Keller'])).toBe(false);
  });
});
