import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENGINE_MESSAGES } from '../src/i18n/messages';

describe('i18n', () => {
  it('every message key used by the engine exists in DE and EN', () => {
    const dir = 'src/engine';
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8').replace(/rule: '[^']*'/g, '').replace(/\/\/.*$/gm, ''));
    const keys = new Set<string>();
    for (const src of files) for (const m of src.matchAll(/key: '([a-z0-9_.]+)'/g)) keys.add(m[1]);
    for (const src of files) for (const m of src.matchAll(/'((?:g1|g2|g3|na|dq|call|tp|note)\.[a-z0-9_.]+)'/g)) keys.add(m[1]);
    for (const k of [...keys]) if (k.startsWith('g1.reached.')) keys.add(k + '_late');
    const missing = [...keys].filter((k) => !ENGINE_MESSAGES.de[k] || !ENGINE_MESSAGES.en[k]);
    expect(missing).toEqual([]);
    expect(Object.keys(ENGINE_MESSAGES.de).sort()).toEqual(Object.keys(ENGINE_MESSAGES.en).sort());
  });
});
