// Ordner in der Seitenleiste – immer genau so benannt, wie der Nutzer sie angelegt hat.
// Ordner, die mit "LF" + Nummer beginnen (LF1, LF2 …), stehen oben unter "Lernfelder" (nach Nummer
// sortiert), alle anderen unter "Fächer". Die App legt selbst keine Ordner an und erfindet keine Namen.
// Unterordner ("LF5/Unicode") stehen eingerückt direkt unter ihrem Ordner und gehören zu dessen Lernfeld.

export type Lernfeld = {
  /** Für das Frontmatter der Notizen, immer zweistellig: "LF05" */
  id: string;
  nr: number;
};

/** Ein Eintrag in der Seitenleiste: ein echter Ordner in ~/Schule */
export type Ordner = {
  name: string; // Pfad auf der Platte: "LF5" oder "LF5/Unicode"
  anzeige: string; // letzter Teil des Namens (Unicode vereinheitlicht): "LF5" bzw. "Unicode"
  titel: string; // ganzer Pfad zum Anzeigen: "LF5" bzw. "LF5 › Unicode"
  lernfeld?: Lernfeld;
  /** bei Unterordnern: der Ordner darüber ("LF5") */
  eltern?: string;
};

/** Lernfeld-Nummer aus dem Ordnernamen: "LF5", "LF05", "LF 5", "LF5-Datenbanken" → 5 */
export function lernfeldNummer(name: string): number | null {
  const m = /^LF\s*0*(\d{1,2})(?=$|[\s_-])/i.exec(name.normalize("NFC"));
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 20 ? n : null;
}

export function ordnerAusNamen(namen: string[]): { lernfelder: Ordner[]; faecher: Ordner[] } {
  const lernfelder: Ordner[] = [];
  const faecher: Ordner[] = [];
  const unter = new Map<string, string[]>();
  for (const name of namen) {
    const [oben, ...rest] = name.split("/");
    if (rest.length) {
      unter.set(oben, [...(unter.get(oben) ?? []), name]);
      continue;
    }
    const anzeige = name.normalize("NFC");
    const nr = lernfeldNummer(name);
    if (nr === null) faecher.push({ name, anzeige, titel: anzeige });
    else lernfelder.push({ name, anzeige, titel: anzeige, lernfeld: { id: `LF${String(nr).padStart(2, "0")}`, nr } });
  }
  lernfelder.sort((a, b) => a.lernfeld!.nr - b.lernfeld!.nr || a.anzeige.localeCompare(b.anzeige, "de"));
  faecher.sort((a, b) => a.anzeige.localeCompare(b.anzeige, "de"));
  // Unterordner direkt hinter ihren Ordner
  const mitUnter = (liste: Ordner[]) =>
    liste.flatMap((o) => [
      o,
      ...(unter.get(o.name) ?? [])
        .map((name): Ordner => {
          const anzeige = name.slice(o.name.length + 1).normalize("NFC");
          return { name, anzeige, titel: `${o.anzeige} › ${anzeige}`, lernfeld: o.lernfeld, eltern: o.name };
        })
        .sort((a, b) => a.anzeige.localeCompare(b.anzeige, "de")),
    ]);
  return { lernfelder: mitUnter(lernfelder), faecher: mitUnter(faecher) };
}
