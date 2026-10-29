// WhatsApp has its own marks: *bold*, _italic_, ~strike~. The Markdown a model likes to write (**bold**, # titles, [text](link), tables, ``` fences) would
// reach the person as stray symbols, so every answer goes through this before it is sent, whatever the model wrote.
export const toWhatsapp = (input: string): string => {
  let t = String(input || "").replace(/\r/g, "");
  t = t.replace(/^```[a-zA-Z]*[ \t]*$/gm, "");
  t = t.replace(/^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm, ""); // horizontal rules
  // tables: the separator row goes away and each row becomes a line
  t = t.replace(/^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*$/gm, "");
  t = t.replace(/^[ \t]*\|(.+)\|[ \t]*$/gm, (_m, row: string) => row.split("|").map(c => c.trim()).filter(Boolean).join(" - "));
  t = t.replace(/^ {0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/gm, "*$1*"); // titles become a bold line
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, "$2");
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_m, label: string, url: string) => (label.trim() === url ? url : `${label.trim()}: ${url}`));
  t = t.replace(/(\*{3}|_{3})([^*_\n]+?)\1/g, "*$2*").replace(/\*\*([^*\n]+?)\*\*/g, "*$1*").replace(/__([^_\n]+?)__/g, "*$1*");
  t = t.replace(/`([^`\n]+)`/g, "$1");
  t = t.replace(/^[ \t]*[*•][ \t]+(?=\S)/gm, "- "); // "* item" would read as an unclosed bold
  t = t.replace(/\\([*_~`#])/g, "$1");
  t = t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  return t.trim();
};

// Instagram and Messenger show the text as it is: the *bold* and _italic_ marks of WhatsApp would appear as stray symbols
export const forChannel = (text: string, channel?: string | null): string => {
  const clean = toWhatsapp(text);
  return channel === "instagram" || channel === "messenger" ? clean.replace(/(^|[\s(])[*_]{1,2}([^*_\n]+?)[*_]{1,2}(?=[\s).,!?:;]|$)/g, "$1$2") : clean;
};
