// Typisierte Aufrufe der Rust-Befehle aus src-tauri/src/lib.rs
import { invoke } from "@tauri-apps/api/core";

export type SchuleInfo = { pfad: string; ordner: string[] };
export type NotizInfo = { datei: string; titel: string; datum: string; geaendert: number };
export type NotizInhalt = { inhalt: string; geaendert: number };

export const api = {
  schuleOeffnen: (standardOrdner: string[]) => invoke<SchuleInfo>("schule_oeffnen", { standardOrdner }),
  ordnerErstellen: (name: string) => invoke<string[]>("ordner_erstellen", { name }),
  notizenAuflisten: (ordner: string) => invoke<NotizInfo[]>("notizen_auflisten", { ordner }),
  notizLesen: (ordner: string, datei: string) => invoke<NotizInhalt>("notiz_lesen", { ordner, datei }),
  /** erwartet = Änderungszeit vom letzten Lesen/Speichern; null überschreibt bewusst */
  notizSpeichern: (ordner: string, datei: string, inhalt: string, erwartet: number | null) =>
    invoke<number>("notiz_speichern", { ordner, datei, inhalt, erwartet }),
  notizKonfliktkopie: (ordner: string, datei: string, inhalt: string, uhrzeit: string) =>
    invoke<string>("notiz_konfliktkopie", { ordner, datei, inhalt, uhrzeit }),
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
