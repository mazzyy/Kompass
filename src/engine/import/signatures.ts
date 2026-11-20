// ALL export header strings live in this one file.
// 6 tables are copied byte-for-byte from ASD's templates (provisional: false).
// 5 tables come from the data-model diagram because the templates are missing (provisional: true):
// swap in the exact headers here when ASD sends them.

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
  values?: string; // name of the dropdown list in TEMPLATE_VALUES (unknown_value check)
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
    provisional: true,
    columns: [
      { ...knrCol, required: true },
      zemisCol('Zemis Nummer'),
      { ...dossierCol, required: true },
      { key: 'name', header: 'Name', alts: ['Nachname'], type: 'string' },
      { key: 'vorname', header: 'Vorname', type: 'string' },
      { key: 'zBeginn', header: 'Zuständigkeitsbeginn', type: 'date', profile: 'date' },
      { key: 'zEnde', header: 'Zuständigkeitsende', type: 'date', required: true, profile: 'date' },
      { key: 'uebergang', header: 'Datum Übergang Gemeindezuständigkeit', type: 'date', profile: 'date' },
      { key: 'status', header: 'Verfahrensstand (aktuell)', alts: ['Verfahrensstand aktuell', 'Verfahrensstand'], type: 'string', required: true, values: 'Verfahrensstand' },
      { key: 'unterstuetzung', header: 'Unterstützung (aktuell)', alts: ['Unterstützung aktuell'], type: 'string', values: 'Unterstützung' },
      { key: 'fallfuehrung', header: 'Fallführung (Sozialarbeiter:in)', alts: ['Fallführung', 'Fallführung (Sozialarbeiter/-in)', 'Sozialarbeiter:in'], type: 'string', required: true },
      { key: 'geburtsdatum', header: 'Geburtsdatum', alts: ['Geburtsdatum (für «ab 16 J.»)', 'Geburtsdatum (für "ab 16 J.")'], type: 'date', required: true, profile: 'date' },
      { key: 'geschlecht', header: 'Geschlecht', type: 'string' },
      { key: 'nationalitaet', header: 'Nationalität Land', alts: ['Nationalität'], type: 'string' },
      { key: 'zivilstand', header: 'Zivilstand', type: 'string' },
      { key: 'muttersprache', header: 'Muttersprache', type: 'string' },
      { key: 'ausbildung', header: 'Höchste abgeschlossene Ausbildung', type: 'string' },
      { key: 'schuljahre', header: 'Schuljahre vor Einreise', type: 'number' },
      { key: 'lateinisch', header: 'Lateinisch alphabetisiert / Art Analphabetismus', alts: ['Lateinisch alphabetisiert'], type: 'string' },
      { key: 'arbeitserfahrung', header: 'Jahre Arbeitserfahrung vor Einreise', type: 'number' },
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
      { key: 'status', header: 'Verfahrensstand', type: 'string', required: true, values: 'Verfahrensstand' },
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
      { key: 'art', header: 'Asylgeschäftsart', type: 'string', required: true, values: 'Asylgeschäftsart' },
      { key: 'datum', header: 'Ereignisdatum', type: 'date', required: true, profile: 'date' },
      { key: 'erledigung', header: 'Erledigung', type: 'string', values: 'Erledigung' },
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
      { key: 'rolle', header: 'Rolle', type: 'string', values: 'Rolle' },
      { key: 'beziehung', header: 'Beziehung', type: 'string', values: 'Beziehung' },
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
      { key: 'art', header: 'Unterstützung', type: 'string', required: true, values: 'Unterstützung' },
      { key: 'von', header: 'Finanzielle Unterstützung Gültig von', type: 'date', required: true, profile: 'date' },
      { key: 'bis', header: 'Finanzielle Unterstützung Gültig bis', type: 'date', profile: 'date' },
      { key: 'grund', header: 'Hauptgrund Beendigung Unterstützung', type: 'string', values: 'Hauptgrund Beendigung Unterstützung' },
    ],
  },
  {
    id: 'unterbringung',
    name: 'Unterbringung',
    nameEn: 'Accommodation',
    file: 'Hackathon_Unterbringung_Resultat.xlsx',
    provisional: true,
    columns: [
      { ...knrCol, required: true },
      { key: 'von', header: 'Von', alts: ['Unterbringung Von'], type: 'date', profile: 'date' },
      { key: 'bis', header: 'Bis', alts: ['Unterbringung Bis'], type: 'date', profile: 'date' },
      { key: 'art', header: 'Unterbringung Art', alts: ['Art Unterbringung', 'Unterbringungsart'], type: 'string', required: true },
      { key: 'ort', header: 'PLZ / Ort', alts: ['Ort', 'PLZ Ort'], type: 'string' },
    ],
  },
  {
    id: 'sprachstand',
    name: 'Sprachstand',
    nameEn: 'Language level',
    file: 'Hackathon_Sprachstand_Resultat.xlsx',
    provisional: true,
    columns: [
      zemisCol('Klient/-in Zemis-Nr.'),
      knrCol,
      { key: 'sprache', header: 'Sprache', type: 'string', required: true },
      { key: 'niveau', header: 'Sprachniveau', type: 'string', required: true, profile: 'level' },
      { key: 'art', header: 'Art', alts: ['Art (Nachweis)', 'Nachweis'], type: 'string', required: true },
      { key: 'datum', header: 'Datum Erreichung', alts: ['Datum'], type: 'date', required: true, profile: 'date' },
      { key: 'bemerkungen', header: 'Bemerkungen', type: 'string' },
    ],
  },
  {
    id: 'foerderung',
    name: 'Integrationsförderung und Ausbildung',
    nameEn: 'Integration support and education',
    file: 'Hackathon_Integrationsförderung_und_Ausbildung_Resultat.xlsx',
    provisional: true,
    columns: [
      zemisCol('Klient/-in Zemis-Nr.'),
      knrCol,
      { key: 'start', header: 'Start', type: 'date', required: true, profile: 'date' },
      { key: 'abschluss', header: 'Abschluss', type: 'date', profile: 'date' },
      { key: 'art', header: 'Art', type: 'string', required: true },
      { key: 'bezeichnung', header: 'Bezeichnung', type: 'string' },
      { key: 'stunden', header: 'Stunden pro Woche', type: 'number' },
      { key: 'institution', header: 'Institution Name', type: 'string' },
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
      { key: 'erwerbsstatus', header: 'Erwerbsstatus', type: 'string', values: 'Erwerbsstatus' },
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
