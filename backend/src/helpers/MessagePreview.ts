// What the conversation list shows for a message: never a raw contact card.
export const vcardName = (body: string): string => {
  const fn = /(?:^|\n)FN[^:\n]*:([^\n\r]+)/i.exec(body || "");
  return fn ? fn[1].trim() : "";
};

export const isVcard = (body?: string | null): boolean => /^\s*BEGIN:VCARD/i.test(body || "");

export const previewOf = (body: string, type?: string): string => {
  if (type === "vcard" || isVcard(body)) {
    const name = vcardName(body);
    return name ? `👤 ${name}` : "👤 Contato";
  }
  return body;
};
