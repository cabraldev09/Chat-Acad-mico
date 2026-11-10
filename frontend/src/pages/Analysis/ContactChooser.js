import React, { useState } from "react";
import { User, X } from "lucide-react";

import NewTicketModal from "../../components/NewTicketModal";
import { Button, cn } from "./orig";

// "Send to a contact" for the analysis screens: the same list as "Enviar contato" in the chat (recent conversations and
// the A-Z list, with photo, name and number); once one is chosen, a card with the photo, the name and the number stays
// in the dialog, with a way to change it.

const phoneLabel = (c) => {
  const n = String((c && c.number) || "");
  if (n.includes("_")) return n.replace(/^[a-z]+_/, "");
  return n ? `+${n}` : "";
};

export const ContactAvatar = ({ contact, className }) => {
  const [broken, setBroken] = useState(false);
  const src = contact && contact.profilePicUrl;
  const initial = String((contact && contact.name) || "?").trim().charAt(0).toUpperCase() || "?";
  return src && !broken ? (
    <img src={src} alt="" onError={() => setBroken(true)} className={cn("size-11 shrink-0 rounded-full bg-slate-200 object-cover", className)} />
  ) : (
    <span aria-hidden="true" className={cn("grid size-11 shrink-0 place-items-center rounded-full bg-slate-300 text-base font-semibold text-white", className)}>{initial}</span>
  );
};

export const ContactChooser = ({ contact, onPick, autoOpen = false, title = "Escolher contato" }) => {
  const [open, setOpen] = useState(autoOpen && !contact);
  return (
    <>
      {contact ? (
        <div className="flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50/80 p-3">
          <ContactAvatar contact={contact} />
          <span className="min-w-0 flex-1">
            <strong className="block truncate text-sm text-slate-900">{contact.name}</strong>
            <span className="block truncate text-xs text-slate-500">{phoneLabel(contact)}</span>
          </span>
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Trocar</Button>
          <button type="button" aria-label="Remover o contato" onClick={() => onPick(null)} className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-white"><X className="size-4" /></button>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-3 text-left text-sm text-slate-600 hover:border-brand-cyan hover:bg-white">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-slate-200 text-slate-500"><User className="size-5" /></span>
          <span><strong className="block text-slate-800">Escolher o contato</strong><span className="text-xs">Fotos, nomes e números, como em Enviar contato.</span></span>
        </button>
      )}
      <NewTicketModal modalOpen={open} title={title} hideNew onClose={() => setOpen(false)} onPick={(c) => onPick(c)} />
    </>
  );
};
