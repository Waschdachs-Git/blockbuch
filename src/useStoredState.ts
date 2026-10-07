import { useEffect, useState } from "react";

// Kleine UI-Einstellungen (ausgewähltes Lernfeld, Sidebar offen) überleben einen Neustart.
// Echte Inhalte liegen nie hier, sondern als Dateien in ~/Schule.
export function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Speichern ist nur Komfort – Fehler ignorieren
    }
  }, [key, value]);

  return [value, setValue] as const;
}
