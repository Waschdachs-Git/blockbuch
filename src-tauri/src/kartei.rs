// Karteikarten: kommen aus den `> [!karten]`-Kästen der Notizen (eine Karte pro Zeile: Frage :: Antwort,
// so legt sie auch Claude mit /karten an). Die Notizen selbst bleiben unverändert – der Lernstand
// (wann ist welche Karte wieder dran) steht getrennt in ~/Schule/.blockbuch/lernstand.json und wird
// mit gesichert. Die Planung (Wiederholungsabstände) macht die Oberfläche (src/karten/planer.ts).
use std::fs;
use std::path::Path;

use serde::Serialize;

use crate::notizen::{alle_ordner, schreibe_atomar, CLAUDE_ORDNER};

pub const LERNSTAND: &str = ".blockbuch/lernstand.json";

#[derive(Serialize, Debug, PartialEq, Clone)]
pub struct Karte {
    /// Kennung aus der Frage – bleibt gleich, wenn die Notiz umbenannt oder verschoben wird
    pub id: String,
    pub frage: String,
    pub antwort: String,
    pub ordner: String,
    pub datei: String,
    pub titel: String,
}

/// Kennung einer Karte: FNV-1a über die Frage (Leerzeichen vereinheitlicht)
pub fn karten_id(frage: &str) -> String {
    let norm = frage.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut h: u64 = 0xcbf29ce484222325;
    for b in norm.as_bytes() {
        h ^= u64::from(*b);
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("{h:016x}")
}

/// Markdown-Maskierungen entfernen: Der Editor speichert `snake_case` als `snake\_case`, `arr[0]` als
/// `arr\[0\]`, `5 * 3` als `5 \* 3`. Sonst bekäme die Karte nach dem Bearbeiten der Notiz eine neue
/// Kennung (Lernstand weg) und zeigte Backslashes.
pub fn ohne_maskierung(text: &str) -> String {
    let mut aus = String::with_capacity(text.len());
    let mut zeichen = text.chars().peekable();
    while let Some(c) = zeichen.next() {
        if c == '\\' {
            if let Some(&n) = zeichen.peek() {
                if n.is_ascii_punctuation() {
                    aus.push(n);
                    zeichen.next();
                    continue;
                }
            }
        }
        aus.push(c);
    }
    aus
}

/// Karten aus dem Text einer Notiz: alle Zeilen in `> [!karten]`-Kästen mit "Frage :: Antwort"
/// (auch als Liste "> - Frage :: Antwort" oder in einem Kasten im Kasten)
pub fn karten_aus_text(text: &str) -> Vec<(String, String)> {
    let mut karten = Vec::new();
    let mut im_kasten = false;
    let mut im_code = false;
    for zeile in text.lines() {
        let t = zeile.trim_start();
        if !im_kasten && (t.starts_with("```") || t.starts_with("~~~")) {
            im_code = !im_code;
            continue;
        }
        if im_code {
            continue;
        }
        let Some(inhalt) = t.strip_prefix('>') else {
            im_kasten = false;
            continue;
        };
        // weitere ">" (Kasten im Kasten) und Listenzeichen ("- ", "* ", "1. ") am Anfang weglassen
        let mut inhalt = inhalt.trim();
        while let Some(r) = inhalt.strip_prefix('>') {
            inhalt = r.trim_start();
        }
        if inhalt.to_lowercase().starts_with("[!karten]") {
            im_kasten = true;
            continue;
        }
        if !im_kasten {
            continue;
        }
        let inhalt = inhalt
            .strip_prefix("- ")
            .or_else(|| inhalt.strip_prefix("* "))
            .or_else(|| inhalt.strip_prefix("+ "))
            .or_else(|| {
                let ziffern = inhalt.chars().take_while(char::is_ascii_digit).count();
                (ziffern > 0).then(|| inhalt[ziffern..].strip_prefix(". ")).flatten()
            })
            .unwrap_or(inhalt);
        if let Some((frage, antwort)) = inhalt.split_once("::") {
            let (frage, antwort) = (ohne_maskierung(frage.trim()), ohne_maskierung(antwort.trim()));
            if !frage.is_empty() && !antwort.is_empty() {
                karten.push((frage, antwort));
            }
        }
    }
    karten
}

/// Alle Karten – nur aus `ordner` (und seinen Unterordnern), oder aus allen Ordnern
pub fn karten_sammeln(root: &Path, ordner: Option<&str>) -> Vec<Karte> {
    let mut alle = Vec::new();
    for o in alle_ordner(root).unwrap_or_default() {
        let oben = o.split('/').next().unwrap_or(&o);
        if oben == CLAUDE_ORDNER || oben == "Gerettet" {
            continue;
        }
        if let Some(nur) = ordner {
            if o != nur && !o.starts_with(&format!("{nur}/")) {
                continue;
            }
        }
        let mut dateien: Vec<_> = fs::read_dir(root.join(&o))
            .into_iter()
            .flatten()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n.ends_with(".md") && !n.starts_with('.') && !n.contains("-konflikt-"))
            .collect();
        dateien.sort();
        for datei in dateien {
            let Ok(text) = fs::read_to_string(root.join(&o).join(&datei)) else { continue };
            let karten = karten_aus_text(&text);
            if karten.is_empty() {
                continue;
            }
            let titel = text
                .trim_start_matches('\u{feff}')
                .lines()
                .find_map(|z| z.strip_prefix("# "))
                .map(|t| t.trim().to_string())
                .unwrap_or_else(|| datei.trim_end_matches(".md").to_string());
            for (frage, antwort) in karten {
                alle.push(Karte { id: karten_id(&frage), frage, antwort, ordner: o.clone(), datei: datei.clone(), titel: titel.clone() });
            }
        }
    }
    alle
}

