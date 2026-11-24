// LK-Planer: Aus einer eingetragenen Leistungskontrolle (Datum, Ordner, Thema) wird ein Lernplan bis
// zum Vortag. Die Notizen des Stoffs (ältere zuerst) werden auf die Tage verteilt, jeden Tag gibt es
// Karteikarten dazu, der letzte Tag vor der LK ist zum Wiederholen da. Erledigtes fällt heraus und
// der Rest wird jeden Tag neu verteilt – wer einen Tag auslässt, bekommt keinen Rückstau.

export type Lk = {
  id: string;
  /** "JJJJ-MM-TT" */
  datum: string;
  /** Ordner (mit Unterordnern), z. B. "LF5" oder "LF5/Unicode" */
  ordner: string;
  thema: string;
  /** Stoff ab diesem Tag ("JJJJ-MM-TT"); leer = alle Notizen des Ordners */
  ab?: string;
  /** Schlüssel erledigter Einträge (siehe Eintrag.schluessel) */
  erledigt: string[];
};

export type LkDatei = {
  version: 1;
  lks: Lk[];
  /** Einträge, die Blockbuch nicht versteht (z. B. von Hand geändert) – werden unverändert mitgespeichert */
  unbekannt?: unknown[];
};

/** Für die Datei: unbekannte Einträge bleiben erhalten */
export function lksText(d: LkDatei): string {
  return JSON.stringify({ version: 1, lks: [...d.lks, ...(d.unbekannt ?? [])] }, null, 2);
}

export type StoffNotiz = { ordner: string; datei: string; titel: string; datum: string };

export type Eintrag = {
  schluessel: string;
  art: "notiz" | "karten" | "wiederholung" | "fragen" | "karten-erstellen" | "probe";
  text: string;
  notiz?: StoffNotiz;
};

export type Tag = { datum: string; eintraege: Eintrag[] };

export type Plan = {
  tage: Tag[];
  /** schon erledigte Notizen (fallen aus der Verteilung heraus) */
  erledigteNotizen: StoffNotiz[];
  stoff: StoffNotiz[];
  /** Tage bis zur LK (0 = heute, negativ = vorbei) */
  nochTage: number;
};

