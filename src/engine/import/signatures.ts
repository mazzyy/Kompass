// ALL export header strings live in this one file.
// 10 tables are copied byte-for-byte (and in column order) from ASD's templates (provisional: false).
// Integrationszielerreichung comes from the data-model diagram because its template is still missing
// (provisional: true): swap in the exact headers here when it arrives.

export type TableId =
  | 'klient'
  | 'asylverfahrensstand'
  | 'asylgeschaeftsdaten'
  | 'dossierperson'
  | 'finanz'
  | 'unterbringung'
  | 'sprachstand'
  | 'foerderung'
  | 'erwerb'
  | 'zemis'
  | 'zielerreichung';

export type ColType = 'key' | 'string' | 'date' | 'number' | 'bool';

export interface ColSpec {
  key: string; // field id used by the engine
  header: string; // exact German header
  alts?: string[]; // other spellings seen / expected
  type: ColType;
  required?: boolean; // needed by the rules engine
  values?: string; // key "<table>.<header>" of the dropdown list in TEMPLATE_VALUES (unknown_value check)
  extra?: boolean; // not in ASD's template: recognised if present, never required, not written to sample data
  profile?: 'level' | 'date' | 'percent' | 'zemis' | 'klientnr' | 'dossier'; // value profile for mapping suggestions
}

export interface TableSpec {
  id: TableId;
  name: string; // German table name (as in the data model)
  nameEn: string;
  file: string; // template file name (for sample data)
  provisional: boolean;
  columns: ColSpec[];
}

const zemisCol = (header: string): ColSpec => ({
  key: 'zemis',
  header,
  alts: ['Zemis Nummer', 'Klient/-in Zemis-Nr.', 'Zemis-Nr.', 'ZEMIS-Nr.'],
  type: 'key',
  required: true,
  profile: 'zemis',
});
const knrCol: ColSpec = { key: 'klientNr', header: 'Klientennummer', alts: ['Klient-Nr.', 'Klientnummer'], type: 'key', profile: 'klientnr' };
const dossierCol: ColSpec = { key: 'dossierNr', header: 'Dossier-Nr.', alts: ['Dossiernummer', 'Dossier Nr.'], type: 'key', profile: 'dossier' };

