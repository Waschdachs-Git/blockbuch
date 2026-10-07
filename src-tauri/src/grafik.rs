// Liefert animierte Grafiken (HTML-Dateien von Claude) an die eingebetteten Rahmen in Notizen.
// Adresse: grafik://localhost/<Ordner>/assets/<Datei>  (Windows: http://grafik.localhost/…)
//
// Sicherheit – eine Grafik ist ein kleines Programm, darum mehrfach abgeschottet:
//  1. Nur Dateien aus <Ordner>/assets/ in ~/Schule, keine Pfadtricks (.., Symlinks nach außen).
//  2. Strenge CSP: kein Netzwerkzugriff (connect-src 'none'), keine Formulare, keine Rahmen.
//     Nur Skript-Bibliotheken von bekannten CDNs sind erlaubt (falls Claude eine braucht).
//  3. Der Rahmen in der App ist sandboxed (eigener Ursprung) und bekommt keine App-Befehle –
//     Tauri gibt den nötigen Schlüssel nur dem Hauptfenster.

use std::path::Path;

pub const SCHEMA: &str = "grafik";

const CSP: &str = "default-src 'none'; \
    script-src 'unsafe-inline' 'unsafe-eval' grafik: http://grafik.localhost https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com; \
    style-src 'unsafe-inline' grafik: http://grafik.localhost https://fonts.googleapis.com; \
    font-src data: https://fonts.gstatic.com; \
    img-src data: blob: grafik: http://grafik.localhost; \
    media-src data: blob: grafik: http://grafik.localhost; \
    connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";

pub struct Antwort {
    pub status: u16,
    pub typ: &'static str,
    pub inhalt: Vec<u8>,
}

fn typ_fuer(datei: &str) -> Option<&'static str> {
    let endung = datei.rsplit('.').next()?.to_ascii_lowercase();
    Some(match endung.as_str() {
        "html" | "htm" => "text/html; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" => "application/json",
        "mp4" => "video/mp4",
        _ => return None,
    })
}

fn fehlerseite(status: u16, text: &str) -> Antwort {
    let html = format!(
        "<!doctype html><meta charset=utf-8><style>body{{font:14px -apple-system,sans-serif;color:#888;\
         display:grid;place-items:center;height:100vh;margin:0;text-align:center}}</style><p>{}</p>",
        text.replace('&', "&amp;").replace('<', "&lt;")
    );
    Antwort { status, typ: "text/html; charset=utf-8", inhalt: html.into_bytes() }
}

/// `pfad` ist der (URL-kodierte) Pfad hinter dem Host, z. B. "/LF05%2Fassets%2Fjoin.html"
pub fn antwort(root: &Path, pfad: &str) -> Antwort {
    let pfad = percent_encoding::percent_decode_str(pfad.trim_start_matches('/')).decode_utf8_lossy();
    // Abfrageteil (?v=3, zum Neuladen) ignorieren
    let pfad = pfad.split('?').next().unwrap_or_default();
    let teile: Vec<&str> = pfad.split('/').filter(|t| !t.is_empty()).collect();

    let [ordner, "assets", datei] = teile.as_slice() else {
        return fehlerseite(404, "Grafiken müssen im Ordner assets/ liegen.");
    };
    let gueltig = |t: &str| !t.starts_with('.') && !t.contains(['\\', '\0', ':']);
    if !gueltig(ordner) || !gueltig(datei) {
        return fehlerseite(400, "Ungültiger Pfad.");
    }
    let Some(typ) = typ_fuer(datei) else {
        return fehlerseite(415, "Dieser Dateityp wird nicht angezeigt.");
    };

    let ziel = root.join(ordner).join("assets").join(datei);
    // Symlinks dürfen nicht aus ~/Schule herausführen
    let (Ok(echt), Ok(echt_root)) = (ziel.canonicalize(), root.canonicalize()) else {
        return fehlerseite(404, &format!("Grafik nicht gefunden: {ordner}/assets/{datei}"));
    };
    if !echt.starts_with(&echt_root) {
        return fehlerseite(403, "Zugriff verweigert.");
    }
    match std::fs::read(&echt) {
        Ok(inhalt) => Antwort { status: 200, typ, inhalt },
        Err(_) => fehlerseite(404, &format!("Grafik nicht gefunden: {ordner}/assets/{datei}")),
    }
}

/// Tauri-Handler für das Schema `grafik`
pub fn http_antwort(root: &Path, request: &tauri::http::Request<Vec<u8>>) -> tauri::http::Response<Vec<u8>> {
    let a = antwort(root, request.uri().path());
    tauri::http::Response::builder()
        .status(a.status)
        .header("Content-Type", a.typ)
        .header("Content-Security-Policy", CSP)
        .header("Cache-Control", "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .body(a.inhalt)
        .unwrap_or_else(|_| tauri::http::Response::new(Vec::new()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn schule() -> (tempfile::TempDir, std::path::PathBuf) {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("Schule");
        fs::create_dir_all(root.join("LF05/assets")).unwrap();
        fs::write(root.join("LF05/assets/join.html"), "<p>Join</p>").unwrap();
        fs::write(root.join("LF05/geheim.md"), "Notiz").unwrap();
        (tmp, root)
    }

    #[test]
    fn liefert_grafik_aus_assets() {
        let (_t, root) = schule();
        let a = antwort(&root, "/LF05%2Fassets%2Fjoin.html");
        assert_eq!(a.status, 200);
        assert_eq!(a.inhalt, b"<p>Join</p>");
        assert!(a.typ.starts_with("text/html"));
        assert_eq!(antwort(&root, "/LF05/assets/join.html?v=3").status, 200);
    }

    #[test]
    fn nichts_ausserhalb_von_assets() {
        let (_t, root) = schule();
        assert_eq!(antwort(&root, "/LF05/geheim.md").status, 404);
        assert_eq!(antwort(&root, "/LF05/assets/..%2F..%2Fgeheim.md").status, 404);
        assert_eq!(antwort(&root, "/..%2FLF05%2Fassets%2Fjoin.html").status, 404);
        assert_eq!(antwort(&root, "/LF05/assets/.versteckt.html").status, 400);
        assert_eq!(antwort(&root, "/LF05/assets/fehlt.html").status, 404);
        assert_eq!(antwort(&root, "/LF05/assets/programm.exe").status, 415);
    }

    #[cfg(unix)]
    #[test]
    fn symlink_nach_aussen_wird_blockiert() {
        let (t, root) = schule();
        fs::write(t.path().join("draussen.html"), "geheim").unwrap();
        std::os::unix::fs::symlink(t.path().join("draussen.html"), root.join("LF05/assets/link.html")).unwrap();
        assert_eq!(antwort(&root, "/LF05/assets/link.html").status, 403);
    }
}
