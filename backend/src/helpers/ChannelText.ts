// Instagram and Messenger show the text as it is: the *bold* and _italic_ marks of WhatsApp would appear as stray symbols
export const forChannel = (text: string, channel?: string | null): string =>
  channel === "instagram" || channel === "messenger" ? String(text || "").replace(/(^|[\s(])[*_]{1,2}([^*_\n]+?)[*_]{1,2}(?=[\s).,!?:;]|$)/g, "$1$2") : text;
