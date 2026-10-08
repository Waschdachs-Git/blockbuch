// Lernfelder laut KMK-Rahmenlehrplan Fachinformatiker/in Anwendungsentwicklung (2020).
// Nur noch Nachschlagewerk für Titel: Die App legt KEINE Lernfeld-Ordner an – sie erkennt die Ordner des
// Nutzers (LF1, LF2 … oder LF5-Datenbanken) und zeigt dazu den Titel aus dem Rahmenlehrplan.
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

/** Lernfeld-Nummer aus dem Ordnernamen: "LF5", "LF05", "LF 5", "LF5-Datenbanken" → 5 */
export function lernfeldNummer(name: string): number | null {
  const m = /^LF\s*0*(\d{1,2})(?=$|[\s_-])/i.exec(name.normalize("NFC"));
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 20 ? n : null;
}

/** Ordner von der Platte einteilen: Ordner, die mit "LF" + Nummer beginnen, sind Lernfelder
 *  (sortiert nach Nummer), alle anderen Fächer. Die App legt selbst keine Lernfeld-Ordner an –
 *  der Nutzer bestimmt, welche es gibt (z. B. nur LF1–LF5). */
export function ordnerAusNamen(namen: string[]): { lernfelder: Ordner[]; faecher: Ordner[] } {
  const lernfelder: (Ordner & { nr: number })[] = [];
  const faecher: Ordner[] = [];
  for (const name of namen) {
    const anzeigeName = name.normalize("NFC");
    const nr = lernfeldNummer(name);
    if (nr === null) {
      faecher.push({ name, anzeige: anzeigeName, titel: anzeigeName });
      continue;
    }
    const kmk = LERNFELDER[nr - 1];
    // Eigener Name nach der Nummer ("LF5-Datenbanken") hat Vorrang vor dem Rahmenlehrplan-Titel
    const rest = anzeigeName.replace(/^LF\s*0*\d{1,2}[\s_-]*/i, "").replace(/[-_]+/g, " ").trim();
    const nummer = String(nr).padStart(2, "0");
    lernfelder.push({
      nr,
      name,
      nummer,
      anzeige: rest || kmk?.kurz || `Lernfeld ${nr}`,
      titel: rest || kmk?.titel || `Lernfeld ${nr}`,
      lernfeld: {
        id: `LF${nummer}`,
        rlp: kmk?.rlp ?? String(nr),
        kurz: rest || kmk?.kurz || `Lernfeld ${nr}`,
        titel: rest || kmk?.titel || `Lernfeld ${nr}`,
        ordner: name,
      },
    });
  }
  lernfelder.sort((a, b) => a.nr - b.nr || a.name.localeCompare(b.name, "de"));
  faecher.sort((a, b) => a.anzeige.localeCompare(b.anzeige, "de"));
  return { lernfelder: lernfelder.map(({ nr: _nr, ...o }) => o), faecher };
}
