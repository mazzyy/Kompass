import { describe, expect, it } from 'vitest';
import { detectCharts, goalIn } from '../src/ui/charts';

describe('Assistant: which chart fits the question (numbers always come from the rules engine)', () => {
  it('"Visualisiere Ziel 2" -> status, by social worker and reasons for goal 2', () => {
    expect(detectCharts('Visualisiere Ziel 2')).toEqual([
      { kind: 'status', goal: 2 },
      { kind: 'by_sw', goal: 2 },
      { kind: 'reasons', goal: 2 },
    ]);
    expect(detectCharts('visualise the data based on goal 2').map((c) => c.kind)).toEqual(['status', 'by_sw', 'reasons']);
  });
  it('follow-up stays on the previous goal', () => {
    expect(detectCharts('und nach Einreisejahr?', 2)).toEqual([{ kind: 'by_year', goal: 2 }]);
    expect(detectCharts('and by social worker?', 3)).toEqual([{ kind: 'by_sw', goal: 3 }]);
  });
  it('topic words find the goal', () => {
    expect(goalIn('Wie viele haben eine Arbeit?')).toBe(2);
    expect(goalIn('Sprache A1')).toBe(1);
    expect(goalIn('households off social assistance')).toBe(3);
  });
  it('rule questions get no chart; people questions about reasons do', () => {
    expect(detectCharts('Warum zählt ein Praktikum nicht für Ziel 2?')).toEqual([]);
    expect(detectCharts('Wie schützt das Cockpit die Daten?')).toEqual([]);
    expect(detectCharts('Warum sind Leute bei Ziel 1 im Rückstand?')).toEqual([{ kind: 'reasons', goal: 1 }]);
  });
  it('forecast and claimable', () => {
    expect(detectCharts('Zeig die Prognose')).toEqual([{ kind: 'forecast', goal: undefined }]);
    expect(detectCharts('Was ist jetzt abrechenbar?').map((c) => c.kind)).toEqual(['claimable']);
    expect(detectCharts('Gib mir eine Übersicht')).toEqual([{ kind: 'overview', goal: undefined }]);
  });
});
