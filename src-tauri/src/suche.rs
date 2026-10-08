// Volltextsuche über alle Notizen in ~/Schule und den Text der PDFs (assets/*.txt).
// Durchsucht bei jeder Anfrage direkt die Dateien – so ist auch frisch von Claude Geschriebenes dabei.
// Bei einigen hundert Notizen dauert das nur Millisekunden; ein Index wäre erst bei sehr vielen Dateien nötig.

use crate::notizen::{lies_info, ordner_liste};
use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Serialize, Debug, Clone)]
pub struct Treffer {
    pub ordner: String,
    /// Notiz, die geöffnet werden soll (bei PDF-Treffern: die Notiz, in der das PDF eingebunden ist)
    pub datei: Option<String>,
    pub titel: String,
    pub datum: String,
    /// Kurzer Textausschnitt mit dem Suchbegriff
    pub ausschnitt: String,
    /// "notiz" oder "pdf"
    pub art: &'static str,
    /// Bei PDF-Treffern: Pfad des PDFs (assets/…)
    pub pdf: Option<String>,
    #[serde(skip)]
    punkte: u32,
    #[serde(skip)]
    geaendert: u64,
}

/// Vergleichsform: klein, Umlaute vereinheitlicht ("Größe", "groesse", "Grosse" → "grosse")
pub fn falten(text: &str) -> String {
    let mut s = String::with_capacity(text.len());
    for c in text.chars().flat_map(char::to_lowercase) {
        match c {
            'ä' => s.push('a'),
            'ö' => s.push('o'),
            'ü' => s.push('u'),
            'ß' => s.push_str("ss"),
            _ => s.push(c),
        }
    }
    s.replace("ae", "a").replace("oe", "o").replace("ue", "u")
}

/// Markdown-Zeichen am Zeilenanfang entfernen, damit der Ausschnitt lesbar ist
fn lesbar(zeile: &str) -> String {
    let z = zeile.trim().trim_start_matches(['#', '>', '-', '*', '|', ' ']).trim();
    let z = z.strip_prefix("[ ] ").or_else(|| z.strip_prefix("[x] ")).unwrap_or(z);
    let z = z.replace("**", "").replace('`', "");
    let z = z.replace("[!claude]", "Claude:").replace("[!merke]", "Merke:").replace("[!karten]", "Karten:");
    z.trim().to_string()
}

/// Ausschnitt aus der Zeile mit den meisten Suchwörtern (max. ~140 Zeichen).
/// Die Titelzeile (# …) wird übersprungen – der Titel steht ohnehin in der Trefferliste.
fn ausschnitt(text: &str, woerter: &[String]) -> String {
    let beste = text
        .lines()
        .filter(|z| !z.trim_start().starts_with("# "))
        .map(|z| (woerter.iter().filter(|w| falten(z).contains(w.as_str())).count(), z))
        .filter(|(n, z)| *n > 0 && !lesbar(z).is_empty())
        .fold(None::<(usize, &str)>, |best, (n, z)| match best {
            Some((m, _)) if m >= n => best,
            _ => Some((n, z)),
        });
    let Some((_, zeile)) = beste else { return String::new() };
    let lesbar = lesbar(zeile);
    let zeichen: Vec<char> = lesbar.chars().collect();
    if zeichen.len() <= 140 {
        return lesbar;
    }
    // Fundstelle ungefähr in die Mitte (Position in der gefalteten Form ist eine Näherung)
    let pos = falten(&lesbar).find(woerter[0].as_str()).unwrap_or(0);
    let pos_zeichen = lesbar.get(..pos.min(lesbar.len())).map(|s| s.chars().count()).unwrap_or(0);
    let start = pos_zeichen.saturating_sub(50);
    let ende = (start + 140).min(zeichen.len());
    let mut s: String = zeichen[start..ende].iter().collect();
    if start > 0 {
        s.insert(0, '…');
    }
    if ende < zeichen.len() {
        s.push('…');
    }
    s
}

