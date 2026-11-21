# Hilfe: Die Regeln des Integrations-Cockpits einfach erklärt

Diese Seite erklärt, wie das Cockpit rechnet. Sie dient auch als Wissensbasis für «Frag das Cockpit». Massgebend sind die Werte in rules.yaml (Regeln-Panel oben rechts).

## Wer zählt für die Ziele?

Aktuelle Klient:innen sind alle mit Zuständigkeitsende am oder nach dem Stichtag, die noch nicht an die Gemeinde übergeben wurden. Für Ziel 1 und Ziel 2 zählen nur Personen mit Verfahrensstand VA, F-FL, B-FL, B-RSFL oder B-SL, die am Stichtag mindestens 16 Jahre alt sind. Status S und N (Asylsuchende) gehören nicht zu den Zielen. Ein Status mit «+5» oder «+7» (zum Beispiel VA+7) bedeutet: Die Bundesabgeltung ist vorbei, die Person zählt nicht mehr. Wer nicht zählt, ist grau («nicht anwendbar») und hat immer einen Grund dabei.

## Ziel 1: Sprache A1

Ziel 1 ist erreicht, wenn innert 3 Jahren ab Einreise (Asylgeschäftsdaten «Aufenthalt (Einreise)») Deutsch auf Niveau A1 nachgewiesen ist. Als Nachweis zählen im Sprachstand die Arten «Zertifizierung» (telc oder fide), «Muttersprache», «Beendigung obligatorische Schulzeit» und «Beendigung Ausbildung». «Weiteres», zum Beispiel eine Kursbestätigung oder ein Einstufungstest, zählt nicht. Ein A1 mit falscher Nachweisart erscheint in der Datenqualität als «A1 ohne anerkannten Nachweis» und lässt sich mit einer Datenkorrektur beheben. Wird A1 nach der Frist erreicht, ist das Ziel grün mit dem Vermerk «verspätet», wird aber nicht abgerechnet.

## Ziel 2: Arbeit oder Ausbildung

Ziel 2 ist erreicht mit einer Stelle mit Arbeitsvertrag von mindestens 60 Prozent während 6 Monaten ohne Unterbruch, oder mit einer abgeschlossenen Ausbildung auf Sekundarstufe II oder Tertiärstufe, vor dem Ende der Bundesabgeltung. Zwei Stellen mit Arbeitsvertrag werden zusammengezählt (Annahme, ASD-Bestätigung ausstehend). Nicht zählen Praktika ohne Lohn, Freiwilligenarbeit, ehrenamtliche Arbeit, Beschäftigungsprogramme, Einsatzplätze und Arbeitsintegration, weil dort kein Arbeitsvertrag besteht. Eine Lehre oder ein Studium zählt beim Abschluss; solange sie läuft, ist das Ziel «auf Kurs». Bei «gefährdet» nennt das Cockpit das späteste Datum, an dem eine 60-Prozent-Stelle beginnen muss.

## Ziel 3: Ohne Sozialhilfe

Ziel 3 gilt pro Haushalt (Dossier-Nr.): Der ganze Haushalt muss 12 Monate am Stück ohne Sozialhilfe sein, vor dem Ende der Bundesabgeltung. Nothilfe zählt als Unterstützung (Annahme). Die Frist richtet sich nach der Dossierträgerin oder dem Dossierträger. Das Ergebnis steht bei allen Haushaltsmitgliedern, wird aber nur einmal pro Haushalt gezählt. Bei «gefährdet» nennt das Cockpit das Datum, bis zu dem die Sozialhilfe enden muss.

## Bundesabgeltung und Fristen für Ziel 2 und 3

Die Frist für Ziel 2 und Ziel 3 ist das Ende der Bundesabgeltung. Für VA und F-FL sind das 7 Jahre ab Einreise. Für B-FL, B-RSFL und B-SL sind es 5 Jahre ab dem Asylgesuch. Für B-RSFL ist das eine Annahme gemäss Auftrag, denn die Statusliste des ASD enthält «B-RSFL+7». Ist das Zuständigkeitsende im Klient-Export früher, gilt das frühere Datum. Weichen die beiden um mehr als 31 Tage ab, zeigt die Datenqualität das an.

## Die 2027-Regel

Ab dem 1. Januar 2027 begrenzt der Bund die Abgeltung für alle Personen im Asyl- und Flüchtlingsbereich auf 5 Jahre (Entlastungspaket 2027). Gemäss Antwort der Organisatoren gilt die Regel für Personen, die ab dem 1. Januar 2027 einreisen. Sie ist in allen Fristen schon eingerechnet; heutige Klient:innen sind nicht betroffen. Die Schaltfläche «Was wäre wenn: 2027-Regel» zeigt das. In rules.yaml lässt sich Auslegung A einstellen: Dann würde die Regel auch für heutige Klient:innen mit 7 Jahren gelten.

