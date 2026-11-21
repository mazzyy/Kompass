# Status for 06:00 (Sat 21.11.2026)

**Goal 1 is complete and fully tested.** 90 automated tests pass (`npm test`). No risk to the 11:00 checkpoint.

## What works (all checked in the browser, numbers from the engine, nothing hard-coded)

| Your item | State |
|---|---|
| 1 Goal 1 | Done. Tests TI-01..08, TS-01..07, T1-01..14 pass |
| 2 Excel in / out | Done. Tables recognised by headers; Swiss + Excel dates; management workbook (Übersicht, Ziel1/2_Personen, Ziel3_Haushalte, Anrufliste, Abrechenbar, Muster, Datenqualität, Prognose, WhatIf_2027, Regeln, Lauf) + one file per social worker. TE-01..04 pass |
| 3 Call list | Done. Ranked by risk, then time without activity, never money. S. Keller: Reza (25 days) → Fatima (42) → Amina (112) → … → Yonas (missed, fixable). TC-01/02 pass |
| 4 Real local AI | Done. qwen2.5:7b-instruct via Ollama, structured output, evidence = the exact sentence (by number, so it can't be invented), "not stated" instead of guessing, a person confirms each field. **Names, numbers, dates, phones removed before the model; put back afterwards** (test proves no name/ID reaches the prompt). "What the model saw" is visible in the review screen |
| 5 Goals 2 + 3 | Done. T2-01..10, T3-01..07, TD-01..04 pass |
| 6 Hosted demo | **Kept local (your decision).** Judges test on the laptop. The static build (`npm run build`, folder `dist/`) and `public/sample-data.zip` are ready; `scripts/deploy-pages.sh` exists if you change your mind |
| A Accuracy | Generated set: **97 % of fields correct (396 of 410; 20 synthetic reports, 41 people, qwen2.5:7b-instruct, names removed)**; every evidence sentence found verbatim. Weakest fields: work experience 90 %, career wish 90 %, driving licence 93 %. Your 3 hand-written reports: not measured yet (see "Your tasks") |
| B Explained call list | Rule reason + confirmed (or clearly labelled proposed) Situationsanalyse barrier **with its evidence sentence**, source rows, talking points |
| C Claimable now | Overview figure (18: goal 1: 11, goal 2: 4, goal 3: 3 households), list in Data quality, sheet `Abrechenbar` |
| D Trust | Groups under 10 hidden (also when derivable), equity rows (gender, literacy) always shown, actionable factors first, nationality last and never the headline. Wording exactly as you gave it |
| E Same clicks | Month 2's renamed `Niveau (A0–C2)` → run blocked → confirm once → remembered next time |
| Extras | What-if 2027 (TW-01..05, your tooltip text), forecast. "Show only in-scope" toggle on Clients |

Not built (as agreed): Leichte Sprache note, AI column-mapping suggestion (the column card says "suggested from column name and values", honestly).

## Organisers' rule answers (21.11, applied in rules.yaml v1.4)

Q2 age on Stichtag (unchanged), Q3 proof types (unchanged), Q4 only jobs with a contract (volunteering, unpaid, programme work excluded), Q5 Sek II/Tertiär counts on completion. Goal 2 = contract job ≥ 60 % for 6 months without a break, as in the brief (no conflict); adding up two contract jobs remains an assumption. Marked "Organisers' answer · awaiting ASD confirmation" in the Rules panel. Q1, Q6, Q7, Q8, Q9 still assumptions. 87 tests pass.
Effect on the November data: call list, claimable (18) and goal 2 totals unchanged; 9 info alerts "proven but not reproducible" (goal 2 recorded at apprenticeship start).

**Later answers (21.11, rules.yaml v1.6):** Q1 the five permits VA, F-FL, B-FL, B-RSFL, B-SL count. Q9 payment period by permit, as in the brief: 7 years from entry for VA, F-FL; 5 years from the asylum application for B-FL, B-RSFL, B-SL; `+5/+7` = period over (ASD's list says `B-RSFL+7`: contradiction to ask). The deadline for goals 2/3 is the earlier of the period end and Zuständigkeitsende; Data quality flags a gap of more than 31 days. Q7 the 2027 rule applies to people arriving from 01.01.2027 (5 years), built into the deadlines; the what-if says 0 current clients are affected. Numbers unchanged (goal 2: 90/214/6/12, claimable 18, S. Keller order the same). 102 tests pass. Still open: B-RSFL 5 or 7 years, two contract jobs added up, Nothilfe / household deadline (Q6), lump sums (Q8).

**New screen "Ziel im Detail"** (click a goal on the Overview): who is lagging behind and why (rule reasons, Situationsanalyse barriers, per social worker, list), deadlines in the next 12 months, not counted and why. Overview also has caseload per social worker. Banner now says sample data only when sample data is loaded.

## How to run the demo (Wi-Fi off)

```bash
cd ~/Desktop/Projects/integration-cockpit && npm run dev
```
Open http://localhost:5173 → Monatslauf → November 2026 → confirm the column → Berechnen → Anrufe diese Woche → S. Keller → Amina → Situationsanalyse → Übersicht (Jetzt abrechenbar) → Excel-Exporte.
Before the demo: *Lokale Daten löschen* on the Monatslauf screen so the column question appears again. Ollama must be running (`ollama serve`).

## Your tasks this morning

1. **06:30 — 3 hand-written reports** (~45 min): instructions and facts in `docs/HUMAN_REPORTS.md`. Save over the 3 files named there, set the facts you left out to `"not_stated"` in `sample-data/labels/human_truth.json`, then run `npx tsx scripts/extract.ts human` (or tell me and I run it). That gives the second accuracy number.
2. **Templates**: 10 of 11 received and built in (10:45). Still missing: Integrationszielerreichung (needed to confirm the exact `Art (Ziel)` values).
3. ~10:00 challenge owner test; ask about the open rule questions (Rules panel lists every assumption).

## Risks

- Live AI takes about 15 s per person on this laptop. For the demo use a short report (1 person) live; the rest are cached and labelled "cached result of the local model".
- No hosted link: judges who want to try it themselves need the laptop (or a USB copy of `dist/` + `sample-data.zip`, which runs from any static web server).
- Integrationszielerreichung is still provisional (template missing). Klient has no names: clients show by number unless their Situationsanalyse has been read.

**21.11 later:** the cockpit remembers the chosen folder (or sample month) and loads + calculates it on every open until another source is chosen; browser back/forward move between screens without losing results. **Before the demo:** click "Nicht mehr merken" on Monatslauf (and "Lokale Daten löschen" if the renamed-column step should appear again), so the demo starts empty. The shared Word file was a project overview, not the template.

**Integrationszielerreichung template received (in Downloads) and built in:** all 11 tables now match ASD's templates. The real `Art` values are `Sprachniveau A1`, `Aufnahme Ausbildung / Erwerbstätigkeit`, `Finanzielle Unabhängigkeit`, `Grundpauschale Integration` (ignored); goal 3's old keywords would not have matched "Finanzielle Unabhängigkeit", now fixed. Sample data regenerated in this format; numbers unchanged. 104 tests pass.

**Lump sums (21.11 afternoon):** public sources confirm the payment structure (base lump sum per person + a different lump sum per reached goal, Leistungsvertrag GSI–Stadt Bern 2020) but not the amounts (contract prices). The forecast, claimable total and Excel Prognose show CHF as soon as ASD enters its amounts (Overview → Forecast). B-RSFL = 5 years marked ASSUMPTION. Two contract jobs adding up: left as is. 105 tests pass.

**Demo polish (21.11 afternoon):** "Heute wichtig" strip, full client page, clients filter per goal, one-click "Demo von vorne" on Monatslauf (use it right before presenting). UI in City of Bern colours; yellow = on track.
