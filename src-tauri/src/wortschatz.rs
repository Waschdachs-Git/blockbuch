// Wortschatz für die Wortvorschläge beim Tippen: alle längeren Wörter aus den Notizen und dem Text
// der PDFs (assets/*.txt), mit Häufigkeit. Wörter aus PDFs (Arbeitsblätter) zählen mehr – sie sind
// in der Regel richtig geschrieben. Code-Blöcke, Frontmatter, Konfliktkopien und die Claude-Anleitung
// bleiben außen vor.
//
// Die Liste geht an den Editor (wortvorschlag.ts), der daraus die Vorschläge auswählt.
use std::collections::HashMap;
use std::fs;
use std::path::Path;

use serde::Serialize;

use crate::notizen::{ordner_liste, CLAUDE_ORDNER};

/// Ab 3 Buchstaben: Kurze Wörter werden zwar nicht vorgeschlagen, gelten aber als bekannt – so wird
/// ein richtig geschriebenes kurzes Wort nicht "korrigiert"
pub const MIN_ZEICHEN: usize = 3;
const MAX_WOERTER: usize = 30_000;
const PDF_GEWICHT: u32 = 3;

#[derive(Serialize, Debug, PartialEq)]
pub struct Wort {
    pub wort: String,
    pub gewicht: u32,
}

/// Wörter eines Texts: Buchstaben/Ziffern, mit Bindestrich verbunden ("IP-Adresse"), beginnt mit Buchstaben
pub fn woerter(text: &str) -> impl Iterator<Item = &str> {
    text.split(|c: char| !(c.is_alphanumeric() || c == '-'))
        .map(|w| w.trim_matches('-'))
        .filter(|w| {
            w.chars().next().is_some_and(char::is_alphabetic)
                && w.chars().count() >= MIN_ZEICHEN
                && !w.contains("--")
        })
}

/// Link-/Bild-Ziele entfernen: "[Text](assets/x.png)" → "[Text]"
fn ohne_linkziele(zeile: &str) -> String {
    let mut text = String::new();
    let mut rest = zeile;
    while let Some(i) = rest.find("](") {
        text.push_str(&rest[..=i]);
        rest = &rest[i + 2..];
        match rest.find(')') {
            Some(ende) => rest = &rest[ende + 1..],
            None => rest = "",
        }
    }
    text.push_str(rest);
    text
}

/// Notiztext ohne Frontmatter und ohne Code-Blöcke (auch ```grafik / ```pdf mit ihren Pfaden)
fn lesbarer_text(inhalt: &str) -> String {
    let mut rest = inhalt;
    if let Some(r) = inhalt.strip_prefix("---\n").or_else(|| inhalt.strip_prefix("---\r\n")) {
        if let Some(ende) = r.find("\n---") {
            rest = &r[ende + 4..];
        }
    }
    let mut text = String::new();
    let mut im_code = false;
    for zeile in rest.lines() {
        let t = zeile.trim_start();
        if t.starts_with("```") || t.starts_with("~~~") {
            im_code = !im_code;
            continue;
        }
        if !im_code {
            text.push_str(&ohne_linkziele(zeile));
            text.push('\n');
        }
    }
    text
}

fn zaehlen(text: &str, gewicht: u32, zaehler: &mut HashMap<String, u32>) {
    for w in woerter(text) {
        *zaehler.entry(w.to_string()).or_default() += gewicht;
    }
}

