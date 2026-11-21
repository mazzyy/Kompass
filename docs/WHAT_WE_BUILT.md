# Integrations-Cockpit: what we built and how it works

AI for Access hackathon, Bern, 20–21 Nov 2026. Challenge owner: Asylsozialdienst (ASD) Stadt Bern.
State: Sat 21.11.2026, 10:45. **All data is synthetic. No real people.**

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
| Tests | Vitest, 102 tests | `tests/` |

Single source of truth: one run produces one `RunResult`; every screen and every Excel sheet is drawn from it, so screen and Excel can never disagree. No number is hard-coded.

## 4. Feature by feature

### 4.1 Excel in ("Monatslauf")

- Drop files or a folder, or load the sample month (October / November 2026).
- Each file is matched to one of the 11 tables **by its column headers**, not the file name (headers normalised: case, spaces, umlauts, non-breaking spaces).
- Dates: real Excel dates and Swiss text `dd.mm.yyyy`, `d.m.yy` all work. Keys: `'12345678` and `12345678` join.
- **Renamed column** (November's Sprachstand has `Niveau (A0–C2)` instead of `Sprachniveau`): the app suggests the match from the header name and the values (they look like A0–C2), **blocks the run until a person confirms**, then remembers it in this browser. Next month: same clicks, no question.
- Unknown dropdown values (e.g. a status not in the template) → data-quality alert, run continues.
- Stichtag = export date (overridable); red window = 6 months (3/6/9/12 selectable).
- **10 of 11 tables match ASD's templates byte for byte, in column order, with their dropdown values** (a test checks this against the template files in `templates/`). Only Integrationszielerreichung still uses headers from the data model (template not received). All headers live in **one file**: `src/engine/import/signatures.ts`.
- The Klient export has **no name columns**. The app shows a client's name only from their own Situationsanalyse report when it has been read on this computer; otherwise the client number (K-10482). Names are never sent to the model.

### 4.2 Rules engine

- **Current client**: end of responsibility ≥ Stichtag and not handed over to the municipality.
- **Scope goals 1–2**: status VA, F-FL, B-FL, B-RSFL, B-SL; age ≥ 16 on the Stichtag; S, N and `+5/+7` statuses not applicable (with the reason: federal payment period over).
- **Payment period** (brief + organisers): goals 2 and 3 only pay if reached within the federal payment period, which depends on the permit, exactly as in the brief: **7 years from entry** for VA and F-FL, **5 years from the asylum application** for B-FL, B-RSFL and B-SL (application = first Asylgeschäftsdaten event starting with "Asylgesuch"; if there is none, the entry date is used and the trace says so). People arriving from 01.01.2027 get 5 years for every permit (2027 rule). Deadline for goals 2 and 3 = the earlier of the payment-period end and Zuständigkeitsende; if the two differ by more than 31 days, Data quality shows it. The client detail shows e.g. "Federal payment: VA → 7 years from entry, until …". Open point: ASD's status list contains `B-RSFL+7`, which contradicts the brief's 5 years; the brief is applied.
- **Goal 1**: entry = `Aufenthalt (Einreise)`; deadline = entry + 3 years. Reached by a proven row, an accepted A1 proof (certificate telc/fide, mother tongue, Swiss schooling, completed education), or German mother tongue. A1 with a course attendance note does not count → alert "A1 without accepted proof" (fixable). Reached after the deadline = green with a "late" marker. A running course ending before the deadline softens "at risk" to "on track". No entry date → not counted, shown in a note.
- **Goal 2**: job with a work contract, ≥ 60 %, 6 months without a break (two contract jobs add up: assumption). Volunteering, unpaid work, programme and placement jobs excluded by keyword; the exclusion is shown in the trace. Sek II / Tertiär counts on completion; a running apprenticeship is "on track" until it ends. "At risk" names the latest date a 60 % job must start.
- **Goal 3**: per household (Dossier-Nr.); free intervals between social-assistance periods; "at risk" names the date social assistance must end. Shown on every member, counted once per household.
- Every result carries a **trace**: rule, plain sentence, source table + row number.

### 4.3 Call list ("Anrufe diese Woche")

- Order: (1) at risk, soonest action date first; (2) deadline missed but fixable by a data fix; (3) no activity recorded for ≥ 6 months, longest first; (4) a course or job ends within 9 months with nothing after it. **Never ranked by money** (the setting cannot be switched on).
- Each client: one plain reason from the rule facts, the Situationsanalyse barrier with its **evidence sentence** (confirmed, or clearly labelled as a proposal with a Confirm button), the source rows, talking points.
- S. Keller (demo): Reza (support must end in 25 days) → Fatima (60 % job must start in 42 days) → Amina (A1 deadline in 112 days; two small children, no Kita place) → … → Yonas (missed, fixable proof).

### 4.4a Goal in detail ("Ziel im Detail")

Click a goal on the Overview (or "Ziel im Detail" in the menu; tabs switch between goals 1, 2, 3). One page per goal, for management (all) or one social worker (their clients):
- Key figures: counted, reached %, on track, at risk, missed, not applicable / no data.
- **Who is lagging behind and why**: at risk + missed, grouped by the reason from the rules (e.g. goal 1: "deadline missed, no A1 proof" 53, "course finished, no exam" 11, "A1 proof does not count, fixable by a data correction" 6). Clicking a reason filters the list.
- Barriers from the Situationsanalyse among the people lagging behind (childcare without daycare, not literate in Latin script, slow learning pace, health, availability): counts only, confirmed and model proposals shown separately; they explain, they never set a light.
- Lagging behind per social worker (share and most common reason).
- The list: client, status, deadline with days left / overdue, the rule reason, last activity, Situationsanalyse barriers; click opens the client.
- Deadlines in the next 12 months (red = already at risk), by social worker and by entry year, and why people are not counted.
- The Overview also has **Caseload per social worker** (clients, households, red, missed, on call list, data-quality items).

The banner says "Sample data loaded · synthetic" only when the built-in sample data is loaded; with your own exports it says "Your own exports loaded". Both say everything runs on this computer.

### 4.4 Overview, Clients, Data quality

- Overview: key figures, target vs actual for all three goals, **Jetzt abrechenbar** (18: goal 1: 11, goal 2: 4, goal 3: 3 households), goal 1 by social worker and entry year, forecast (management), what-if 2027 (management).
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

- 2027 rule: the organisers said it applies to people **arriving from 01.01.2027** (interpretation B, the default). It is already built into every deadline, so the what-if shows 0 current clients affected and says why. Interpretation A (also for today's 7-year clients) can still be switched on in rules.yaml as a what-if: 316 clients would get an earlier deadline. Goals 2 and 3 recalculated, goal 1 unchanged.
- Forecast: goals expected on time per quarter (running job, time without social assistance, course ending before the deadline). Counts only; CHF once lump sums are set in rules.yaml.

## 5. Data protection

> Built for Bern's cantonal data protection law (KDSG): runs on one computer, no cloud, names and numbers removed before the AI step, groups under 10 hidden.

- The built app has a Content-Security-Policy that blocks every network request except the app itself and the local model on `localhost:11434`. Fonts are bundled.
- Browser storage only holds column mappings, "called" marks, confirmed report fields and the language; *Lokale Daten löschen* clears it.
- No per-person score or prediction anywhere. Rules decide the traffic lights; AI only extracts; people confirm.

## 6. Synthetic data

- Two months (Stichtag 20.10.2026 and 20.11.2026), 11 tables each, ~650 clients, ~260 households, 4 social workers. Headers of the 6 templates copied byte for byte.
- Exact template format: headers, column order and dropdown values of the 10 received templates; no names in Klient.
- 6 planted personas with exact facts (Yonas, Reza, Fatima, Amina, Mohammad, Sara).
- Planted effects for Patterns and planted mistakes for Data quality, listed in `sample-data/planted_effects.md`.
- 3 S. Keller households whose deadlines came earlier than Amina's were moved to other social workers, so the demo story's top three are the personas. Documented in `planted_effects.md`; the engine still computes every status.
- 286 Situationsanalyse reports (PDF + text) in the template's section structure; Amina's uses the approved prototype's text.

## 7. Rule decisions

`rules.yaml` v1.6 (payment period 7 years from entry for VA / F-FL, 5 years from the asylum application for B-*, 2027 rule for new arrivals; A1 proof and language courses use the template values: `Zertifizierung`, `Muttersprache`, `Beendigung obligatorische Schulzeit`, `Beendigung Ausbildung` count, `Weiteres` does not; language courses = `Förderangebot Sprache`). In the Rules panel every value carries its status:
- **Organisers' answer, awaiting ASD confirmation**: the five permits VA, F-FL, B-FL, B-RSFL, B-SL (Q1), age on the Stichtag (Q2), accepted A1 proof (Q3), only contract jobs count (Q4), Sek II / Tertiär on completion (Q5), 2027 rule for arrivals from 2027 (Q7), payment period 5 or 7 years by permit and `+5/+7` = period over (Q9).
- **Brief**: goal 2 = contract job ≥ 60 % for 6 months without a break.
- **Assumption**: two contract jobs add up (Q4), Nothilfe counts as support and the household deadline is the head's (Q6), lump sums unknown (Q8), and the smaller ones (Q10–Q14).
After regenerating the synthetic data in the template format (apprenticeships recorded on completion), November shows: goal 2 counted 322, reached 90, on track 214, at risk 6, overdue 12; claimable 18. S. Keller's call list is unchanged (Reza → Fatima → Amina). The payment-period rule (v1.6) changed none of these numbers: the synthetic Zuständigkeitsende already matched the period, except B-RSFL, which the generator now writes as 7 years (0 mismatches).

## 8. Tests (102, all passing: `npm test`)

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
| Payment period | TZ-01..07 (brief: 7 years from entry for VA/F-FL, 5 years from application for B-*; fallback to entry without application; deadline follows the period; earlier Zuständigkeitsende kept + Data quality; 2027 rule for arrivals from 2027; `+7` not counted) |
| What-if / forecast | TW-01..05 (TW-01..03, 05 with interpretation A; TW-04 default B) + quarterly forecast |
| AI guardrails | report splitting, PDF line wrapping, evidence by sentence number, "not stated", **no names/IDs/dates reach the prompt** |
| i18n | every message exists in German and English |
| Templates | 10 templates recognised, headers byte for byte and in order, only Integrationszielerreichung provisional |

## 9. Not built (agreed)

Leichte Sprache client note, AI column-mapping suggestion (the column card honestly says "suggested from column name and values"), translations into Tigrinya/Dari, hosted public link (kept local by decision).
