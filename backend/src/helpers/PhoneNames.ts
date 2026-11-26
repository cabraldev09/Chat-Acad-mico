// The names a WhatsApp number knows (the address book of the phone and the profile name each person chose) completing the contacts of
// the system that are still only a number. Pure, so it is tested without WhatsApp.

export interface PhoneName {
  number?: string;
  lid?: string;
  // the name typed in the phone's address book
  name?: string;
  // the name the person chose on WhatsApp (shown with "~" for who did not save the number)
  pushname?: string;
  // the name of a verified business account
  verifiedName?: string;
}

export interface KnownContact {
  id: number;
  name?: string | null;
  number?: string | null;
  lid?: string | null;
}

// A name that is just the number, the internal id or empty is a placeholder; anything else was typed by someone and is kept.
export const isPlaceholderName = (c: KnownContact): boolean => {
  const name = String(c.name || "").trim();
  if (!name || name === "Contato") return true;
  if (name === c.number || name === c.lid) return true;
  return /^\+?[\d\s().-]{8,}$/.test(name);
};

const clean = (value?: string): string => String(value || "").replace(/\s+/g, " ").trim().slice(0, 120);

// The best name the phone has for one person: the address book first (what the owner of the number calls them), then the profile name,
// then the business name. A "name" that is only digits is no name.
export const bestPhoneName = (p: PhoneName): string => {
  for (const candidate of [p.name, p.pushname, p.verifiedName]) {
    const name = clean(candidate);
    if (name && !/^\+?[\d\s().-]+$/.test(name)) return name;
  }
  return "";
};

// Which known contacts get a name now: only the ones that are still a placeholder, and only with a real name from the phone.
export const namesToComplete = (known: KnownContact[], phone: PhoneName[]): Array<{ id: number; name: string }> => {
  const byNumber = new Map<string, PhoneName>();
  const byLid = new Map<string, PhoneName>();
  phone.forEach(p => {
    const number = String(p.number || "").replace(/\D/g, "");
    if (number && !byNumber.has(number)) byNumber.set(number, p);
    if (p.lid && !byLid.has(p.lid)) byLid.set(p.lid, p);
  });
  const out: Array<{ id: number; name: string }> = [];
  known.forEach(c => {
    if (!isPlaceholderName(c)) return;
    const found = (c.number && byNumber.get(String(c.number).replace(/\D/g, ""))) || (c.lid && byLid.get(c.lid)) || undefined;
    const name = found ? bestPhoneName(found) : "";
    if (name && name !== c.name) out.push({ id: c.id, name });
  });
  return out;
};

// What a connection does with the address book of its phone. The company's numbers (no owner) and the administrators' bring the whole
// address book as contacts; the own number of a consultant or tutor is personal: nobody new is created from it, only the people who
// already talk to that number get their name.
export const agendaModeOf = (ownerRole: string | null | undefined): "import" | "complete" =>
  !ownerRole || ownerRole === "admin" ? "import" : "complete";
