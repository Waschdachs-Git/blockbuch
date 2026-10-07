import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// Im normalen Browser (nicht in Tauri) die Rust-Befehle simulieren – nur beim Entwickeln
if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) {
  await import("./dev/tauriMock");
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
