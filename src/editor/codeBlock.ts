// Codeblock, der beim Speichern einen ausreichend langen Zaun wählt: Enthält der Code selbst
// ``` (z. B. eine Notiz über Markdown), wird mit ```` umschlossen – sonst wäre der Block kaputt.
import CodeBlock from "@tiptap/extension-code-block";

export function zaunFuer(code: string): string {
  const laengste = Math.max(0, ...(code.match(/`+/g) ?? []).map((r) => r.length));
  return "`".repeat(Math.max(3, laengste + 1));
}

export const SichererCodeBlock = CodeBlock.extend({
  renderMarkdown: (node, h) => {
    const sprache = (node.attrs?.language as string | undefined) || "";
    if (!node.content) return `\`\`\`${sprache}\n\n\`\`\``;
    const code = h.renderChildren(node.content);
    const zaun = zaunFuer(code);
    return [`${zaun}${sprache}`, code, zaun].join("\n");
  },
});
