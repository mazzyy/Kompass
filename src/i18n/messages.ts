import type { Msg } from '../engine/model';

export type Lang = 'de' | 'en';
type Dict = Record<string, string>;

// Engine messages (reasons, traces, alerts, call-list leads, talking points, notes).
const de: Dict = {
  // scope
  'na.no_status': 'Kein Verfahrensstand erfasst',
  'na.unknown_status': 'Unbekannter Status «{status}»',
  'na.past_responsibility': 'Zuständigkeit beendet ({status})',
  'na.status': 'Status {status}',
  'na.status_not_in_scope': 'Status {status} gehört nicht zu den Zielen',
  'na.under_age': 'Unter {min} Jahre ({age} J. am {ref})',
  // goal 1
  'g1.na.born_ch': 'In der Schweiz geboren',
  'g1.no_entry': 'Kein Einreisedatum («{event}» fehlt) – nicht gezählt',
  'g1.trace.deadline': 'Einreise {entry} + {years} Jahre = Frist {deadline}',
  'g1.reached.proven': 'Erreicht am {date}, belegt in Integrationszielerreichung',
  'g1.reached.proven_late': 'Erreicht am {date} (nach der Frist {deadline}), belegt',
  'g1.reached.cert': 'Deutsch {level} ({art}) am {date}',
  'g1.reached.cert_late': 'Deutsch {level} ({art}) am {date}, nach der Frist {deadline}',
  'g1.reached.mother': 'Muttersprache Deutsch',
  'g1.reached.mother_late': 'Muttersprache Deutsch',
  'g1.trace.proof_not_accepted': 'Deutsch {level} am {date}, Nachweis «{art}» zählt nicht',
  'g1.trace.level': 'Letzter Sprachstand: {level} ({art}) am {date}',
  'g1.trace.last_course': 'Letzter Kurs «{course}» endete am {end}',
  'g1.missed': 'Frist {deadline} verpasst, kein anerkannter A1-Nachweis',
  'g1.missed.proof': 'Frist {deadline} verpasst; A1 vorhanden, aber Nachweis «{art}» zählt nicht',
  'g1.at_risk': 'A1-Frist {deadline} in {days} Tagen, kein Nachweis',
  'g1.at_risk.proof': 'A1-Frist {deadline} in {days} Tagen; Nachweis «{art}» zählt nicht',
  'g1.at_risk.course_late': 'A1-Frist {deadline} in {days} Tagen; Kurs «{course}» endet erst {end}',
  'g1.at_risk.last_course': 'A1-Frist {deadline} in {days} Tagen; letzter Kurs endete {end}, kein Zertifikat',
  'g1.at_risk.no_course': 'A1-Frist {deadline} in {days} Tagen; kein Kurs und kein Zertifikat erfasst',
  'g1.on_track': 'Frist {deadline}, noch {months} Monate',
  'g1.on_track.running': 'Frist {deadline}, noch {months} Monate; Kurs «{course}» läuft',
  'g1.on_track.course': 'Kurs «{course}» läuft bis {end}, vor der Frist {deadline}',
  // data quality
  'dq.status_mismatch': 'Klient sagt «{klient}», Asylverfahrensstand am Stichtag sagt «{hist}» (verwendet)',
  'dq.missing_case_manager': 'Keine Fallführung erfasst',
  'dq.born_in_ch': 'In der Schweiz geboren (Aufenthalt (Geburt)), nicht in Ziel 1',
  'dq.missing_entry_event': '«{event}» fehlt in Asylgeschäftsdaten',
  'dq.proven_not_reproduced': 'Ziel {goal} belegt ({date}), aber aus den Daten nicht nachvollziehbar',
  'dq.reached_not_recorded': 'Ziel {goal} laut Daten erreicht ({date}), aber nicht in Integrationszielerreichung',
  'dq.a1_without_accepted_proof': 'Deutsch {level} erfasst, Nachweis «{art}» zählt nicht',
  'dq.unknown_value': '{table}, Spalte «{column}»: Wert «{value}» steht nicht in der Vorlage ({n} Zeilen)',
  'dq.bad_date': '{table}, Spalte «{column}»: «{value}» ist kein Datum',
  'dq.invalid_period': '{table}: Bis {bis} liegt vor Von {von}',
  // call list
  'call.inactive': 'Seit {months} Monaten keine Aktivität erfasst (zuletzt {date})',
  'call.inactive_never': 'Keine Aktivität erfasst (kein Kurs, keine Arbeit, kein Sprachnachweis)',
  'call.transition': '«{what}» endet am {date}, danach ist nichts erfasst',
  'tp.g1.proof': 'Vorhandener Nachweis zählt nicht: Zertifikat (telc/fide) prüfen',
  'tp.g1.book_exam': 'A1-Prüfung (telc oder fide) vor dem {deadline} buchen',
  'tp.g1.course': 'Deutschkurs mit Abschluss vor dem {deadline} vereinbaren',
  'tp.g1.barriers': 'Hindernisse klären (Kinderbetreuung, Gesundheit, Arbeitszeiten)',
  'tp.g2.job': 'Stelle mit mindestens 60 % muss bis {date} beginnen',
  'tp.g2.pensum': 'Mit Arbeitgeber über höheres Pensum sprechen',
  'tp.g3.income': 'Sozialhilfe muss bis {date} enden: Einkommen im Haushalt besprechen',
  'tp.g3.budget': 'Budget und Ablösung planen',
  'tp.inactive': 'Aktuellen Stand erfragen: Kurs, Arbeit, Sprachnachweis',
  'tp.transition': 'Anschluss nach «{what}» (endet {date}) planen',
  // notes
  'note.no_klient': 'Klient fehlt: ohne Klient kann nichts berechnet werden.',
  'note.no_goal1_sprachstand': 'Ziel 1 kann ohne Sprachstand nicht berechnet werden.',
  'note.no_goal1_events': 'Ziel 1 kann ohne Asylgeschäftsdaten (Einreise) nicht berechnet werden.',
  'note.no_entry': '{n} ohne Einreisedatum werden nicht gezählt (siehe Datenqualität).',
};

