import { renderAnthropicContent } from "./anthropic-content";

// ---- shared message list ----------------------------------------------------

export function renderMessages(
  messages: any[],
  renderContent: (msg: any) => string
): string {
  if (!Array.isArray(messages)) return "<messages></messages>";
  const rendered = messages.map((msg, i) => {
    const role = msg.role ?? msg.type ?? "unknown";
    // Anthropic: content lives on msg.content ; renderContent handles the shape.
    const inner =
      renderContent === renderAnthropicContent
        ? renderAnthropicContent(msg.content)
        : renderContent(msg);
    return [
      `<message index="${i + 1}" role="${role}">`,
      "",
      inner,
      "",
      "</message>",
    ].join("\n");
  });
  return ["<messages>", "", rendered.join("\n\n"), "", "</messages>"].join(
    "\n"
  );
}
