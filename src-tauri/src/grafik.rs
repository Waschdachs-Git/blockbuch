// Liefert animierte Grafiken (HTML-Dateien von Claude) an die eingebetteten Rahmen in Notizen.
// Adresse: grafik://localhost/<Ordner>/assets/<Datei>  (Windows: http://grafik.localhost/…)
//
// Sicherheit – eine Grafik ist ein kleines Programm, darum mehrfach abgeschottet:
//  1. Nur Dateien aus <Ordner>/assets/ in ~/Schule, keine Pfadtricks (.., Symlinks nach außen).
//  2. Strenge CSP: kein Netzwerk – auch keine CDNs/Webfonts (offline im Unterricht, kein Weg nach außen).
//     Bibliotheken müssen als Datei im selben assets/-Ordner liegen.
//  3. Der Rahmen in der App ist sandboxed (eigener Ursprung) und bekommt keine App-Befehle –
//     Tauri gibt den nötigen Schlüssel nur dem Hauptfenster.

use std::path::Path;

pub const SCHEMA: &str = "grafik";

const CSP: &str = "default-src 'none'; \
    script-src 'unsafe-inline' 'unsafe-eval' grafik: http://grafik.localhost; \
    style-src 'unsafe-inline' grafik: http://grafik.localhost; \
    font-src data: grafik: http://grafik.localhost; \
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
    // Segmente einzeln dekodieren (ein kodierter Schrägstrich %2F im Namen bleibt so ein Zeichen)
    let teile: Vec<String> = pfad
        .split('/')
        .filter(|t| !t.is_empty())
        .map(|t| percent_encoding::percent_decode_str(t).decode_utf8_lossy().into_owned())
        .collect();
    let teile: Vec<&str> = teile.iter().map(String::as_str).collect();

    let [ordner, "assets", datei] = teile.as_slice() else {
        return fehlerseite(404, "Grafiken müssen im Ordner assets/ liegen.");
    };
    let gueltig = |t: &str| !t.starts_with('.') && !t.contains(['/', '\\', '\0', ':']);
    if !gueltig(ordner) || !gueltig(datei) {
        return fehlerseite(400, "Ungültiger Pfad.");
    }
    // Unerlaubte Typen gar nicht erst auf der Platte suchen
    if typ_fuer(datei).is_none() {
        return fehlerseite(415, "Dieser Dateityp wird nicht angezeigt.");
    }
    let assets = root.join(ordner).join("assets");
    // Symlinks dürfen nicht aus diesem assets/-Ordner herausführen (z. B. auf eine Notiz)
    let (Ok(echt), Ok(echt_assets)) = (assets.join(datei).canonicalize(), assets.canonicalize()) else {
        return fehlerseite(404, &format!("Grafik nicht gefunden: {ordner}/assets/{datei}"));
    };
    if !echt.starts_with(&echt_assets) {
        return fehlerseite(403, "Zugriff verweigert.");
    }
    // Dateityp vom echten Ziel, nicht vom angefragten Namen
    let Some(typ) = echt.file_name().and_then(|n| n.to_str()).and_then(typ_fuer) else {
        return fehlerseite(415, "Dieser Dateityp wird nicht angezeigt.");
    };
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
        let a = antwort(&root, "/LF05/assets/join.html");
        assert_eq!(a.status, 200);
        assert_eq!(a.inhalt, b"<p>Join</p>");
        assert!(a.typ.starts_with("text/html"));
        // Umlaute/Leerzeichen im Namen (kodiert)
        fs::write(root.join("LF05/assets/Größe über.html"), "x").unwrap();
        assert_eq!(antwort(&root, "/LF05/assets/Gr%C3%B6%C3%9Fe%20%C3%BCber.html").status, 200);
        // Ganzer Pfad in einem kodierten Segment gilt nicht
        assert_eq!(antwort(&root, "/LF05%2Fassets%2Fjoin.html").status, 404);
    }

    #[test]
    fn nichts_ausserhalb_von_assets() {
        let (_t, root) = schule();
        assert_eq!(antwort(&root, "/LF05/geheim.md").status, 404);
        assert_eq!(antwort(&root, "/LF05/assets/..%2F..%2Fgeheim.md").status, 400);
        assert_eq!(antwort(&root, "/..%2FLF05%2Fassets%2Fjoin.html").status, 404);
        assert_eq!(antwort(&root, "/LF05/assets/.versteckt.html").status, 400);
        assert_eq!(antwort(&root, "/LF05/assets/fehlt.html").status, 404);
        assert_eq!(antwort(&root, "/LF05/assets/..%2Fgeheim.md").status, 400);
        assert_eq!(antwort(&root, "/LF05%252Fassets%252Fjoin.html").status, 404);
        assert_eq!(antwort(&root, "/LF05/assets/programm.exe").status, 415);
    }

    #[cfg(unix)]
    #[test]
    fn symlink_nach_aussen_wird_blockiert() {
        let (t, root) = schule();
        fs::write(t.path().join("draussen.html"), "geheim").unwrap();
        std::os::unix::fs::symlink(t.path().join("draussen.html"), root.join("LF05/assets/link.html")).unwrap();
        assert_eq!(antwort(&root, "/LF05/assets/link.html").status, 403);
        // Symlink in assets/ auf eine Notiz im selben Lernfeld
        std::os::unix::fs::symlink(root.join("LF05/geheim.md"), root.join("LF05/assets/notiz.html")).unwrap();
        assert_eq!(antwort(&root, "/LF05/assets/notiz.html").status, 403);
    }
}
