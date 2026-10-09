// Typisierte Aufrufe der Rust-Befehle aus src-tauri/src/lib.rs
import { invoke } from "@tauri-apps/api/core";

export type SchuleInfo = { pfad: string; ordner: string[] };
export type NotizInfo = { datei: string; titel: string; datum: string; geaendert: number };
export type NotizInhalt = { inhalt: string; geaendert: number };
export type Treffer = {
  ordner: string;
  datei: string | null;
  titel: string;
  datum: string;
  ausschnitt: string;
  art: "notiz" | "pdf";
  pdf: string | null;
};
export type Version = { hash: string; zeit: string; nachricht: string; pfad: string };
/** Ereignis "sicherung": Zeitpunkt der letzten Sicherung oder Fehler */
export type SicherungsStand = { zeit: string | null; fehler: string | null; hinweis: string | null };
/** Vom Dateibeobachter gemeldet (Ereignis "schule-geaendert") */
export type Aenderung = { ordner: string | null; datei: string | null };

export const api = {
  schuleOeffnen: (standardOrdner: string[]) => invoke<SchuleInfo>("schule_oeffnen", { standardOrdner }),
  ordnerErstellen: (name: string) => invoke<string[]>("ordner_erstellen", { name }),
  ordnerAuflisten: () => invoke<string[]>("ordner_auflisten"),
  versionen: (ordner: string, datei: string) => invoke<Version[]>("versionen", { ordner, datei }),
  versionLesen: (hash: string, pfad: string) => invoke<string>("version_lesen", { hash, pfad }),
  versionWiederherstellen: (ordner: string, datei: string, hash: string, pfad: string) =>
    invoke<void>("version_wiederherstellen", { ordner, datei, hash, pfad }),
  jetztSichern: () => invoke<string | null>("jetzt_sichern"),
  /** Volltextsuche; leere Anfrage = zuletzt bearbeitete Notizen */
  suchen: (anfrage: string) => invoke<Treffer[]>("suchen", { anfrage }),
  /** Wörter aus Notizen und PDFs mit Gewicht – für die Wortvorschläge beim Tippen */
  wortschatz: () => invoke<{ wort: string; gewicht: number }[]>("wortschatz"),
  notizenAuflisten: (ordner: string) => invoke<NotizInfo[]>("notizen_auflisten", { ordner }),
  notizLesen: (ordner: string, datei: string) => invoke<NotizInhalt>("notiz_lesen", { ordner, datei }),
  /** erwartet = Änderungszeit vom letzten Lesen/Speichern; null überschreibt bewusst */
  notizSpeichern: (ordner: string, datei: string, inhalt: string, erwartet: number | null) =>
    invoke<number>("notiz_speichern", { ordner, datei, inhalt, erwartet }),
  notizKonfliktkopie: (ordner: string, datei: string, inhalt: string, uhrzeit: string) =>
    invoke<string>("notiz_konfliktkopie", { ordner, datei, inhalt, uhrzeit }),
  /** Datei (Bild/PDF) in <Ordner>/assets/ speichern – gibt "assets/<name>" zurück */
  assetSpeichern: (ordner: string, name: string, daten: Uint8Array) =>
    invoke<string>("asset_speichern", daten, {
      headers: { ordner: encodeURIComponent(ordner), name: encodeURIComponent(name) },
    }),
  assetLesen: async (ordner: string, pfad: string) =>
    new Uint8Array(await invoke<ArrayBuffer>("asset_lesen", { ordner, pfad })),
  inVorschauOeffnen: (ordner: string, pfad: string) => invoke<void>("in_vorschau_oeffnen", { ordner, pfad }),
  /** Beendet die App – erst aufrufen, wenn alles gesichert ist */
  beenden: () => invoke<void>("beenden"),
  notizErstellen: (ordner: string, lernfeld: string | null, titel: string, datum: string) =>
    invoke<NotizInfo>("notiz_erstellen", { ordner, lernfeld, titel, datum }),
  notizUmbenennen: (ordner: string, datei: string, titel: string) =>
    invoke<NotizInfo>("notiz_umbenennen", { ordner, datei, titel }),
  notizLoeschen: (ordner: string, datei: string) => invoke<void>("notiz_loeschen", { ordner, datei }),
};

/** Heutiges Datum in lokaler Zeit als YYYY-MM-DD */
export function heute(): string {
  const d = new Date();
  const zwei = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;
}

/** 2026-10-07 -> 07.10.2026 */
export function datumAnzeigen(datum: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datum);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : datum;
}

/** Konflikt-Fehler aus Rust: Datei wurde von außen geändert oder gelöscht */
export function istKonflikt(e: unknown): boolean {
  return typeof e === "string" && e.startsWith("KONFLIKT:");
}

export function fehlerText(e: unknown): string {
  if (typeof e === "string" && e.startsWith("KONFLIKT:")) return e.slice(9).trim();
  return typeof e === "string" ? e : e instanceof Error ? e.message : String(e);
}
