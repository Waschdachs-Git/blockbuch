// PDF-Text als .txt neben jedes PDF in assets/ – für die Suche und damit Claude Arbeitsblätter schnell lesen kann.
// Benutzt PDFKit über osascript (macOS-Bordmittel, zuverlässiger als pdf.js im Webview).

use std::fs;
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

const SKRIPT: &str = include_str!("pdftext.js");
/// Ein PDF, das so lange braucht, ist kaputt oder präpariert – abbrechen
const ZEITLIMIT: Duration = Duration::from_secs(20);
const MAX_BYTES: u64 = 100 * 1024 * 1024;

/// Text eines PDFs (Seiten mit "--- Seite N ---" getrennt)
pub fn auslesen(pdf: &Path) -> Result<String, String> {
    let mut kind = Command::new("osascript")
        .args(["-l", "JavaScript", "-"])
        .arg(pdf)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    kind.stdin.take().ok_or("stdin")?.write_all(SKRIPT.as_bytes()).map_err(|e| e.to_string())?;
    // Mit Zeitlimit warten – ein hängendes PDF darf den Start nicht dauerhaft blockieren
    let start = Instant::now();
    loop {
        match kind.try_wait().map_err(|e| e.to_string())? {
            Some(_) => break,
            None if start.elapsed() > ZEITLIMIT => {
                let _ = kind.kill();
                let _ = kind.wait();
                return Err(format!("PDF-Text: Zeitlimit überschritten ({})", pdf.display()));
            }
            None => std::thread::sleep(Duration::from_millis(50)),
        }
    }
    let aus = kind.wait_with_output().map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&aus.stdout).into_owned();
    if !aus.status.success() || text.starts_with("FEHLER") {
        return Err(format!("PDF-Text konnte nicht gelesen werden: {}", String::from_utf8_lossy(&aus.stderr).trim()));
    }
    Ok(text)
}

/// Merker für PDFs, deren Text nicht lesbar war (sonst würde es bei jedem Start erneut versucht)
fn ohne_text_merker(pdf: &Path) -> std::path::PathBuf {
    let name = pdf.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    pdf.with_file_name(format!(".{name}.blockbuch-ohnetext"))
}

/// Legt <name>.txt neben <name>.pdf an, falls es sie noch nicht gibt
pub fn txt_erzeugen(pdf: &Path) -> Result<bool, String> {
    let txt = pdf.with_extension("txt");
    if txt.exists() || ohne_text_merker(pdf).exists() {
        return Ok(false);
    }
    if fs::metadata(pdf).map(|m| m.len() > MAX_BYTES).unwrap_or(true) {
        return Ok(false);
    }
    // Hinweis: osascript läuft (anders als die Vorschau-App) ohne Sandbox – darum Zeitlimit und Größengrenze
    match auslesen(pdf) {
        Ok(text) => {
            crate::notizen::schreibe_atomar(&txt, &text, None)?;
            Ok(true)
        }
        Err(e) => {
            let _ = fs::write(ohne_text_merker(pdf), &e);
            Err(e)
        }
    }
}

/// Alle PDFs in <Ordner>/assets/ ohne .txt nachträglich auslesen (beim Start)
pub fn fehlende_erzeugen(root: &Path) -> usize {
    let mut anzahl = 0;
    let Ok(ordner) = fs::read_dir(root) else { return 0 };
    for o in ordner.flatten() {
        let name = o.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let Ok(dateien) = fs::read_dir(o.path().join("assets")) else { continue };
        for d in dateien.flatten() {
            let p = d.path();
            if p.extension().is_some_and(|e| e.eq_ignore_ascii_case("pdf")) && matches!(txt_erzeugen(&p), Ok(true)) {
                anzahl += 1;
            }
        }
    }
    anzahl
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;

    #[test]
    fn text_aus_pdf_und_fehlende_nachholen() {
        let tmp = tempfile::tempdir().unwrap();
        let assets = tmp.path().join("Schule/LF05/assets");
        fs::create_dir_all(&assets).unwrap();
        let pdf = concat!(env!("CARGO_MANIFEST_DIR"), "/vorlagen/beispiel/arbeitsblatt-test.pdf");
        fs::copy(pdf, assets.join("Blatt.pdf")).unwrap();
        assert_eq!(fehlende_erzeugen(&tmp.path().join("Schule")), 1);
        let txt = fs::read_to_string(assets.join("Blatt.txt")).unwrap();
        assert!(txt.contains("--- Seite 2 ---") && txt.contains("INNER JOIN"), "{txt}");
        assert_eq!(fehlende_erzeugen(&tmp.path().join("Schule")), 0, "vorhandene .txt bleibt");
    }
}
