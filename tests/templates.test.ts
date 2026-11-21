import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyzeFiles } from '../src/engine/import/detect';
import { readWorkbook } from '../src/engine/import/read';
import { TABLES } from '../src/engine/import/signatures';

// ASD's templates (10 of 11 received). Header row must match our signatures exactly, in order.
const files = fs.readdirSync('templates').filter((f) => f.endsWith('.xlsx'));
const raws = files.map((f) => readWorkbook(new Uint8Array(fs.readFileSync(`templates/${f}`)), f));

describe('ASD templates', () => {
  it('10 templates are recognised as the right tables, columns ok', () => {
    const an = analyzeFiles(raws);
    expect(new Set(an.map((a) => a.table)).size).toBe(10);
    for (const a of an) expect([a.fileName, a.status]).toEqual([a.fileName, 'ok']);
  });
  it('signature headers equal the template headers byte for byte and in order', () => {
    const an = analyzeFiles(raws);
    for (const [i, a] of an.entries()) {
      const spec = TABLES.find((t) => t.id === a.table)!;
      expect(spec.provisional).toBe(false);
      expect(spec.columns.filter((c) => !c.extra).map((c) => c.header)).toEqual(raws[i].headers.map(String));
    }
  });
  it('only Integrationszielerreichung is still provisional', () => {
    expect(TABLES.filter((t) => t.provisional).map((t) => t.id)).toEqual(['zielerreichung']);
  });
});
