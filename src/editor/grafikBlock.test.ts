// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { grafikAngaben } from "./grafikBlock";

it("liest src und höhe aus dem Grafik-Block", () => {
  expect(grafikAngaben("src: assets/join.html\nhöhe: 400")).toEqual({ src: "assets/join.html", hoehe: 400 });
  expect(grafikAngaben("src: assets/a.html\nhoehe: 50")).toEqual({ src: "assets/a.html", hoehe: 120 });
  expect(grafikAngaben("datei: assets/b.html")).toEqual({ src: "assets/b.html", hoehe: 360 });
  expect(grafikAngaben("src: assets/\nhöhe: 360").src).toBe("");
  expect(grafikAngaben("").src).toBe("");
});