pub fn sammeln(root: &Path) -> Vec<Wort> {
    let mut zaehler: HashMap<String, u32> = HashMap::new();
    for ordner in ordner_liste(root).unwrap_or_default() {
        if ordner == "Gerettet" || ordner == CLAUDE_ORDNER {
            continue;
        }
        let pfad = root.join(&ordner);
        for e in fs::read_dir(&pfad).into_iter().flatten().flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            // Konfliktkopien ("…-konflikt-1432.md") enthalten denselben Text noch einmal
            if name.starts_with('.') || !name.ends_with(".md") || name.contains("-konflikt-") {
                continue;
            }
            if let Ok(roh) = fs::read(e.path()) {
                zaehlen(&lesbarer_text(&String::from_utf8_lossy(&roh)), 1, &mut zaehler);
            }
        }
        let assets = pfad.join("assets");
        for e in fs::read_dir(&assets).into_iter().flatten().flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            let Some(stamm) = name.strip_suffix(".txt") else { continue };
            if !assets.join(format!("{stamm}.pdf")).exists() {
                continue;
            }
            if let Ok(roh) = fs::read(e.path()) {
                zaehlen(&String::from_utf8_lossy(&roh), PDF_GEWICHT, &mut zaehler);
            }
        }
    }
    let mut liste: Vec<Wort> = zaehler.into_iter().map(|(wort, gewicht)| Wort { wort, gewicht }).collect();
    liste.sort_by(|a, b| b.gewicht.cmp(&a.gewicht).then_with(|| a.wort.cmp(&b.wort)));
    liste.truncate(MAX_WOERTER);
    liste
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn woerter_mit_bindestrich_und_umlauten() {
        let w: Vec<&str> = woerter("Der Primärschlüssel ist eine IP-Adresse, kein -- Trenner. 2024abc Straße").collect();
        assert_eq!(w, vec!["Der", "Primärschlüssel", "ist", "eine", "IP-Adresse", "kein", "Trenner", "Straße"]);
    }

    #[test]
    fn code_frontmatter_und_pfade_zaehlen_nicht() {
        let text = lesbarer_text(
            "---\nlernfeld: LF05\ntags: [datenbanken]\n---\n# Normalisierung\n```sql\nSELECT spaltenname FROM tabelle;\n```\n![Tafelbild](assets/Tafelbild-0815.png) Fremdschlüssel\n",
        );
        let w: Vec<&str> = woerter(&text).collect();
        // Bildbeschreibung zählt, der Pfad nicht
        assert_eq!(w, vec!["Normalisierung", "Tafelbild", "Fremdschlüssel"]);
    }

    #[test]
    fn klammern_ohne_link_bleiben_erhalten() {
        let text = lesbarer_text("Die Normalisierung (siehe Tabelle) vermeidet Anomalien. [Quelle](https://x.de/a_(b)) Ende\n");
        let w: Vec<&str> = woerter(&text).collect();
        assert_eq!(w, vec!["Die", "Normalisierung", "siehe", "Tabelle", "vermeidet", "Anomalien", "Quelle", "Ende"]);
    }

    #[test]
    fn frontmatter_mit_windows_zeilenenden() {
        let text = lesbarer_text("---\r\nlernfeld: LF05\r\n---\r\nInhalt\r\n");
        assert_eq!(woerter(&text).collect::<Vec<_>>(), vec!["Inhalt"]);
    }

    #[test]
    fn sammeln_gewichtet_pdfs_und_laesst_claude_aus() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        fs::create_dir_all(root.join("LF5/assets")).unwrap();
        fs::create_dir_all(root.join("Claude")).unwrap();
        fs::write(root.join("LF5/2026-10-08-Test.md"), "# Notizen\nPrimärschlüssel Primärschlüssel, Fremdschlüssel").unwrap();
        fs::write(root.join("LF5/assets/Blatt.pdf"), "").unwrap();
        fs::write(root.join("LF5/assets/Blatt.txt"), "Fremdschlüssel").unwrap();
        fs::write(root.join("LF5/assets/notiz.txt"), "Ohnepdfwort").unwrap();
        fs::write(root.join("Claude/CLAUDE.md"), "Anweisungen Anweisungen").unwrap();
        fs::write(root.join("LF5/2026-10-08-Test-konflikt-1432.md"), "Primärschlüssel").unwrap();
        let liste = sammeln(root);
        assert_eq!(
            liste,
            vec![
                Wort { wort: "Fremdschlüssel".into(), gewicht: 1 + PDF_GEWICHT },
                Wort { wort: "Primärschlüssel".into(), gewicht: 2 },
                Wort { wort: "Notizen".into(), gewicht: 1 },
            ]
        );
    }
}