/// Lernstand als JSON-Text (noch keiner: "{}"). Ist die Datei da, aber unlesbar oder kaputt, gibt es
/// einen Fehler – sonst würde die nächste Bewertung allen Lernfortschritt mit „leer“ überschreiben.
pub fn lernstand_lesen(root: &Path) -> Result<String, String> {
    let pfad = root.join(LERNSTAND);
    if !pfad.exists() {
        return Ok("{}".into());
    }
    let text = fs::read_to_string(&pfad).map_err(|e| format!("Der Lernstand der Karteikarten lässt sich nicht lesen: {e}"))?;
    serde_json::from_str::<serde_json::Value>(&text).map_err(|_| {
        "Der Lernstand der Karteikarten (~/Schule/.blockbuch/lernstand.json) ist beschädigt. Blockbuch \
         überschreibt ihn nicht – eine ältere Fassung steckt in der Sicherung (Claude kann sie mit git \
         wiederherstellen)."
            .to_string()
    })?;
    Ok(text)
}

/// Lernstand speichern – nur gültiges JSON, atomar (nie eine halbe Datei)
pub fn lernstand_schreiben(root: &Path, inhalt: &str) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(inhalt).map_err(|e| format!("Ungültiger Lernstand: {e}"))?;
    let pfad = root.join(LERNSTAND);
    if let Some(dir) = pfad.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    schreibe_atomar(&pfad, inhalt, None).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn karten_aus_kaesten() {
        let text = "# Joins\n\n> [!claude] Erklärung\n> Kein :: Karte hier\n\n> [!karten]\n> Was liefert ein INNER JOIN? :: Nur passende Zeilen.\n> Leer ::\n> `a :: b` im Code? :: Erstes :: zählt\n\nText :: keine Karte\n\n```\n> [!karten]\n> Im Code :: nein\n```\n> [!Karten]- Mehr\n> Frage 2 :: Antwort 2\n";
        assert_eq!(
            karten_aus_text(text),
            vec![
                ("Was liefert ein INNER JOIN?".to_string(), "Nur passende Zeilen.".to_string()),
                ("`a".to_string(), "b` im Code? :: Erstes :: zählt".to_string()),
                ("Frage 2".to_string(), "Antwort 2".to_string()),
            ]
        );
    }

    #[test]
    fn maskierungen_listen_und_verschachtelt() {
        // so schreibt der Editor die Karten nach dem Bearbeiten der Notiz
        let text = "> [!karten]\n> snake\\_case? :: a\\_b\n> - arr\\[0\\]? :: erstes Element\n> 1. 5 \\* 3? :: 15\n> > Innen :: ja\n";
        assert_eq!(
            karten_aus_text(text),
            vec![
                ("snake_case?".to_string(), "a_b".to_string()),
                ("arr[0]?".to_string(), "erstes Element".to_string()),
                ("5 * 3?".to_string(), "15".to_string()),
                ("Innen".to_string(), "ja".to_string()),
            ]
        );
        assert_eq!(karten_id("snake_case?"), karten_id(&ohne_maskierung("snake\\_case?")));
        assert_eq!(ohne_maskierung("C:\\\\Pfad \\ä"), "C:\\Pfad \\ä");
    }

    #[test]
    fn kennung_haengt_nur_an_der_frage() {
        assert_eq!(karten_id("Was  ist\tein PK?"), karten_id("Was ist ein PK?"));
        assert_ne!(karten_id("Was ist ein PK?"), karten_id("Was ist ein FK?"));
    }

    #[test]
    fn sammeln_mit_unterordnern_und_lernstand() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        fs::create_dir_all(root.join("LF5/Unicode")).unwrap();
        fs::create_dir_all(root.join("Deutsch")).unwrap();
        fs::create_dir_all(root.join("Claude")).unwrap();
        fs::write(root.join("LF5/2026-10-01-A.md"), "# A\n> [!karten]\n> F1 :: A1\n").unwrap();
        fs::write(root.join("LF5/Unicode/2026-10-02-B.md"), "# B\n> [!karten]\n> F2 :: A2\n").unwrap();
        fs::write(root.join("LF5/2026-10-01-A-konflikt-1200.md"), "# A\n> [!karten]\n> F1 :: A1\n").unwrap();
        fs::write(root.join("Deutsch/2026-10-03-C.md"), "# C\n> [!karten]\n> F3 :: A3\n").unwrap();
        fs::write(root.join("Claude/x.md"), "> [!karten]\n> Nein :: nein\n").unwrap();
        let lf5 = karten_sammeln(root, Some("LF5"));
        assert_eq!(lf5.iter().map(|k| k.frage.as_str()).collect::<Vec<_>>(), vec!["F1", "F2"]);
        assert_eq!(lf5[1].ordner, "LF5/Unicode");
        assert_eq!(lf5[1].titel, "B");
        assert_eq!(karten_sammeln(root, None).len(), 3);

        assert_eq!(lernstand_lesen(root).unwrap(), "{}");
        assert!(lernstand_schreiben(root, "kaputt").is_err());
        lernstand_schreiben(root, r#"{"karten":{}}"#).unwrap();
        assert_eq!(lernstand_lesen(root).unwrap(), r#"{"karten":{}}"#);
        // kaputte Datei: Fehler statt "leer"
        fs::write(root.join(LERNSTAND), "{kaputt").unwrap();
        assert!(lernstand_lesen(root).is_err());
    }
}
