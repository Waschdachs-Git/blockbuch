// Gleiche Vergleichsform wie die Rust-Suche (suche.rs): klein, Umlaute ausgeschrieben.
// "Größe" und "groesse" → "groesse". Liefert zu jedem gefalteten Zeichen die Position im Original.

const ERSATZ: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };

export function faltenMitIndex(text: string): { gefaltet: string; herkunft: number[] } {
  let gefaltet = "";
  const herkunft: number[] = [];
  let i = 0;
  for (const zeichen of text) {
    for (const k of zeichen.toLowerCase()) {
      const e = ERSATZ[k] ?? k;
      for (const c of e) {
        gefaltet += c;
        // eine Position pro UTF-16-Einheit, damit indexOf() und herkunft zusammenpassen
        for (let n = 0; n < c.length; n++) herkunft.push(i);
      }
    }
    i += zeichen.length; // UTF-16-Index im Original (Emojis zählen doppelt)
  }
  return { gefaltet, herkunft };
}

export function falten(text: string): string {
  return faltenMitIndex(text).gefaltet;
}

/** Alle Fundstellen der Wörter im Original-Text als [start, ende) (UTF-16-Indizes), sortiert, ohne Überlappung */
export function fundstellen(text: string, woerter: string[]): [number, number][] {
  const { gefaltet, herkunft } = faltenMitIndex(text);
  const bereiche: [number, number][] = [];
  for (const w of woerter.map(falten).filter((w) => w.length > 1 || /[^\p{L}\p{N}]/u.test(w))) {
    let ab = 0;
    for (let i = gefaltet.indexOf(w, ab); i >= 0; i = gefaltet.indexOf(w, ab)) {
      const start = herkunft[i];
      const letztes = herkunft[i + w.length - 1];
      // Ende = hinter dem letzten Original-Zeichen (auch wenn es 2 UTF-16-Einheiten hat)
      const ende = letztes + (text.codePointAt(letztes)! > 0xffff ? 2 : 1);
      bereiche.push([start, ende]);
      ab = i + w.length;
    }
  }
  bereiche.sort((a, b) => a[0] - b[0]);
  return bereiche.filter((b, i) => i === 0 || b[0] >= bereiche[i - 1][1]);
}
