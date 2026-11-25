// Übersicht der Karteikarten: Ordner → Notizen → Gruppen (Titel des Karten-Kastens,
// z. B. `> [!karten] Protokolle`). Für jede Zeile: wie viele Karten, wie viele heute dran, wie viele
// schwierig. Dazu das freie Üben: so oft wie man will, ohne den Lernplan zu verändern.
import type { Karte } from "../api";
import { istFaellig, neuUebrig, type Lernstand } from "./planer";

/** Was ausgewählt ist: alles, ein Ordner (mit Unterordnern), eine Notiz oder eine Gruppe in einer Notiz */
export type Auswahl =
  | { art: "alle" }
  | { art: "ordner"; ordner: string }
  | { art: "notiz"; ordner: string; datei: string }
  | { art: "gruppe"; ordner: string; datei: string; gruppe: string };

export type Zahlen = { gesamt: number; faellig: number; schwierig: number };

export type Zeile = {
  schluessel: string;
  auswahl: Auswahl;
  name: string;
  /** Einrückung: 0 Ordner, 1 Unterordner/Notiz, 2 … */
  tiefe: number;
  zahlen: Zahlen;
  /** Ordner: Notizen darunter sind ausgeklappt */
  offen?: boolean;
  /** Ordner/Notiz mit Inhalt zum Ausklappen */
  klappbar?: boolean;
};

export function auswahlSchluessel(a: Auswahl): string {
  switch (a.art) {
    case "alle":
      return "alle";
    case "ordner":
      return `o|${a.ordner}`;
    case "notiz":
      return `n|${a.ordner}/${a.datei}`;
    case "gruppe":
      return `g|${a.ordner}/${a.datei}|${a.gruppe}`;
  }
}

export function passt(k: Karte, a: Auswahl): boolean {
  switch (a.art) {
    case "alle":
      return true;
    case "ordner":
      return k.ordner === a.ordner || k.ordner.startsWith(`${a.ordner}/`);
    case "notiz":
      return k.ordner === a.ordner && k.datei === a.datei;
    case "gruppe":
      return k.ordner === a.ordner && k.datei === a.datei && k.gruppe === a.gruppe;
  }
}

/** Jede Frage nur einmal (dieselbe Frage in zwei Notizen = eine Karte, eine Kennung) */
export function eindeutig(karten: Karte[]): Karte[] {
  const gesehen = new Set<string>();
  return karten.filter((k) => !gesehen.has(k.id) && gesehen.add(k.id));
}

/** schwierig = schon einmal vergessen, noch in der Lernphase (Nochmal/Schwer) oder oft „Schwer“ */
export function istSchwierig(k: Karte, l: Lernstand): boolean {
  const s = l.karten[k.id];
  return !!s && (s.fehler > 0 || s.wiederholungen === 0 || s.leichtigkeit < 2.3);
}

export function zahlen(karten: Karte[], l: Lernstand, jetzt: number): Zahlen {
  const alle = eindeutig(karten);
  const wiederholen = alle.filter((k) => l.karten[k.id] && istFaellig(l.karten[k.id], jetzt)).length;
  const neu = alle.filter((k) => !l.karten[k.id]).length;
  return {
    gesamt: alle.length,
    // neue Karten nur, soweit heute noch erlaubt – so viele bringt „Lernen“ wirklich
    faellig: wiederholen + Math.min(neu, neuUebrig(l, jetzt)),
    schwierig: alle.filter((k) => istSchwierig(k, l)).length,
  };
}

/** Zeilen der Übersicht. `offen` = aufgeklappte Ordner/Notizen (Schlüssel). */
export function zeilenBauen(karten: Karte[], l: Lernstand, jetzt: number, offen: Set<string>, mitAlle: boolean): Zeile[] {
  const zeilen: Zeile[] = [];
  if (mitAlle) zeilen.push({ schluessel: "alle", auswahl: { art: "alle" }, name: "Alle Karten", tiefe: 0, zahlen: zahlen(karten, l, jetzt) });
  const ordner = [...new Set(karten.map((k) => k.ordner))];
  // Oberordner auch dann zeigen, wenn nur ein Unterordner Karten hat
  const oben = [...new Set(ordner.map((o) => o.split("/")[0]))].sort((a, b) => a.localeCompare(b, "de", { numeric: true }));

  const notizenZeilen = (o: string, tiefe: number) => {
    const inOrdner = karten.filter((k) => k.ordner === o);
    const dateien = [...new Set(inOrdner.map((k) => k.datei))].sort();
    for (const datei of dateien) {
      const inNotiz = inOrdner.filter((k) => k.datei === datei);
      const gruppen = [...new Set(inNotiz.map((k) => k.gruppe))];
      // Gruppen nur zeigen, wenn es mehr als eine gibt oder die einzige einen Namen hat
      const mitGruppen = gruppen.length > 1;
      const n: Auswahl = { art: "notiz", ordner: o, datei };
      const s = auswahlSchluessel(n);
      zeilen.push({ schluessel: s, auswahl: n, name: inNotiz[0].titel, tiefe, zahlen: zahlen(inNotiz, l, jetzt), klappbar: mitGruppen, offen: mitGruppen && offen.has(s) });
      if (!mitGruppen || !offen.has(s)) continue;
      for (const gruppe of gruppen) {
        const g: Auswahl = { art: "gruppe", ordner: o, datei, gruppe };
        zeilen.push({
          schluessel: auswahlSchluessel(g),
          auswahl: g,
          name: gruppe || "ohne Titel",
          tiefe: tiefe + 1,
          zahlen: zahlen(inNotiz.filter((k) => k.gruppe === gruppe), l, jetzt),
        });
      }
    }
  };

  for (const o of oben) {
    const a: Auswahl = { art: "ordner", ordner: o };
    const s = auswahlSchluessel(a);
    zeilen.push({ schluessel: s, auswahl: a, name: o, tiefe: 0, zahlen: zahlen(karten.filter((k) => passt(k, a)), l, jetzt), klappbar: true, offen: offen.has(s) });
    if (!offen.has(s)) continue;
    notizenZeilen(o, 1);
    for (const u of ordner.filter((x) => x.startsWith(`${o}/`)).sort((a, b) => a.localeCompare(b, "de", { numeric: true }))) {
      const ua: Auswahl = { art: "ordner", ordner: u };
      const us = auswahlSchluessel(ua);
      zeilen.push({ schluessel: us, auswahl: ua, name: u.slice(o.length + 1), tiefe: 1, zahlen: zahlen(karten.filter((k) => passt(k, ua)), l, jetzt), klappbar: true, offen: offen.has(us) });
      if (offen.has(us)) notizenZeilen(u, 2);
    }
  }
  return zeilen;
}

/** Karten mischen (Fisher-Yates); `zufall` austauschbar für Tests */
export function mischen<T>(liste: T[], zufall: () => number = Math.random): T[] {
  const a = [...liste];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(zufall() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