const en: Dict = {
  'na.no_status': 'No procedure status recorded',
  'na.unknown_status': 'Unknown status "{status}"',
  'na.past_responsibility': 'Past end of responsibility ({status})',
  'na.status': 'Status {status}',
  'na.status_not_in_scope': 'Status {status} is not part of the goals',
  'na.under_age': 'Under {min} ({age} on {ref})',
  'g1.na.born_ch': 'Born in Switzerland',
  'g1.no_entry': 'No entry date ("{event}" missing): not counted',
  'g1.trace.deadline': 'Entry {entry} + {years} years = deadline {deadline}',
  'g1.reached.proven': 'Reached on {date}, proven in Integrationszielerreichung',
  'g1.reached.proven_late': 'Reached on {date} (after the deadline {deadline}), proven',
  'g1.reached.cert': 'German {level} ({art}) on {date}',
  'g1.reached.cert_late': 'German {level} ({art}) on {date}, after the deadline {deadline}',
  'g1.reached.mother': 'Mother tongue German',
  'g1.reached.mother_late': 'Mother tongue German',
  'g1.trace.proof_not_accepted': 'German {level} on {date}; proof "{art}" does not count',
  'g1.trace.level': 'Latest language level: {level} ({art}) on {date}',
  'g1.trace.last_course': 'Last course "{course}" ended on {end}',
  'g1.missed': 'Deadline {deadline} missed, no accepted A1 proof',
  'g1.missed.proof': 'Deadline {deadline} missed; A1 recorded but proof "{art}" does not count',
  'g1.at_risk': 'A1 deadline {deadline} in {days} days, no proof',
  'g1.at_risk.proof': 'A1 deadline {deadline} in {days} days; proof "{art}" does not count',
  'g1.at_risk.course_late': 'A1 deadline {deadline} in {days} days; course "{course}" only ends {end}',
  'g1.at_risk.last_course': 'A1 deadline {deadline} in {days} days; last course ended {end}, no certificate',
  'g1.at_risk.no_course': 'A1 deadline {deadline} in {days} days; no course and no certificate recorded',
  'g1.on_track': 'Deadline {deadline}, {months} months left',
  'g1.on_track.running': 'Deadline {deadline}, {months} months left; course "{course}" running',
  'g1.on_track.course': 'Course "{course}" runs until {end}, before the deadline {deadline}',
  'dq.status_mismatch': 'Klient says "{klient}", status history on the Stichtag says "{hist}" (used)',
  'dq.missing_case_manager': 'No case manager recorded',
  'dq.born_in_ch': 'Born in Switzerland (Aufenthalt (Geburt)), not in goal 1',
  'dq.missing_entry_event': '"{event}" missing in Asylgeschäftsdaten',
  'dq.proven_not_reproduced': 'Goal {goal} proven ({date}) but not reproducible from the data',
  'dq.reached_not_recorded': 'Goal {goal} reached according to the data ({date}) but not in Integrationszielerreichung',
  'dq.a1_without_accepted_proof': 'German {level} recorded, proof "{art}" does not count',
  'dq.unknown_value': '{table}, column "{column}": value "{value}" is not in the template ({n} rows)',
  'dq.bad_date': '{table}, column "{column}": "{value}" is not a date',
  'dq.invalid_period': '{table}: Bis {bis} is before Von {von}',
  'call.inactive': 'No activity recorded for {months} months (last {date})',
  'call.inactive_never': 'No activity recorded (no course, job or language proof)',
  'call.transition': '"{what}" ends on {date}, nothing recorded after it',
  'tp.g1.proof': 'Existing proof does not count: check for a telc/fide certificate',
  'tp.g1.book_exam': 'Book an A1 exam (telc or fide) before {deadline}',
  'tp.g1.course': 'Agree a German course that ends before {deadline}',
  'tp.g1.barriers': 'Clarify barriers (childcare, health, working hours)',
  'tp.g2.job': 'A job of at least 60 % must start by {date}',
  'tp.g2.pensum': 'Talk to the employer about a higher workload',
  'tp.g3.income': 'Social assistance must end by {date}: discuss household income',
  'tp.g3.budget': 'Plan budget and exit from social assistance',
  'tp.inactive': 'Ask about the current situation: course, work, language proof',
  'tp.transition': 'Plan what follows "{what}" (ends {date})',
  'note.no_klient': 'Klient is missing: nothing can be computed without it.',
  'note.no_goal1_sprachstand': 'Goal 1 cannot be computed without Sprachstand.',
  'note.no_goal1_events': 'Goal 1 cannot be computed without Asylgeschäftsdaten (entry).',
  'note.no_entry': '{n} without entry date are not counted (see data quality).',
};

export const ENGINE_MESSAGES: Record<Lang, Dict> = { de, en };

export function fill(tpl: string, p?: Record<string, string | number>): string {
  if (!p) return tpl;
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (p[k] === undefined ? `{${k}}` : String(p[k])));
}

export function msg(lang: Lang, m: Msg | undefined): string {
  if (!m) return '';
  const tpl = ENGINE_MESSAGES[lang][m.key] ?? ENGINE_MESSAGES.de[m.key] ?? m.key;
  return fill(tpl, m.p);
}
