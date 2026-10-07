export function EditorPane() {
  return (
    <main className="editor">
      <div className="titelleiste" data-tauri-drag-region />
      <div className="leer leer--gross">
        <p>Keine Notiz geöffnet</p>
        <p className="leer__hinweis">Wähle links ein Lernfeld und eine Notiz.</p>
      </div>
    </main>
  );
}
