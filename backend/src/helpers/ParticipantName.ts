// a placeholder name (the number, the internal id, "Contato sem telefone") gives way to the name the person shows on WhatsApp (notifyName)
export const nameOrNotify = (c: { name?: string; number?: string; lid?: string }, notify?: string | null): string => {
  const name = String(c.name || "").trim();
  const placeholder = !name || name === "Contato sem telefone" || name === c.number || name === c.lid || /^\+?[\d\s().-]{8,}$/.test(name);
  const shown = String(notify || "").replace(/\s+/g, " ").trim().slice(0, 120);
  return placeholder && shown && !/^\+?[\d\s().-]+$/.test(shown) ? shown : name || shown || "Participante";
};
