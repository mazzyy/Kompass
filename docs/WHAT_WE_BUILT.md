# Integrations-Cockpit: what we built and how it works

AI for Access hackathon, Bern, 20–21 Nov 2026. Challenge owner: Asylsozialdienst (ASD) Stadt Bern.
State: Sat 21.11.2026, 10:20. **All data is synthetic. No real people.**

---

## 1. The problem in one paragraph

ASD is paid only when a refugee reaches an integration goal before a deadline: (1) German A1 within 3 years of entry, (2) 6 months of work at ≥ 60 % with a contract, or Sek II / tertiary education, before the end of responsibility, (3) the whole household 12 months without social assistance, before the end of responsibility. Today nobody can see who is on track, who is about to miss a deadline, or why. Their case-management system cannot be changed; it can only export Excel files.

## 2. What the tool does

A browser app. Someone drops this month's Excel exports in, presses **Berechnen**, and gets:

- each client's status for the three goals (green reached, yellow on track, red at risk, dark red deadline missed, grey not applicable), always with the reason and the exact source rows;
- a weekly **call list** per social worker ("who do I call this week, and why?");
- **Jetzt abrechenbar**: goals the data shows as reached on time but not yet recorded in Integrationszielerreichung;
- **data-quality** alerts;
- **group patterns** (what goes with reaching A1), never a score per person;
- a **local AI model** that reads the free-text Situationsanalyse and proposes fields with the evidence sentence; a social worker confirms;
- **Excel files** back: one for management, one per social worker with only their own clients.

Nothing leaves the computer.

## 3. How it is built

| Part | What | Where |
|---|---|---|
| App | Vite + React + TypeScript, runs entirely in the browser | `src/` |
| Rules engine | Pure TypeScript, no UI, fully tested | `src/engine/` |
| Rules | One YAML file; every value shown in the app's Rules panel and in the Excel `Regeln` sheet | `src/config/rules.default.yaml` |
| Excel in | SheetJS; tables recognised by header row | `src/engine/import/` |
| Excel out | ExcelJS with colours, frozen headers, filters, real dates | `src/excel/write.ts` |
| Local AI | Ollama on `localhost:11434`, model `qwen2.5:7b-instruct` | `src/ai/extract.ts` |
| PDF reading | pdf.js, bundled locally | `src/ai/pdf.ts` |
| Synthetic data | Node + Python scripts, seeded (same input → same files) | `scripts/`, `sample-data/` |
| Tests | Vitest, 87 tests | `tests/` |

Single source of truth: one run produces one `RunResult`; every screen and every Excel sheet is drawn from it, so screen and Excel can never disagree. No number is hard-coded.

## 4. Feature by feature

### 4.1 Excel in ("Monatslauf")