/// Bewertung: alle Wörter müssen vorkommen; Titel zählt viel, Überschriften mehr als Text
fn bewerten(titel: &str, text: &str, woerter: &[String]) -> Option<u32> {
    let (t, x) = (falten(titel), falten(text));
    let mut punkte = 0;
    for w in woerter {
        let im_titel = t.contains(w.as_str());
        let im_text = x.matches(w.as_str()).count() as u32;
        if !im_titel && im_text == 0 {
            return None;
        }
        if im_titel {
            punkte += 20;
        }
        punkte += im_text.min(10);
        let in_ueberschrift = text
            .lines()
            .filter(|z| z.trim_start().starts_with('#'))
            .any(|z| falten(z).contains(w.as_str()));
        if in_ueberschrift {
            punkte += 8;
        }
    }
    Some(punkte)
}

fn ohne_frontmatter(inhalt: &str) -> &str {
    if let Some(rest) = inhalt.strip_prefix("---\n").or_else(|| inhalt.strip_prefix("---\r\n")) {
        if let Some(ende) = rest.find("\n---") {
            return rest[ende + 4..].trim_start_matches(['-', '\r', '\n']);
        }
    }
    inhalt
}

pub fn suchen(root: &Path, anfrage: &str, max: usize) -> Vec<Treffer> {
    let woerter: Vec<String> = falten(anfrage).split_whitespace().map(String::from).collect();
    let mut treffer = Vec::new();

    for ordner in ordner_liste(root).unwrap_or_default() {
        if ordner == "Gerettet" {
            continue; // Konfliktkopien nicht in der Suche
        }
        let pfad = root.join(&ordner);
        let Ok(eintraege) = fs::read_dir(&pfad) else { continue };
        let mut notizen: Vec<(String, String, String, String, u64)> = Vec::new(); // datei, titel, datum, inhalt, geaendert

        for e in eintraege.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') || !name.ends_with(".md") {
                continue;
            }
            let (Ok(info), Ok(inhalt)) = (lies_info(&e.path()), fs::read_to_string(e.path())) else { continue };
            notizen.push((info.datei, info.titel, info.datum, inhalt, info.geaendert));
        }

        for (datei, titel, datum, inhalt, geaendert) in &notizen {
            let text = ohne_frontmatter(inhalt);
            let punkte = if woerter.is_empty() { Some(0) } else { bewerten(titel, text, &woerter) };
            if let Some(punkte) = punkte {
                treffer.push(Treffer {
                    ordner: ordner.clone(),
                    datei: Some(datei.clone()),
                    titel: titel.clone(),
                    datum: datum.clone(),
                    ausschnitt: if woerter.is_empty() { String::new() } else { ausschnitt(text, &woerter) },
                    art: "notiz",
                    pdf: None,
                    punkte,
                    geaendert: *geaendert,
                });
            }
        }

        // PDF-Texte (assets/*.txt neben einem PDF)
        if woerter.is_empty() {
            continue;
        }
        let Ok(assets) = fs::read_dir(pfad.join("assets")) else { continue };
        for e in assets.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            let Some(stamm) = name.strip_suffix(".txt") else { continue };
            let pdf_name = format!("{stamm}.pdf");
            if !pfad.join("assets").join(&pdf_name).exists() {
                continue;
            }
            let Ok(text) = fs::read_to_string(e.path()) else { continue };
            let Some(punkte) = bewerten(&pdf_name, &text, &woerter) else { continue };
            let pdf_pfad = format!("assets/{pdf_name}");
            // Notiz finden, in der das PDF eingebunden ist
            let einbindung = notizen.iter().find(|(_, _, _, inhalt, _)| inhalt.contains(&pdf_pfad));
            treffer.push(Treffer {
                ordner: ordner.clone(),
                datei: einbindung.map(|n| n.0.clone()),
                titel: pdf_name.clone(),
                datum: einbindung.map(|n| n.2.clone()).unwrap_or_default(),
                ausschnitt: ausschnitt(&text, &woerter),
                art: "pdf",
                pdf: Some(pdf_pfad),
                punkte,
                geaendert: 0,
            });
        }
    }

    // Ohne Suchbegriff: zuletzt bearbeitete Notizen
    if woerter.is_empty() {
        treffer.sort_by_key(|t| std::cmp::Reverse(t.geaendert));
    } else {
        treffer.sort_by(|a, b| b.punkte.cmp(&a.punkte).then(b.datum.cmp(&a.datum)));
    }
    treffer.truncate(max);
    treffer
}

#[cfg(test)]
mod tests {
    use super::*;

