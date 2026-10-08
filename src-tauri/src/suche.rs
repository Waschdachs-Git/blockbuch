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
    #[serde(skip)]
    text: String,
}

/// Vergleichsform: klein, Umlaute ausgeschrieben ("Größe" und "groesse" → "groesse").
/// Bewusst nur in diese Richtung: "Queue", "aktuell", "Bar"/"Bär" bleiben unterscheidbar.
/// Liefert zu jedem Zeichen der gefalteten Form den Zeichenindex im Original (für Ausschnitte).
pub fn falten_mit_index(text: &str) -> (Vec<char>, Vec<usize>) {
    let mut zeichen = Vec::with_capacity(text.len());
    let mut herkunft = Vec::with_capacity(text.len());
    for (i, c) in text.chars().enumerate() {
        for k in c.to_lowercase() {
            let ersatz: &[char] = match k {
                'ä' => &['a', 'e'],
                'ö' => &['o', 'e'],
                'ü' => &['u', 'e'],
                'ß' => &['s', 's'],
                _ => {
                    zeichen.push(k);
                    herkunft.push(i);
                    continue;
                }
            };
            for &e in ersatz {
                zeichen.push(e);
                herkunft.push(i);
            }
        }
    }
    (zeichen, herkunft)
}

pub fn falten(text: &str) -> String {
    falten_mit_index(text).0.into_iter().collect()
}

/// Position (in gefalteten Zeichen) des ersten Vorkommens von `wort`
fn finde(gefaltet: &[char], wort: &[char]) -> Option<usize> {
    if wort.is_empty() || wort.len() > gefaltet.len() {
        return None;
    }
    (0..=gefaltet.len() - wort.len()).find(|&i| gefaltet[i..i + wort.len()] == *wort)
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
        .map(|z| {
            let f = falten(z);
            (woerter.iter().filter(|w| f.contains(w.as_str())).count(), z)
        })
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
    // Fundstelle in die Mitte – über die Zuordnung gefaltet → Original (Umlaute, Emojis sicher)
    let (gefaltet, herkunft) = falten_mit_index(&lesbar);
    let pos_zeichen = woerter
        .iter()
        .find_map(|w| finde(&gefaltet, &w.chars().collect::<Vec<_>>()))
        .map(|i| herkunft[i])
        .unwrap_or(0);
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
    let ueberschriften: Vec<String> = text.lines().filter(|z| z.trim_start().starts_with('#')).map(falten).collect();
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
        if ueberschriften.iter().any(|z| z.contains(w.as_str())) {
            punkte += 8;
        }
    }
    Some(punkte)
}

/// (Frontmatter, Rest) – der Rest beginnt nach der schließenden "---"-Zeile
fn teile(inhalt: &str) -> (&str, &str) {
    if let Some(rest) = inhalt.strip_prefix("---\n").or_else(|| inhalt.strip_prefix("---\r\n")) {
        if let Some(ende) = rest.find("\n---") {
            let nach = &rest[ende + 4..];
            let zeilenende = nach.find('\n').map(|i| i + 1).unwrap_or(nach.len());
            return (&rest[..ende], &nach[zeilenende..]);
        }
    }
    ("", inhalt)
}

