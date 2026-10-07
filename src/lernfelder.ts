// Lernfelder laut KMK-Rahmenlehrplan Fachinformatiker/in Anwendungsentwicklung (2020).
// `ordner` ist der Ordnername in ~/Schule (ab Schritt 2).
// `id` und `ordner` NICHT mehr ändern, sobald Notizen existieren – Frontmatter und Pfade hängen daran.
// `rlp` ist die offizielle Nummer im Rahmenlehrplan (Fachrichtungs-Lernfelder heißen dort 10a–12a).

export type Lernfeld = {
  id: string;
  kurz: string;
  rlp: string;
  titel: string;
  ordner: string;
};

export const LERNFELDER: Lernfeld[] = [
  { id: "LF01", rlp: "1", kurz: "Unternehmen & Rolle", titel: "Das Unternehmen und die eigene Rolle im Betrieb beschreiben", ordner: "LF01-Unternehmen-und-Rolle" },
  { id: "LF02", rlp: "2", kurz: "Arbeitsplätze ausstatten", titel: "Arbeitsplätze nach Kundenwunsch ausstatten", ordner: "LF02-Arbeitsplaetze-ausstatten" },
  { id: "LF03", rlp: "3", kurz: "Clients in Netzwerke", titel: "Clients in Netzwerke einbinden", ordner: "LF03-Clients-in-Netzwerke" },
  { id: "LF04", rlp: "4", kurz: "Schutzbedarfsanalyse", titel: "Schutzbedarfsanalyse im eigenen Arbeitsbereich durchführen", ordner: "LF04-Schutzbedarfsanalyse" },
  { id: "LF05", rlp: "5", kurz: "Daten verwalten", titel: "Software zur Verwaltung von Daten anpassen", ordner: "LF05-Daten-verwalten" },
  { id: "LF06", rlp: "6", kurz: "Serviceanfragen", titel: "Serviceanfragen bearbeiten", ordner: "LF06-Serviceanfragen" },
  { id: "LF07", rlp: "7", kurz: "Cyber-physische Systeme", titel: "Cyber-physische Systeme ergänzen", ordner: "LF07-Cyber-physische-Systeme" },
  { id: "LF08", rlp: "8", kurz: "Daten bereitstellen", titel: "Daten systemübergreifend bereitstellen", ordner: "LF08-Daten-bereitstellen" },
  { id: "LF09", rlp: "9", kurz: "Netzwerke & Dienste", titel: "Netzwerke und Dienste bereitstellen", ordner: "LF09-Netzwerke-und-Dienste" },
  { id: "LF10", rlp: "10a", kurz: "Benutzerschnittstellen", titel: "Benutzerschnittstellen gestalten und entwickeln", ordner: "LF10-Benutzerschnittstellen" },
  { id: "LF11", rlp: "11a", kurz: "Funktionalität realisieren", titel: "Funktionalität in Anwendungen realisieren", ordner: "LF11-Funktionalitaet-realisieren" },
  { id: "LF12", rlp: "12a", kurz: "Kundenspezifische Entwicklung", titel: "Kundenspezifische Anwendungsentwicklung durchführen", ordner: "LF12-Kundenspezifische-Entwicklung" },
];
