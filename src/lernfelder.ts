// Lernfelder laut KMK-Rahmenlehrplan Fachinformatiker/in Anwendungsentwicklung (2020).
// `ordner` ist der Ordnername in ~/Schule – wird beim Start automatisch angelegt.
// `id` und `ordner` NICHT mehr ändern, sobald Notizen existieren – Frontmatter und Pfade hängen daran.
// `rlp` ist die offizielle Nummer im Rahmenlehrplan (Fachrichtungs-Lernfelder heißen dort 10a–12a).

export type Lernfeld = {
  id: string;
  rlp: string;
  kurz: string;
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

/** Ein Eintrag in der Seitenleiste: ein echter Ordner in ~/Schule */
export type Ordner = {
  name: string; // Ordnername auf der Platte
  anzeige: string;
  nummer?: string; // "05" bei Lernfeldern
  titel: string; // lange Bezeichnung für Kopf und Tooltip
  lernfeld?: Lernfeld;
};

/** Ordner von der Platte mit Lernfeld-Infos anreichern; Lernfelder zuerst, dann eigene Fächer */
export function ordnerAusNamen(namen: string[]): { lernfelder: Ordner[]; faecher: Ordner[] } {
  const lernfelder: Ordner[] = [];
  const faecher: Ordner[] = [];
  const vergleich = (s: string) => s.normalize("NFC").toLowerCase();
  const vergeben = new Set<string>();
  for (const lf of LERNFELDER) {
    const name = namen.find((n) => vergleich(n) === vergleich(lf.ordner));
    if (name) {
      vergeben.add(name);
      lernfelder.push({ name, anzeige: lf.kurz, nummer: lf.id.slice(2), titel: lf.titel, lernfeld: lf });
    }
  }
  for (const name of namen) {
    const anzeige = name.normalize("NFC");
    if (!vergeben.has(name)) faecher.push({ name, anzeige, titel: anzeige });
  }
  faecher.sort((a, b) => a.anzeige.localeCompare(b.anzeige, "de"));
  return { lernfelder, faecher };
}