/** "JJJJ-MM-TT" ± Tage, in Kalendertagen (zeitumstellungsfest) */
export function plusTage(datum: string, tage: number): string {
  const [j, m, t] = datum.split("-").map(Number);
  const d = new Date(j, m - 1, t + tage);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function tageZwischen(von: string, bis: string): number {
  const [a, b] = [von, bis].map((x) => {
    const [j, m, t] = x.split("-").map(Number);
    return Date.UTC(j, m - 1, t);
  });
  return Math.round((b - a) / 86_400_000);
}

export function heuteText(jetzt = new Date()): string {
  return `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, "0")}-${String(jetzt.getDate()).padStart(2, "0")}`;
}

const notizSchluessel = (n: StoffNotiz) => `notiz|${n.ordner}/${n.datei}`;

/** „Stoff ab“ vorschlagen: Tag nach der letzten LK im selben Ordner (vor `datum`) */
export function stoffAbVorschlag(lks: Lk[], ordner: string, datum: string): string | undefined {
  const frueher = lks.filter((l) => l.ordner === ordner && l.datum < datum).map((l) => l.datum).sort();
  return frueher.length ? plusTage(frueher[frueher.length - 1], 1) : undefined;
}

export function planErstellen(
  lk: Lk,
  notizen: StoffNotiz[],
  heute: string,
  info: { mitFragen: Set<string>; mitKarten: Set<string> },
): Plan {
  const stoff = notizen
    // Probe-LKs (von /lk) sind Übung, kein Stoff
    .filter((n) => (!lk.ab || n.datum >= lk.ab) && n.datum <= lk.datum && !/probe-lk/i.test(n.datei))
    .sort((a, b) => a.datum.localeCompare(b.datum) || a.titel.localeCompare(b.titel, "de"));
  const erledigt = new Set(lk.erledigt);
  const offen = stoff.filter((n) => !erledigt.has(notizSchluessel(n)));
  const erledigteNotizen = stoff.filter((n) => erledigt.has(notizSchluessel(n)));
  const nochTage = tageZwischen(heute, lk.datum);
  if (nochTage < 0) return { tage: [], erledigteNotizen, stoff, nochTage };

  const pfad = (n: StoffNotiz) => `${n.ordner}/${n.datei}`;
  const hatKarten = stoff.some((n) => info.mitKarten.has(pfad(n)));
  const karten = (datum: string): Eintrag => ({ schluessel: `karten|${datum}`, art: "karten", text: "Fällige Karteikarten lernen" });

  // LK ist heute: nur noch kurz auffrischen
  if (nochTage === 0) {
    const eintraege: Eintrag[] = [{ schluessel: "auffrischen", art: "wiederholung", text: "Kurz alles überfliegen – du schaffst das!" }];
    if (hatKarten) eintraege.push(karten(heute));
    return { tage: [{ datum: heute, eintraege }], erledigteNotizen, stoff, nochTage };
  }

  const tage: Tag[] = Array.from({ length: nochTage }, (_, i) => ({ datum: plusTage(heute, i), eintraege: [] }));
  // letzter Tag vor der LK: Wiederholung (bei nur einem Tag: alles an diesem Tag)
  const lernTage = tage.length >= 2 ? tage.slice(0, -1) : tage;

  // Vorarbeit am ersten Tag: Unklares klären, fehlende Karten erstellen lassen
  const fragen = offen.filter((n) => info.mitFragen.has(pfad(n))).length;
  if (fragen > 0) {
    tage[0].eintraege.push({
      schluessel: "fragen",
      art: "fragen",
      text: `Unklare Stellen (❓) in ${fragen === 1 ? "1 Notiz" : `${fragen} Notizen`} mit Claude klären: /aufbereiten`,
    });
  }
  const ohneKarten = stoff.filter((n) => !info.mitKarten.has(pfad(n))).length;
  if (ohneKarten > 0) {
    tage[0].eintraege.push({
      schluessel: "karten-erstellen",
      art: "karten-erstellen",
      text: `Für ${ohneKarten === 1 ? "1 Notiz" : `${ohneKarten} Notizen`} Karteikarten erstellen lassen: /karten`,
    });
  }

  // offene Notizen gleichmäßig verteilen, ältere zuerst
  offen.forEach((n, i) => {
    const tag = lernTage[Math.floor((i * lernTage.length) / offen.length)];
    tag.eintraege.push({ schluessel: notizSchluessel(n), art: "notiz", text: n.titel, notiz: n });
  });
  for (const t of lernTage) if (hatKarten) t.eintraege.push(karten(t.datum));

  const letzter = tage[tage.length - 1];
  letzter.eintraege.push(
    { schluessel: "probe", art: "probe", text: `Probe-LK schreiben lassen und lösen: /lk ${lk.thema || lk.ordner}` },
    { schluessel: "wiederholung", art: "wiederholung", text: "Alles noch einmal wiederholen – besonders, was du bei der Probe-LK nicht wusstest" },
  );
  if (lernTage !== tage && hatKarten) letzter.eintraege.push(karten(letzter.datum));
  return { tage, erledigteNotizen, stoff, nochTage };
}

/** Datei lesen: kaputtes JSON → Fehler (wird nicht überschrieben), unbrauchbare Einträge weglassen */
export function lksAusText(text: string): LkDatei {
  const roh = JSON.parse(text) as Partial<LkDatei>;
  const istLk = (l: unknown): l is Lk => {
    const x = l as Lk;
    return !!x && typeof x.id === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.datum) && typeof x.ordner === "string";
  };
  const alle: unknown[] = Array.isArray(roh?.lks) ? roh.lks : [];
  return {
    version: 1,
    lks: alle.filter(istLk).map((l) => ({ ...l, thema: l.thema ?? "", erledigt: Array.isArray(l.erledigt) ? l.erledigt : [] })),
    unbekannt: alle.filter((l) => !istLk(l)),
  };
}

/** "2026-12-01" → „Di., 1. Dez.“ */
export function datumLang(datum: string): string {
  const [j, m, t] = datum.split("-").map(Number);
  return new Date(j, m - 1, t).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" });
}

/** „heute“, „morgen“, „in 5 Tagen“, „vor 2 Tagen“ */
export function abstandText(nochTage: number): string {
  if (nochTage === 0) return "heute";
  if (nochTage === 1) return "morgen";
  if (nochTage === -1) return "gestern";
  return nochTage > 0 ? `in ${nochTage} Tagen` : `vor ${-nochTage} Tagen`;
}
