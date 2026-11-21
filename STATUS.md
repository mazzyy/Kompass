# Status for 06:00 (Sat 21.11.2026)

**Goal 1 is complete and fully tested.** 83 automated tests pass (`npm test`). No risk to the 11:00 checkpoint.

## What works (all checked in the browser, numbers from the engine, nothing hard-coded)

| Your item | State |
|---|---|
| 1 Goal 1 | Done. Tests TI-01..08, TS-01..07, T1-01..14 pass |
| 2 Excel in / out | Done. Tables recognised by headers; Swiss + Excel dates; management workbook (Übersicht, Ziel1/2_Personen, Ziel3_Haushalte, Anrufliste, Abrechenbar, Muster, Datenqualität, Prognose, WhatIf_2027, Regeln, Lauf) + one file per social worker. TE-01..04 pass |
| 3 Call list | Done. Ranked by risk, then time without activity, never money. S. Keller: Reza (25 days) → Fatima (42) → Amina (112) → … → Yonas (missed, fixable). TC-01/02 pass |
| 4 Real local AI | Done. qwen2.5:7b-instruct via Ollama, structured output, evidence = the exact sentence (by number, so it can't be invented), "not stated" instead of guessing, a person confirms each field. **Names, numbers, dates, phones removed before the model; put back afterwards** (test proves no name/ID reaches the prompt). "What the model saw" is visible in the review screen |
| 5 Goals 2 + 3 | Done. T2-01..10, T3-01..07, TD-01..04 pass |
| 6 Hosted demo | Ready, **not published**: needs your OK (public GitHub repo + Pages). One command: `bash scripts/deploy-pages.sh` after the repo exists |
| A Accuracy | Generated set: ACCURACY_PENDING. Your 3 hand-written reports: not measured yet (see "Your tasks") |
| B Explained call list | Rule reason + confirmed (or clearly labelled proposed) Situationsanalyse barrier **with its evidence sentence**, source rows, talking points |
| C Claimable now | Overview figure (18: goal 1: 11, goal 2: 5, goal 3: 2 households), list in Data quality, sheet `Abrechenbar` |
| D Trust | Groups under 10 hidden (also when derivable), equity rows (gender, literacy) always shown, actionable factors first, nationality last and never the headline. Wording exactly as you gave it |
| E Same clicks | Month 2's renamed `Niveau (A0–C2)` → run blocked → confirm once → remembered next time |
| Extras | What-if 2027 (TW-01..05, your tooltip text), forecast. "Show only in-scope" toggle on Clients |

Not built (as agreed): Leichte Sprache note, AI column-mapping suggestion (the column card says "suggested from column name and values", honestly).

## How to run the demo (Wi-Fi off)

```bash
cd ~/Desktop/Projects/integration-cockpit && npm run dev
```
Open http://localhost:5173 → Monatslauf → November 2026 → confirm the column → Berechnen → Anrufe diese Woche → S. Keller → Amina → Situationsanalyse → Übersicht (Jetzt abrechenbar) → Excel-Exporte.
Before the demo: *Lokale Daten löschen* on the Monatslauf screen so the column question appears again. Ollama must be running (`ollama serve`).

## Your tasks this morning

1. **06:30 — 3 hand-written reports** (~45 min): instructions and facts in `docs/HUMAN_REPORTS.md`. Save over the 3 files named there, set the facts you left out to `"not_stated"` in `sample-data/labels/human_truth.json`, then run `npx tsx scripts/extract.ts human` (or tell me and I run it). That gives the second accuracy number.
2. **Templates**: drop the 5 missing ones into `../integration-cockpit-handover/02_data/templates/`. I swap the headers in `src/engine/import/signatures.ts` (one file) and re-run the tests.
3. **Hosted demo**: say "publish" and whether the GitHub repo may be public under your account (mazzyy).
4. ~10:00 challenge owner test; ask about the open rule questions (Rules panel lists every assumption).

## Risks

- Live AI takes about 15 s per person on this laptop. For the demo use a short report (1 person) live; the rest are cached and labelled "cached result of the local model".
- The hosted (https) page cannot call a local model; it shows the cached results, labelled.
- 5 table definitions are still provisional until the templates arrive.
