interface ContactLike {
  number?: string | null;
  lid?: string | null;
}

// A phone number has 8 to 15 digits. WhatsApp's new internal id ("@lid") looks like a number too (14 or 15 digits)
// but is not one, so the shape alone cannot tell them apart: a conversation is addressed through the internal id
// only when the person has no phone stored, or the "phone" is the id itself.
export const isPhoneNumber = (value?: string | null): boolean => /^\d{8,15}$/.test(String(value || ""));

export const chatIdOf = (contact: ContactLike, isGroup = false): string => {
  const number = String(contact.number || "");
  if (isGroup) return `${number}@g.us`;
  if (contact.lid && (!number || number === contact.lid)) return `${contact.lid}@lid`;
  return `${number}@c.us`;
};
