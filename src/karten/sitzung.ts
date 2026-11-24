// Eine Lernsitzung: zuerst die fälligen Wiederholungen (am längsten überfällige zuerst), dann neue
// Karten (höchstens so viele, wie heute noch erlaubt sind – NEU_PRO_TAG pro Lerntag), in der
// Reihenfolge der Notizen. Karten mit Abstand in Minuten (Nochmal/Schwer in der Lernphase) kommen
// in derselben Sitzung noch einmal.
import type { Karte } from "../api";
import { istFaellig, neuUebrig, type Lernstand } from "./planer";

function eindeutig(karten: Karte[]): Karte[] {
  const gesehen = new Set<string>();
  return karten.filter((k) => !gesehen.has(k.id) && gesehen.add(k.id));
}

export function sitzungErstellen(karten: Karte[], lernstand: Lernstand, jetzt: number): Karte[] {
  const alle = eindeutig(karten);
  const faellig = alle
    .filter((k) => lernstand.karten[k.id] && istFaellig(lernstand.karten[k.id], jetzt))
    .sort((a, b) => lernstand.karten[a.id].faellig - lernstand.karten[b.id].faellig);
  const neu = alle.filter((k) => !lernstand.karten[k.id]).slice(0, neuUebrig(lernstand, jetzt));
  return [...faellig, ...neu];
}

/** Je Ordner: fällige Wiederholungen und neue Karten (ungekürzt) – die Seitenleiste rechnet die
 *  Tagesgrenze für neue Karten erst beim Zusammenzählen ein (siehe faelligAnzeige) */
export type Faellig = { wiederholen: Map<string, number>; neu: Map<string, number>; neuUebrig: number };

export function faelligJeOrdner(karten: Karte[], lernstand: Lernstand, jetzt: number): Faellig {
  const wiederholen = new Map<string, number>();
  const neu = new Map<string, number>();
  for (const k of eindeutig(karten)) {
    const stand = lernstand.karten[k.id];
    const ziel = !stand ? neu : istFaellig(stand, jetzt) ? wiederholen : null;
    ziel?.set(k.ordner, (ziel.get(k.ordner) ?? 0) + 1);
  }
  return { wiederholen, neu, neuUebrig: neuUebrig(lernstand, jetzt) };
}

/** Zahl für einen Ordner (mit Unterordnern; null = alle): so viele Karten bringt eine Sitzung dort */
export function faelligAnzeige(f: Faellig, ordner: string | null): number {
  const passt = (o: string) => ordner === null || o === ordner || o.startsWith(`${ordner}/`);
  const summe = (m: Map<string, number>) => [...m].filter(([o]) => passt(o)).reduce((s, [, n]) => s + n, 0);
  return summe(f.wiederholen) + Math.min(summe(f.neu), f.neuUebrig);
}