## Die Ampel

Grün heisst erreicht, gelb auf Kurs, rot gefährdet, dunkelrot Frist verpasst, grau nicht anwendbar. «Gefährdet» bedeutet: Die Frist oder das späteste Handlungsdatum liegt innerhalb des Risikofensters (Standard 6 Monate), und das Ziel ist noch nicht erreicht. Ein laufender Deutschkurs, der vor der Frist endet, macht aus «gefährdet» wieder «auf Kurs». Die Ampel setzen immer die Regeln, nie die KI. Es gibt keine Punktzahl und keine Prognose pro Person.

## Anrufe diese Woche

Die Anrufliste zeigt pro Fallführung zuerst die Gefährdeten (frühestes Handlungsdatum zuerst), dann verpasste Fristen, die sich mit einer Datenkorrektur beheben lassen, dann Personen ohne erfasste Aktivität seit mindestens 6 Monaten, dann Personen, deren Kurs oder Stelle in den nächsten 9 Monaten endet und danach nichts geplant ist. Die Liste ist nie nach Geld sortiert. Zu jeder Person gibt es einen Grund, die Quellzeilen, Gesprächspunkte und, falls bestätigt, Hindernisse aus der Situationsanalyse.

## Jetzt abrechenbar

«Jetzt abrechenbar» sind Ziele, die laut den Daten rechtzeitig erreicht sind, aber in der Integrationszielerreichung noch fehlen. Diese sollte man prüfen und nachtragen, damit sie bezahlt werden. Bezahlt wird gemäss Leistungsvertrag mit dem Kanton: eine Grundpauschale pro Person und eine eigene Pauschale pro erreichtem Ziel (A1, Ausbildung oder Erwerbstätigkeit, finanzielle Unabhängigkeit). Die Beträge sind nicht öffentlich; wer sie unter «Prognose» eingibt, sieht die Prognose in Franken.

## Situationsanalyse und KI

Die Situationsanalyse wird vom lokalen KI-Modell auf diesem Computer gelesen. Vorher werden Namen, Nummern, Daten, Telefonnummern und E-Mail-Adressen durch Platzhalter ersetzt. Für jedes Feld zeigt das Cockpit den Beleg-Satz aus dem Bericht. Eine Sozialarbeiterin oder ein Sozialarbeiter bestätigt jedes Feld; nur bestätigte Felder fliessen in die Muster ein. Steht etwas nicht im Bericht, heisst das Feld «nicht erwähnt»; die KI rät nicht.

## Muster

Die Muster zeigen, welche Gruppen Ziel 1 häufiger erreichen, zum Beispiel nach Alphabetisierung in lateinischer Schrift oder nach Deutschkurs im ersten Jahr. Es sind Gruppenquoten mit 95-Prozent-Bereich, nie Werte pro Person. Gruppen unter 10 Personen werden ausgeblendet. Zusammenhänge sind keine Ursachen. Die Daten im Demo sind synthetisch.

## Datenschutz

Das Cockpit ist für das kantonale Datenschutzgesetz Bern (KDSG) gebaut: Es läuft auf einem Computer, ohne Cloud. Die Exporte werden im Browser gelesen und nicht gespeichert; gemerkt wird höchstens der Verweis auf den gewählten Ordner. Die KI läuft lokal (Ollama). Vor dem KI-Schritt werden Namen und Nummern entfernt. Gruppen unter 10 Personen werden ausgeblendet. «Frag das Cockpit» sucht nur in Regeln, Auftrag und Dokumentation und nutzt Kennzahlen ohne Namen. Die Computerstimme liest offline vor. Nur wer ausdrücklich «ElevenLabs» wählt, schickt den Antworttext an diesen Cloud-Dienst, und nur wenn er keine Namen, Klienten- oder Zemis-Nummern enthält.

## Monatslauf

Jeden Monat werden die Exporte aus dem Fallführungssystem abgelegt (einzelne Dateien oder ein Ordner) und mit «Berechnen» ausgewertet. Die Tabellen werden an den Spaltennamen erkannt, nicht am Dateinamen. Ist eine Spalte umbenannt, schlägt das Cockpit die Zuordnung vor; ein Mensch bestätigt sie einmal, danach wird sie gemerkt. Ein gewählter Ordner wird beim nächsten Öffnen wieder geladen. Ergebnisse gibt es als Excel: eine Datei für die Leitung und eine pro Fallführung.