/// Tags aus dem Frontmatter, z. B. "tags: [sql, joins]" → ["sql", "joins"]
fn tags(frontmatter: &str) -> Vec<String> {
    frontmatter
        .lines()
        .find_map(|z| z.trim().strip_prefix("tags:"))
        .map(|t| {
            t.trim()
                .trim_matches(['[', ']'])
                .split(',')
                .map(|x| falten(x.trim().trim_matches(['"', '\'', '#'])))
                .filter(|x| !x.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

/// Lernfeld-Filter aus der Anfrage: "lf5", "LF05" → 5
fn lernfeld_filter(wort: &str) -> Option<u32> {
    let n: u32 = wort.strip_prefix("lf")?.parse().ok()?;
    (1..=20).contains(&n).then_some(n)
}

/// Lernfeld-Nummer eines Ordners: "LF5", "LF05", "LF 5", "LF5-Datenbanken" → 5
pub fn lernfeld_nummer(ordner: &str) -> Option<u32> {
    let rest = falten(ordner);
    let rest = rest.strip_prefix("lf")?.trim_start();
    let ziffern: String = rest.chars().take_while(char::is_ascii_digit).collect();
    let danach = rest[ziffern.len()..].chars().next();
    if ziffern.is_empty() || danach.is_some_and(|c| !matches!(c, ' ' | '-' | '_')) {
        return None;
    }
    ziffern.parse().ok()
}

/// Anfrage-Syntax: normale Wörter (alle müssen vorkommen), "lf5" = nur Lernfeld 5,
/// "#sql" = nur Notizen mit Tag sql. Einzelne Buchstaben werden ignoriert (treffen fast alles),
/// Marker wie ❓ und 🙋 gehen als ganz normale Suchwörter.
pub fn suchen(root: &Path, anfrage: &str, max: usize) -> Vec<Treffer> {
    let mut woerter: Vec<String> = Vec::new();
    let mut lernfeld: Option<u32> = None;
    let mut tag_filter: Vec<String> = Vec::new();
    for w in falten(anfrage).split_whitespace() {
        if let Some(lf) = lernfeld_filter(w) {
            lernfeld = Some(lf);
        } else if let Some(t) = w.strip_prefix('#').filter(|t| !t.is_empty()) {
            tag_filter.push(t.to_string());
        } else if w.chars().count() >= 2 || !w.chars().all(char::is_alphanumeric) {
            woerter.push(w.to_string());
        }
    }
    let mut treffer = Vec::new();

    for ordner in ordner_liste(root).unwrap_or_default() {
        if ordner == "Gerettet" || ordner == crate::notizen::CLAUDE_ORDNER {
            continue; // Konfliktkopien und Claude-Anleitung nicht in der Suche
        }
        if let Some(lf) = lernfeld {
            if lernfeld_nummer(&ordner) != Some(lf) {
                continue;
            }
        }
        let pfad = root.join(&ordner);
        let Ok(eintraege) = fs::read_dir(&pfad) else { continue };
        let mut notizen: Vec<(String, String, String, String, u64)> = Vec::new(); // datei, titel, datum, inhalt, geaendert

        for e in eintraege.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') || !name.ends_with(".md") {
                continue;
            }
            let Ok(info) = lies_info(&e.path()) else { continue };
            // ungültiges UTF-8 nicht still überspringen
            let Ok(roh) = fs::read(e.path()) else { continue };
            let inhalt = String::from_utf8_lossy(&roh).into_owned();
            notizen.push((info.datei, info.titel, info.datum, inhalt, info.geaendert));
        }

        for (datei, titel, datum, inhalt, geaendert) in &notizen {
            let (frontmatter, text) = teile(inhalt);
            let notiz_tags = tags(frontmatter);
            if !tag_filter.iter().all(|t| notiz_tags.iter().any(|n| n.starts_with(t.as_str()))) {
                continue;
            }
            // Tags zählen wie Titelwörter
            let titel_und_tags = format!("{titel} {}", notiz_tags.join(" "));
            let punkte = if woerter.is_empty() { Some(0) } else { bewerten(&titel_und_tags, text, &woerter) };
            if let Some(punkte) = punkte {
                treffer.push(Treffer {
                    ordner: ordner.clone(),
                    datei: Some(datei.clone()),
                    titel: titel.clone(),
                    datum: datum.clone(),
                    ausschnitt: String::new(),
                    text: text.to_string(),
                    art: "notiz",
                    pdf: None,
                    punkte,
                    geaendert: *geaendert,
                });
            }
        }

        // PDF-Texte (assets/*.txt neben einem PDF) – nicht bei reinen Tag-Filtern
        if woerter.is_empty() || !tag_filter.is_empty() {
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
            let Ok(roh) = fs::read(e.path()) else { continue };
            let text = String::from_utf8_lossy(&roh).into_owned();
            let Some(punkte) = bewerten(&pdf_name, &text, &woerter) else { continue };
            let pdf_pfad = format!("assets/{pdf_name}");
            // Notiz finden, in der das PDF eingebunden ist
            let einbindung = notizen.iter().find(|(_, _, _, inhalt, _)| inhalt.contains(&pdf_pfad));
            treffer.push(Treffer {
                ordner: ordner.clone(),
                datei: einbindung.map(|n| n.0.clone()),
                titel: pdf_name.clone(),
                datum: einbindung.map(|n| n.2.clone()).unwrap_or_default(),
                ausschnitt: String::new(),
                text,
                art: "pdf",
                pdf: Some(pdf_pfad),
                punkte,
                geaendert: 0,
            });
        }
    }

    // Ohne Suchwörter (leer oder nur Filter): zuletzt bearbeitete Notizen
    if woerter.is_empty() {
        treffer.sort_by_key(|t| std::cmp::Reverse(t.geaendert));
    } else {
        treffer.sort_by(|a, b| b.punkte.cmp(&a.punkte).then(b.datum.cmp(&a.datum)));
    }
    treffer.truncate(max);
    // Ausschnitte erst jetzt – nur für die angezeigten Treffer
    if !woerter.is_empty() {
        for t in &mut treffer {
            t.ausschnitt = ausschnitt(&t.text, &woerter);
        }
    }
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
        // keine Verwässerung
        assert_eq!(falten("Queue"), "queue");
        assert_eq!(falten("aktuell"), "aktuell");
        assert_ne!(falten("Bar"), falten("Bär"));
    }

    #[test]
    fn ausschnitt_zeigt_fundstelle_auch_nach_umlauten_und_emojis() {
        let lang = format!("{} Mauer 😀 Queue Größe {}", "äöü ".repeat(30), "x ".repeat(80));
        let a = ausschnitt(&format!("{lang}transitive Abhängigkeit"), &["transitive".to_string()]);
        assert!(a.contains("transitive"), "{a}");
        let b = ausschnitt(&lang, &["queue".to_string()]);
        assert!(b.contains("Queue"), "{b}");
    }

    #[test]
    fn filter_lernfeld_tags_und_marker() {
        let (_t, root) = schule();
        fs::write(root.join("LF05/2026-10-09-Tags.md"), "---\ndatum: 2026-10-09\ntags: [sql, uebung]\n---\n\n# Übung\n\nWas ist ein Schlüssel? ❓\n").unwrap();
        assert!(suchen(&root, "lf9 join", 20).iter().all(|t| t.ordner == "LF09"));
        assert_eq!(suchen(&root, "lf9 join", 20).len(), 1);
        let t = suchen(&root, "#sql", 20);
        assert_eq!(t.len(), 1);
        assert_eq!(t[0].titel, "Übung");
        assert_eq!(suchen(&root, "❓", 20).len(), 1);
        assert_eq!(suchen(&root, "uebung", 20).len(), 1, "Tags zählen wie Titel");
        assert!(!suchen(&root, "a", 20).is_empty(), "einzelner Buchstabe = wie leer");
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
    fn lernfeld_nummern_aus_ordnernamen() {
        assert_eq!(lernfeld_nummer("LF5"), Some(5));
        assert_eq!(lernfeld_nummer("LF05-Daten-verwalten"), Some(5));
        assert_eq!(lernfeld_nummer("lf 12"), Some(12));
        assert_eq!(lernfeld_nummer("LF1_Unternehmen"), Some(1));
        assert_eq!(lernfeld_nummer("LF5x"), None);
        assert_eq!(lernfeld_nummer("Deutsch"), None);
    }

    #[test]
    fn leere_anfrage_zeigt_zuletzt_bearbeitete() {
        let (_t, root) = schule();
        let t = suchen(&root, "  ", 2);
        assert_eq!(t.len(), 2);
        assert!(t.iter().all(|x| x.art == "notiz"));
    }
}
