import { expect, it } from "vitest";
import { falten, fundstellen } from "./falten";

it("faltet wie die Rust-Suche", () => {
  expect(falten("Größe")).toBe(falten("groesse"));
  expect(falten("Queue")).toBe("queue");
  expect(falten("Bär")).not.toBe(falten("Bar"));
});

it("findet Fundstellen im Original – auch über Umlaute und Emojis", () => {
  const t = "Die 😀 Größe der Tabelle";
  const [[s, e]] = fundstellen(t, ["groesse"]);
  expect(t.slice(s, e)).toBe("Größe");
  expect(fundstellen("SQL und sql", ["sql"]).map(([s, e]) => [s, e])).toEqual([[0, 3], [8, 11]]);
  expect(fundstellen("Was ist das? ❓", ["❓"]).length).toBe(1);
});