export const TABLES: TableSpec[] = [
  {
    id: 'klient',
    name: 'Klient',
    nameEn: 'Client',
    file: 'Hackathon_Klient_Resultat.xlsx',
    provisional: false,
    columns: [
      { ...dossierCol, required: true },
      { key: 'unterstuetzung', header: 'Unterstützung', alts: ['Unterstützung (aktuell)'], type: 'string', values: 'klient.Unterstützung' },
      zemisCol('Zemis Nummer'),
      { ...knrCol, required: true },
      { key: 'zBeginn', header: 'Zuständigkeitsbeginn', type: 'date', profile: 'date' },
      { key: 'zEnde', header: 'Zuständigkeitsende', type: 'date', required: true, profile: 'date' },
      { key: 'uebergang', header: 'Datum Übergang Gemeindezuständigkeit', type: 'date', profile: 'date' },
      { key: 'status', header: 'Verfahrensstand', alts: ['Verfahrensstand (aktuell)', 'Verfahrensstand aktuell'], type: 'string', required: true, values: 'asylverfahrensstand.Verfahrensstand' },
      { key: 'geschlecht', header: 'Geschlecht', type: 'string', values: 'klient.Geschlecht' },
      { key: 'nationalitaet', header: 'Nationalität Land', alts: ['Nationalität'], type: 'string' },
      { key: 'muttersprache', header: 'Muttersprache', type: 'string' },
      { key: 'zivilstand', header: 'Zivilstand', type: 'string', values: 'klient.Zivilstand' },
      { key: 'arbeitserfahrung', header: 'Jahre Arbeitserfahrung vor Einreise', type: 'number' },
      { key: 'ausbildung', header: 'Höchste abgeschlossene Ausbildung', type: 'string', values: 'klient.Höchste abgeschlossene Ausbildung' },
      { key: 'lateinisch', header: 'Lateinisch alphabetisiert', alts: ['Lateinisch alphabetisiert / Art Analphabetismus'], type: 'string', values: 'klient.Lateinisch alphabetisiert' },
      { key: 'analphabetismus', header: 'Art Analphabetismus', type: 'string', values: 'klient.Art Analphabetismus' },
      { key: 'schuljahre', header: 'Schuljahre vor Einreise', type: 'number' },
      { key: 'fallfuehrung', header: 'Fallführung', alts: ['Fallführung (Sozialarbeiter:in)', 'Fallführung (Sozialarbeiter/-in)', 'Sozialarbeiter:in'], type: 'string', required: true },
      { key: 'geburtsdatum', header: 'Geburtsdatum', alts: ['Geburtsdatum (für «ab 16 J.»)', 'Geburtsdatum (für "ab 16 J.")'], type: 'date', required: true, profile: 'date' },
      { key: 'name', header: 'Name', alts: ['Nachname'], type: 'string', extra: true },
      { key: 'vorname', header: 'Vorname', type: 'string', extra: true },
    ],
  },
  {
    id: 'asylverfahrensstand',
    name: 'Asylverfahrensstand',
    nameEn: 'Asylum procedure status',
    file: 'Hackathon_Asylverfahrensstand_Resultat.xlsx',
    provisional: false,
    columns: [
      zemisCol('Zemis Nummer'),
      knrCol,
      dossierCol,
      { key: 'von', header: 'Verfahrensstand Gültig ab', type: 'date', required: true, profile: 'date' },
      { key: 'bis', header: 'Verfahrensstand Gültig bis', type: 'date', profile: 'date' },
      { key: 'status', header: 'Verfahrensstand', type: 'string', required: true, values: 'asylverfahrensstand.Verfahrensstand' },
    ],
  },
  {
    id: 'asylgeschaeftsdaten',
    name: 'Asylgeschäftsdaten',
    nameEn: 'Asylum case events',
    file: 'Hackathon_Asylgeschäftsdaten_Resultat.xlsx',
    provisional: false,
    columns: [
      zemisCol('Klient/-in Zemis-Nr.'),
      knrCol,
      { key: 'art', header: 'Asylgeschäftsart', type: 'string', required: true, values: 'asylgeschaeftsdaten.Asylgeschäftsart' },
      { key: 'datum', header: 'Ereignisdatum', type: 'date', required: true, profile: 'date' },
      { key: 'erledigung', header: 'Erledigung', type: 'string', values: 'asylgeschaeftsdaten.Erledigung' },
      { key: 'erledigungscode', header: 'Erledigungscode', type: 'string' },
      { key: 'erledigungsdatum', header: 'Erledigungsdatum', type: 'date', profile: 'date' },
    ],
  },
  {
    id: 'dossierperson',
    name: 'Dossierperson',
    nameEn: 'Household member',
    file: 'Hackathon_Dossierperson_Resultat.xlsx',
    provisional: false,
    columns: [
      { ...dossierCol, required: true },
      knrCol,
      zemisCol('Zemis Nummer'),
      { key: 'von', header: 'Dossierperson Von', type: 'date', profile: 'date' },
      { key: 'bis', header: 'Dossierperson Bis', type: 'date', profile: 'date' },
      { key: 'rolle', header: 'Rolle', type: 'string', values: 'dossierperson.Rolle' },
      { key: 'beziehung', header: 'Beziehung', type: 'string', values: 'dossierperson.Beziehung' },
    ],
  },
  {
    id: 'finanz',
    name: 'Finanzielle Unterstützung',
    nameEn: 'Financial support',
    file: 'Hackathon_Finanzielle_Unterstützung_Resultat.xlsx',
    provisional: false,
    columns: [
      { ...dossierCol, required: true },
      { key: 'art', header: 'Unterstützung', type: 'string', required: true, values: 'finanz.Unterstützung' },
      { key: 'von', header: 'Finanzielle Unterstützung Gültig von', type: 'date', required: true, profile: 'date' },
      { key: 'bis', header: 'Finanzielle Unterstützung Gültig bis', type: 'date', profile: 'date' },
      { key: 'grund', header: 'Hauptgrund Beendigung Unterstützung', type: 'string', values: 'finanz.Hauptgrund Beendigung Unterstützung' },
    ],
  },
  {
    id: 'unterbringung',
    name: 'Unterbringung',
    nameEn: 'Accommodation',
    file: 'Hackathon_Unterbringung_Resultat.xlsx',
    provisional: false,
    columns: [
      { ...knrCol, required: true },
      { key: 'von', header: 'Unterbringung Von', alts: ['Von'], type: 'date', profile: 'date' },
      { key: 'bis', header: 'Unterbringung Bis', alts: ['Bis'], type: 'date', profile: 'date' },
      { key: 'art', header: 'Unterbringung Art', alts: ['Art Unterbringung', 'Unterbringungsart'], type: 'string', required: true, values: 'unterbringung.Unterbringung Art' },
      { key: 'plz', header: 'PLZ', type: 'string' },
      { key: 'ort', header: 'Ort', alts: ['PLZ / Ort'], type: 'string' },
    ],
  },
  {
    id: 'sprachstand',
    name: 'Sprachstand',
    nameEn: 'Language level',
    file: 'Hackathon_Sprachstand_Resultat.xlsx',
    provisional: false,
    columns: [
      zemisCol('Klient/-in Zemis-Nr.'),
      knrCol,
      { key: 'sprache', header: 'Sprache', type: 'string', required: true, values: 'sprachstand.Sprache' },
      { key: 'niveau', header: 'Sprachniveau', type: 'string', required: true, profile: 'level', values: 'sprachstand.Sprachniveau' },
      { key: 'art', header: 'Art', alts: ['Art (Nachweis)', 'Nachweis'], type: 'string', required: true, values: 'sprachstand.Art' },
      { key: 'bemerkungen', header: 'Bemerkungen', type: 'string' },
      { key: 'datum', header: 'Datum Erreichung', alts: ['Datum'], type: 'date', required: true, profile: 'date' },
    ],
  },
  {
    id: 'foerderung',
    name: 'Integrationsförderung und Ausbildung',
    nameEn: 'Integration support and education',
    file: 'Hackathon_Integrationsförderung_und_Ausbildung_Resultat.xlsx',
    provisional: false,
    columns: [
      zemisCol('Klient/-in Zemis-Nr.'),
      knrCol,
      { key: 'start', header: 'Start', type: 'date', required: true, profile: 'date' },
      { key: 'abschluss', header: 'Abschluss', type: 'date', profile: 'date' },
      { key: 'institution', header: 'Institution Name', type: 'string' },
      { key: 'art', header: 'Art', type: 'string', required: true, values: 'foerderung.Art' },
      { key: 'bezeichnung', header: 'Bezeichnung', type: 'string' },
      { key: 'stunden', header: 'Stunden pro Woche', type: 'number' },
      { key: 'bemerkungen', header: 'Bemerkungen', type: 'string' },
    ],
  },
  {
    id: 'erwerb',
    name: 'Erwerb',
    nameEn: 'Employment',
    file: 'Hackathon_Erwerb_Resultat.xlsx',
    provisional: false,
    columns: [
      zemisCol('Klient/-in Zemis-Nr.'),
      knrCol,
      { key: 'von', header: 'Von', type: 'date', required: true, profile: 'date' },
      { key: 'bis', header: 'Bis', type: 'date', profile: 'date' },
      { key: 'arbeitgeber', header: 'Arbeitgeber Name', type: 'string' },
      { key: 'ort', header: 'Arbeitgeber Ort', type: 'string' },
      { key: 'pensum', header: 'Pensum %', type: 'number', required: true, profile: 'percent' },
      { key: 'erwerbsstatus', header: 'Erwerbsstatus', type: 'string', values: 'erwerb.Erwerbsstatus' },
      { key: 'einkommen', header: 'Monatseinkommen brutto CHF', type: 'number' },
      { key: 'stundenlohn', header: 'Stundenlohn', type: 'number' },
      { key: 'unregelmaessig', header: 'Unregelmässiges Einkommen', type: 'bool' },
      { key: 'abtretung', header: 'Abtretung Sozialdienst', type: 'bool' },
      { key: 'bemerkungen', header: 'Bemerkungen', type: 'string' },
    ],
  },
  {
    id: 'zemis',
    name: 'ZEMIS Tätigkeit',
    nameEn: 'ZEMIS employment',
    file: 'Hackathon_ZEMIS_Tätigkeit_Resultat.xlsx',
    provisional: false,
    columns: [
      zemisCol('Zemis Nummer'),
      knrCol,
      { key: 'von', header: 'Arbeitsbeginn', type: 'date', required: true, profile: 'date' },
      { key: 'bis', header: 'Verpflichtet bis', type: 'date', profile: 'date' },
      { key: 'betrieb', header: 'Betrieb', type: 'string', required: true },
    ],
  },
  {
    id: 'zielerreichung',
    name: 'Integrationszielerreichung',
    nameEn: 'Integration goals reached',
    file: 'Hackathon_Integrationszielerreichung_Resultat.xlsx',
    provisional: true,
    columns: [
      zemisCol('Klient/-in Zemis-Nr.'),
      { key: 'art', header: 'Art (Ziel)', alts: ['Art Ziel', 'Ziel'], type: 'string', required: true },
      { key: 'datum', header: 'Erreicht am', type: 'date', required: true, profile: 'date' },
      { key: 'partner', header: 'Partner (Region)', type: 'string' },
      { key: 'kohorte', header: 'Jahr Grundgesamtheit (Kohorte)', alts: ['Jahr Grundgesamtheit'], type: 'number' },
      { key: 'statusS', header: 'Ziel mit Status S erreicht', type: 'bool' },
    ],
  },
];

export const TABLE_BY_ID: Record<TableId, TableSpec> = Object.fromEntries(TABLES.map((t) => [t.id, t])) as Record<
  TableId,
  TableSpec
>;
