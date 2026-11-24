// Wann kommt eine Karteikarte wieder dran? Verteiltes Wiederholen nach dem bewährten Anki-Prinzip
// (SM-2): Wer eine Karte gut kann, sieht sie immer seltener (1 Tag, 3 Tage, ~8, ~20 …), wer sie
// vergisst, lernt sie neu. Bewertung nach dem Aufdecken: 1 Nochmal · 2 Schwer · 3 Gut · 4 Leicht.
// Neue oder vergessene Karten: Nochmal = in 1 Min., Schwer = in 5 Min. (kommen in derselben Sitzung
// wieder). Der Lerntag beginnt um 4 Uhr – wer um 23:55 „Gut“ drückt, sieht die Karte nicht schon
// 5 Minuten später wieder.

export type Bewertung = 1 | 2 | 3 | 4;

export type Stand = {
  /** wann wieder dran (ms seit 1970) */
  faellig: number;
  /** Abstand in Tagen (0 = gerade in der Lernphase) */
  intervall: number;
  /** Faktor, um den der Abstand bei „Gut“ wächst (startet bei 2,5) */
  leichtigkeit: number;
  /** wie oft hintereinander gewusst */
  wiederholungen: number;
  /** wie oft vergessen */
  fehler: number;
  zuletzt: number;
  /** die Frage im Klartext – damit Claude im Lernstand sieht, welche Karten oft vergessen werden */
  frage?: string;
};

export type Lernstand = {
  version: 1;
  karten: Record<string, Stand>;
  /** neue Karten pro Lerntag begrenzen (sonst gibt jede neue Sitzung wieder 20 neue frei) */
  neuHeute?: { tag: string; anzahl: number };
};

/** höchstens so viele neue Karten pro Lerntag */
export const NEU_PRO_TAG = 20;
const TAGESBEGINN_STUNDE = 4;

const MINUTE = 60_000;
const START_LEICHTIGKEIT = 2.5;
const MIN_LEICHTIGKEIT = 1.3;

/** Lerntag von `zeit` als "JJJJ-MM-TT" (beginnt um 4 Uhr) */
export function lerntag(zeit: number): string {
  const d = new Date(zeit);
  if (d.getHours() < TAGESBEGINN_STUNDE) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Beginn des Lerntags (4 Uhr), `tage` Lerntage nach dem von `jetzt` – über Kalendertage gerechnet,
 *  damit die Zeitumstellung nichts verschiebt */
function tagesbeginn(jetzt: number, tage: number): number {
  const d = new Date(jetzt);
  if (d.getHours() < TAGESBEGINN_STUNDE) d.setDate(d.getDate() - 1);
  d.setDate(d.getDate() + tage);
  d.setHours(TAGESBEGINN_STUNDE, 0, 0, 0);
  return d.getTime();
}

export function bewerten(alt: Stand | undefined, note: Bewertung, jetzt: number): Stand {
  const s: Stand = alt
    ? { ...alt }
    : { faellig: jetzt, intervall: 0, leichtigkeit: START_LEICHTIGKEIT, wiederholungen: 0, fehler: 0, zuletzt: jetzt };
  s.zuletzt = jetzt;

  // Lernphase: neue oder vergessene Karte
  if (s.wiederholungen === 0) {
    if (note === 1) return { ...s, intervall: 0, faellig: jetzt + MINUTE };
    if (note === 2) return { ...s, intervall: 0, faellig: jetzt + 5 * MINUTE };
    const tage = note === 3 ? 1 : 3;
    return { ...s, wiederholungen: 1, intervall: tage, faellig: tagesbeginn(jetzt, tage) };
  }

  // Wiederholung
  if (note === 1) {
    return {
      ...s,
      wiederholungen: 0,
      fehler: s.fehler + 1,
      intervall: 0,
      leichtigkeit: Math.max(MIN_LEICHTIGKEIT, s.leichtigkeit - 0.2),
      faellig: jetzt + 5 * MINUTE,
    };
  }
  let tage: number;
  let leichtigkeit = s.leichtigkeit;
  if (note === 2) {
    tage = s.intervall * 1.2;
    leichtigkeit = Math.max(MIN_LEICHTIGKEIT, leichtigkeit - 0.15);
  } else if (note === 3) {
    tage = s.wiederholungen === 1 ? 3 : s.intervall * leichtigkeit;
  } else {
    tage = (s.wiederholungen === 1 ? 4 : s.intervall * leichtigkeit) * 1.3;
    leichtigkeit += 0.15;
  }
  // mindestens einen Tag mehr als bisher (auch bei „Schwer“ – sonst bliebe es ewig bei 1 Tag)
  tage = Math.min(365, Math.max(s.intervall + 1, Math.round(tage)));
  return { ...s, wiederholungen: s.wiederholungen + 1, intervall: tage, leichtigkeit, faellig: tagesbeginn(jetzt, tage) };
}

export function istFaellig(stand: Stand | undefined, jetzt: number): boolean {
  return !stand || stand.faellig <= jetzt;
}

/** Kurze Vorschau für die Bewertungsknöpfe: „1 Min.“, „10 Min.“, „1 Tag“, „3 Tage“ */
export function abstandText(alt: Stand | undefined, note: Bewertung, jetzt: number): string {
  const neu = bewerten(alt, note, jetzt);
  if (neu.intervall === 0) return `${Math.max(1, Math.round((neu.faellig - jetzt) / MINUTE))} Min.`;
  if (neu.intervall < 31) return neu.intervall === 1 ? "1 Tag" : `${neu.intervall} Tage`;
  const monate = Math.round(neu.intervall / 30);
  return monate === 1 ? "1 Monat" : `${monate} Monate`;
}

const istStand = (s: unknown): s is Stand => {
  const x = s as Stand;
  return !!x && [x.faellig, x.intervall, x.leichtigkeit, x.wiederholungen, x.fehler].every((n) => typeof n === "number" && Number.isFinite(n));
};

/** Lernstand aus der Datei. Kaputtes JSON → Fehler (die Datei wird dann nicht überschrieben);
 *  einzelne unbrauchbare Einträge werden übergangen. */
export function lernstandAusText(text: string): Lernstand {
  const roh = JSON.parse(text) as Partial<Lernstand>;
  const karten: Record<string, Stand> = {};
  for (const [id, stand] of Object.entries(roh?.karten ?? {})) if (istStand(stand)) karten[id] = stand;
  const neu = roh?.neuHeute;
  return {
    version: 1,
    karten,
    neuHeute: neu && typeof neu.tag === "string" && typeof neu.anzahl === "number" ? neu : undefined,
  };
}

/** Wie viele neue Karten heute noch drin sind */
export function neuUebrig(lernstand: Lernstand, jetzt: number): number {
  const n = lernstand.neuHeute;
  return Math.max(0, NEU_PRO_TAG - (n && n.tag === lerntag(jetzt) ? n.anzahl : 0));
}