- Drop files or a folder, or load the sample month (October / November 2026).
- Each file is matched to one of the 11 tables **by its column headers**, not the file name (headers normalised: case, spaces, umlauts, non-breaking spaces).
- Dates: real Excel dates and Swiss text `dd.mm.yyyy`, `d.m.yy` all work. Keys: `'12345678` and `12345678` join.
- **Renamed column** (November's Sprachstand has `Niveau (A0–C2)` instead of `Sprachniveau`): the app suggests the match from the header name and the values (they look like A0–C2), **blocks the run until a person confirms**, then remembers it in this browser. Next month: same clicks, no question.
- Unknown dropdown values (e.g. a status not in the template) → data-quality alert, run continues.
- Stichtag = export date (overridable); red window = 6 months (3/6/9/12 selectable).
- The 5 tables without templates (Klient, Sprachstand, Integrationsförderung, Unterbringung, Integrationszielerreichung) use headers from the data model, all in **one file**: `src/engine/import/signatures.ts`.

### 4.2 Rules engine

- **Current client**: end of responsibility ≥ Stichtag and not handed over to the municipality.
- **Scope goals 1–2**: status VA, F-FL, B-FL, B-RSFL, B-SL; age ≥ 16 on the Stichtag; S, N and `+5/+7` statuses not applicable (with the reason).
- **Goal 1**: entry = `Aufenthalt (Einreise)`; deadline = entry + 3 years. Reached by a proven row, an accepted A1 proof (certificate telc/fide, mother tongue, Swiss schooling, completed education), or German mother tongue. A1 with a course attendance note does not count → alert "A1 without accepted proof" (fixable). Reached after the deadline = green with a "late" marker. A running course ending before the deadline softens "at risk" to "on track". No entry date → not counted, shown in a note.
- **Goal 2**: job with a work contract, ≥ 60 %, 6 months without a break (two contract jobs add up: assumption). Volunteering, unpaid work, programme and placement jobs excluded by keyword; the exclusion is shown in the trace. Sek II / Tertiär counts on completion; a running apprenticeship is "on track" until it ends. "At risk" names the latest date a 60 % job must start.
- **Goal 3**: per household (Dossier-Nr.); free intervals between social-assistance periods; "at risk" names the date social assistance must end. Shown on every member, counted once per household.
- Every result carries a **trace**: rule, plain sentence, source table + row number.

### 4.3 Call list ("Anrufe diese Woche")

- Order: (1) at risk, soonest action date first; (2) deadline missed but fixable by a data fix; (3) no activity recorded for ≥ 6 months, longest first; (4) a course or job ends within 9 months with nothing after it. **Never ranked by money** (the setting cannot be switched on).
- Each client: one plain reason from the rule facts, the Situationsanalyse barrier with its **evidence sentence** (confirmed, or clearly labelled as a proposal with a Confirm button), the source rows, talking points.
- S. Keller (demo): Reza (support must end in 25 days) → Fatima (60 % job must start in 42 days) → Amina (A1 deadline in 112 days; two small children, no Kita place) → … → Yonas (missed, fixable proof).

### 4.4 Overview, Clients, Data quality

- Overview: key figures, target vs actual for all three goals, **Jetzt abrechenbar** (18: goal 1: 11, goal 2: 5, goal 3: 2 households), goal 1 by social worker and entry year, forecast (management), what-if 2027 (management).
- Clients: search, filters, "only people in goal scope", per-person detail with goals, trace, source rows and confirmed Situationsanalyse fields.
- Data quality: grouped alerts with severity, affected goal, count and the rows behind them (ZEMIS job missing in Erwerb, status mismatch, missing entry date, Bis before Von, …).

### 4.5 Local AI: Situationsanalyse extraction

1. The report (PDF or text) is split per person by the line `N. Individuelle Potenzialerhebung …: Name (Zemis-Nr. …)`.
2. **Names, ID numbers, dates, phone numbers and e-mails are replaced by placeholders** (`[PERSON_1]`, `[NR_2]`, …) before anything goes to the model; values are put back afterwards on the computer. The review screen shows "what the model saw".
3. The sentences are numbered. The model returns, per field, a value and **the number of the sentence** that states it (structured JSON output, temperature 0). Evidence is looked up by that number, so it is always the exact sentence and can never be invented.
4. Values are validated (allowed values, numbers); no sentence → "not stated", never a guess.
5. A social worker confirms or leaves each field empty. Only confirmed fields are used in Patterns.
10 fields: childcare without Kita place, literate in Latin script, understands Swiss German, learning pace, health limits work, availability, years of work experience, diplomas, driving licence, career wish.

**Measured accuracy (real numbers):**
- Generated test set: **97 %** of fields correct (396 of 410; 20 reports, 41 people), every evidence sentence found verbatim. Weakest: work experience 90 %, career wish 90 %, driving licence 93 %.
- Hand-written reports: **not measured yet** (waiting for your 3 reports).
Speed: about 15 s per person on this laptop. Results for 85 reports are cached and labelled "cached result of the local model".

### 4.6 Patterns ("Muster")

- Cohort: in-scope clients whose 3-year deadline has passed (170 people, 63 % reached on time).
- Reach rate per group with a 95 % range (Wilson interval).
- **Groups under 10 hidden**, and the whole factor hidden when a single small group could be worked out from the others.
- Order: factors ASD can act on first (literacy, course hours, early course, childcare, health), then equity (gender, literacy, always shown), then background; **nationality last and never the headline**.
- Finds the planted effect: not literate in Latin script 29 % vs literate 78 %.

### 4.7 Excel out

- `Cockpit_<date>.xlsx` (management): Übersicht (with a check row that the totals equal the person rows), Ziel1_Personen, Ziel2_Personen, Ziel3_Haushalte, Anrufliste, Abrechenbar, Muster, Datenqualität, Prognose, WhatIf_2027, Regeln, Lauf.
- `Anrufliste_<Name>_<date>.xlsx` per social worker: their call list, their clients, their data-quality items, rules.

### 4.8 What-if 2027 and forecast (management)

- What-if: end of responsibility 5 years from 01.01.2027 (interpretation A by default, B selectable in rules.yaml). Goals 2 and 3 recalculated, goal 1 unchanged. 305 clients get an earlier end; status changes for 107 (Fatima and Reza lose their window).
- Forecast: goals expected on time per quarter (running job, time without social assistance, course ending before the deadline). Counts only; CHF once lump sums are set in rules.yaml.

## 5. Data protection

> Built for Bern's cantonal data protection law (KDSG): runs on one computer, no cloud, names and numbers removed before the AI step, groups under 10 hidden.

- The built app has a Content-Security-Policy that blocks every network request except the app itself and the local model on `localhost:11434`. Fonts are bundled.
- Browser storage only holds column mappings, "called" marks, confirmed report fields and the language; *Lokale Daten löschen* clears it.
- No per-person score or prediction anywhere. Rules decide the traffic lights; AI only extracts; people confirm.

## 6. Synthetic data

- Two months (Stichtag 20.10.2026 and 20.11.2026), 11 tables each, ~650 clients, ~260 households, 4 social workers. Headers of the 6 templates copied byte for byte.
- 6 planted personas with exact facts (Yonas, Reza, Fatima, Amina, Mohammad, Sara).
- Planted effects for Patterns and planted mistakes for Data quality, listed in `sample-data/planted_effects.md`.
- 3 S. Keller households whose deadlines came earlier than Amina's were moved to other social workers, so the demo story's top three are the personas. Documented in `planted_effects.md`; the engine still computes every status.
- 286 Situationsanalyse reports (PDF + text) in the template's section structure; Amina's uses the approved prototype's text.

## 7. Rule decisions

`rules.yaml` v1.4. In the Rules panel every value carries its status:
- **Organisers' answer, awaiting ASD confirmation**: age on the Stichtag (Q2), accepted A1 proof (Q3), only contract jobs count (Q4), Sek II / Tertiär on completion (Q5).
- **Brief**: goal 2 = contract job ≥ 60 % for 6 months without a break.
- **Assumption**: which statuses count (Q1), two contract jobs add up (Q4), Nothilfe counts as support and the household deadline is the head's (Q6), 2027 interpretation (Q7), lump sums unknown (Q8), `+5/+7` = past responsibility (Q9), and the smaller ones (Q10–Q14).
Changing the organisers' answers did not change the call list, the claimable count (18) or the goal 2 totals on the November data; it added 9 info alerts "proven but not reproducible" (goal 2 recorded at apprenticeship start).

## 8. Tests (87, all passing: `npm test`)

| Area | Tests |
|---|---|
| Import | TI-01..08 (dates, detection by headers, renamed column, unknown value, missing table, determinism, header noise, key formats) + real .xlsx read |
| Scope | TS-01..07 + status history vs Klient |
| Goal 1 | T1-01..14 + window and language settings |
| Goal 2 | T2-01..10 (T2-05 updated for "counts on completion") + volunteering/unpaid exclusion + 60 % rule |
| Goal 3 | T3-01..07 |
| Data quality | TD-01..04 |
| Call list | TC-01 (full order Reza → Fatima → Amina → Yonas → Mohammad → Sara), TC-02, social-worker separation |
| Excel | TE-01..04 + Abrechenbar sheet |
| Patterns | TP-01..05 (Wilson 8/10 ≈ 49–94 %, suppression, confirmed-only, no per-person values) |
| What-if / forecast | TW-01..05 + quarterly forecast |
| AI guardrails | report splitting, PDF line wrapping, evidence by sentence number, "not stated", **no names/IDs/dates reach the prompt** |
| i18n | every message exists in German and English |

## 9. Not built (agreed)

Leichte Sprache client note, AI column-mapping suggestion (the column card honestly says "suggested from column name and values"), translations into Tigrinya/Dari, hosted public link (kept local by decision).
