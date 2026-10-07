// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { grafikAdresse, grafikAngaben } from "./grafikBlock";

it("liest src und höhe aus dem Grafik-Block", () => {
  expect(grafikAngaben("src: assets/join.html\nhöhe: 400")).toEqual({ src: "assets/join.html", hoehe: 400 });
  expect(grafikAngaben("src: assets/a.html\nhoehe: 50")).toEqual({ src: "assets/a.html", hoehe: 120 });
  expect(grafikAngaben("datei: assets/b.html")).toEqual({ src: "assets/b.html", hoehe: 360 });
  expect(grafikAngaben("src: assets/\nhöhe: 360").src).toBe("");
  expect(grafikAngaben("").src).toBe("");
});

it("Grafik-Adresse: echte Schrägstriche, damit relative Verweise in assets/ funktionieren", () => {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
    convertFileSrc: (p: string, s: string) => `${s}://localhost/${encodeURIComponent(p)}`,
  };
  const url = grafikAdresse("LF05-Daten verwalten", "assets/join animation.html");
  expect(url).toBe("grafik://localhost/LF05-Daten%20verwalten/assets/join%20animation.html");
  expect(new URL("bild.png", url).href).toBe("grafik://localhost/LF05-Daten%20verwalten/assets/bild.png");
  expect(grafikAdresse("LF05", "")).toBe("about:blank");
});