    fn schule() -> (tempfile::TempDir, std::path::PathBuf) {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("Schule");
        fs::create_dir_all(root.join("LF05/assets")).unwrap();
        fs::create_dir_all(root.join("LF09")).unwrap();
        fs::create_dir_all(root.join("Gerettet")).unwrap();
        fs::write(
            root.join("LF05/2026-10-06-SQL-Joins.md"),
            "---\ndatum: 2026-10-06\n---\n\n# SQL-Joins\n\n- INNER JOIN liefert nur Treffer\n\n```pdf\nsrc: assets/Blatt.pdf\n```\n",
        )
        .unwrap();
        fs::write(root.join("LF05/2026-10-07-Normalformen.md"), "---\ndatum: 2026-10-07\n---\n\n# Normalformen\n\nDie 3. Normalform verhindert transitive Abhängigkeiten. Größe egal.\n").unwrap();
        fs::write(root.join("LF09/2026-10-08-Subnetting.md"), "# Subnetting\n\n## JOIN? Nein: Netzmaske /26\n").unwrap();
        fs::write(root.join("LF05/assets/Blatt.pdf"), "%PDF").unwrap();
        fs::write(root.join("LF05/assets/Blatt.txt"), "--- Seite 1 ---\nAufgabe 3: Erklären Sie den LEFT JOIN.\n").unwrap();
        fs::write(root.join("Gerettet/x-konflikt-1000.md"), "# JOIN Kopie").unwrap();
        (tmp, root)
    }

    #[test]
    fn umlaute_und_schreibweisen() {
        assert_eq!(falten("Größe"), falten("groesse"));
        assert_eq!(falten("Größe"), falten("Grösse"));
        assert_eq!(falten("Abhängigkeit"), falten("abhaengigkeit"));
    }

    #[test]
    fn findet_titel_text_und_pdf() {
        let (_t, root) = schule();
        let t = suchen(&root, "join", 20);
        // Titel-Treffer zuerst, Gerettet nie
        assert_eq!(t[0].titel, "SQL-Joins");
        assert!(t.iter().any(|x| x.art == "pdf" && x.ausschnitt.contains("LEFT JOIN")));
        let pdf = t.iter().find(|x| x.art == "pdf").unwrap();
        assert_eq!(pdf.datei.as_deref(), Some("2026-10-06-SQL-Joins.md"), "PDF-Treffer öffnet die einbindende Notiz");
        assert!(t.iter().all(|x| x.ordner != "Gerettet"));
    }

    #[test]
    fn alle_woerter_muessen_vorkommen() {
        let (_t, root) = schule();
        let t = suchen(&root, "transitive normalform", 20);
        assert_eq!(t.len(), 1);
        assert!(t[0].ausschnitt.contains("transitive"));
        assert!(suchen(&root, "transitive subnetting", 20).is_empty());
        assert_eq!(suchen(&root, "groesse", 20).len(), 1);
    }

    /// Geschwindigkeit mit 1000 Notizen à ~3 KB (läuft nur mit `cargo test -- --ignored`)
    #[test]
    #[ignore]
    fn geschwindigkeit_1000_notizen() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("Schule");
        let text = "- Ein Satz über Datenbanken, Normalformen und Joins.\n".repeat(60);
        for lf in 1..=12 {
            let o = root.join(format!("LF{lf:02}"));
            fs::create_dir_all(&o).unwrap();
            for i in 0..84 {
                fs::write(o.join(format!("2026-10-{:02}-Notiz-{i}.md", 1 + i % 28)), format!("---\ndatum: 2026-10-01\n---\n\n# Notiz {i}\n\n{text}")).unwrap();
            }
        }
        let start = std::time::Instant::now();
        let t = suchen(&root, "normalform join", 50);
        let dauer = start.elapsed();
        println!("1008 Notizen durchsucht in {dauer:?}, {} Treffer", t.len());
        assert!(dauer.as_millis() < 1000);
    }

    #[test]
    fn leere_anfrage_zeigt_zuletzt_bearbeitete() {
        let (_t, root) = schule();
        let t = suchen(&root, "  ", 2);
        assert_eq!(t.len(), 2);
        assert!(t.iter().all(|x| x.art == "notiz"));
    }
}
