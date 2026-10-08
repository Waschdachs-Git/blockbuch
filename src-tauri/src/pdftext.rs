// PDF-Text als .txt neben jedes PDF in assets/ – für die Suche und damit Claude Arbeitsblätter schnell lesen kann.
// Benutzt PDFKit über osascript (macOS-Bordmittel, zuverlässiger als pdf.js im Webview).

use std::fs;
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

const SKRIPT: &str = include_str!("pdftext.js");

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
    let aus = kind.wait_with_output().map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&aus.stdout).into_owned();
    if !aus.status.success() || text.starts_with("FEHLER") {
        return Err(format!("PDF-Text konnte nicht gelesen werden: {}", String::from_utf8_lossy(&aus.stderr).trim()));
    }
    Ok(text)
}

/// Legt <name>.txt neben <name>.pdf an, falls es sie noch nicht gibt
pub fn txt_erzeugen(pdf: &Path) -> Result<bool, String> {
    let txt = pdf.with_extension("txt");
    if txt.exists() {
        return Ok(false);
    }
    let text = auslesen(pdf)?;
    crate::notizen::schreibe_atomar(&txt, &text, None)?;
    Ok(true)
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
