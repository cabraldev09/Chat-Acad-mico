// The people of a contact card sent to the official API (message type "contacts"): the name and each WhatsApp number of the card.
export interface CardPerson { name: string; number: string }
export const peopleOfCloudContacts = (contacts: any): CardPerson[] =>
  (Array.isArray(contacts) ? contacts : []).flatMap((c: any) => {
    const name = String(c?.name?.formatted_name || [c?.name?.first_name, c?.name?.last_name].filter(Boolean).join(" ") || "").trim();
    return (Array.isArray(c?.phones) ? c.phones : [])
      .map((p: any) => ({ name, number: String(p?.wa_id || p?.phone || "").replace(/\D/g, "") }))
      .filter((p: CardPerson) => p.number.length >= 10);
  });
export const cardText = (people: CardPerson[]): string =>
  people.length ? `Contato compartilhado: ${people.map(p => `${p.name || "sem nome"} (${p.number})`).join(", ")}` : "[contato]";
