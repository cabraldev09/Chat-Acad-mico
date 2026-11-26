import React, { useContext, useMemo, useState } from "react";
import { useHistory } from "react-router-dom";
import toastError from "../../errors/toastError";
import api from "../../services/api";

import Avatar from "@material-ui/core/Avatar";
import Typography from "@material-ui/core/Typography";
import Grid from "@material-ui/core/Grid";

import { AuthContext } from "../../context/Auth/AuthContext";

import { Button, Divider } from "@material-ui/core";

// A Brazilian number written without the country code (DDD + number, 10 or 11 digits) gets 55; anything else stays as written
const withCountry = (digits) => (/^\d{10,11}$/.test(digits) ? `55${digits}` : digits);

// The name (FN) and the number of a shared contact card, read in the browser. The number WhatsApp gives in "waid=" wins; else the
// first TEL, with or without "+", spaces or dashes.
export const parseVcard = (body) => {
  const lines = String(body || "").split(/\r?\n/);
  let name = "";
  let number = "";
  let waid = "";
  lines.forEach((line) => {
    const idx = line.indexOf(":");
    if (idx === -1) return;
    const key = line.slice(0, idx).toUpperCase();
    const value = line.slice(idx + 1).trim();
    if (!name && (key === "FN" || key.startsWith("FN;"))) name = value;
    if (key === "TEL" || key.startsWith("TEL;")) {
      const w = /WAID=(\d+)/i.exec(line.slice(0, idx));
      if (w && !waid) waid = w[1];
      const digits = value.replace(/\D/g, "");
      if (digits && !number) number = withCountry(digits);
    }
  });
  if (!name) {
    const n = lines.find((l) => /^N[:;]/i.test(l));
    if (n) name = n.slice(n.indexOf(":") + 1).split(";").filter(Boolean).reverse().join(" ").trim();
  }
  return { name, number: waid || number };
};

// every card of a message (WhatsApp sends several contacts in one message, each between BEGIN:VCARD and END:VCARD)
export const parseVcards = (body) => {
  const text = String(body || "");
  const parts = text.split(/END:VCARD/i).map((p) => p.trim()).filter((p) => /BEGIN:VCARD|FN[:;]|TEL[:;]/i.test(p));
  return (parts.length ? parts : [text]).map(parseVcard).filter((c) => c.name || c.number);
};

// +55 69 99366-7971, as people read a phone
const phoneText = (digits) => {
  const d = String(digits || "").replace(/\D/g, "");
  if (/^55\d{10,11}$/.test(d)) {
    const rest = d.slice(4);
    return `+55 ${d.slice(2, 4)} ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
  }
  return d ? `+${d}` : "";
};

// A contact shared in the conversation: it shows the name and the phone of the card itself. Nothing is saved just because the card
// is on the screen; "Conversar" finds the person (or registers them) and opens the conversation.
const OneCard = ({ vcard, contact, numbers }) => {
  const history = useHistory();
  const { user } = useContext(AuthContext);
  const [busy, setBusy] = useState(false);

  const card = useMemo(() => {
    if (vcard) return parseVcard(vcard);
    // older callers pass the name and the number already read
    const digits = typeof numbers === "string" ? withCountry(numbers.replace(/\D/g, "")) : "";
    return { name: String(contact || "").trim(), number: digits };
  }, [vcard, contact, numbers]);

  const handleNewChat = async () => {
    if (!card.number) return;
    setBusy(true);
    try {
      const { data: found } = await api.post("/contact", { name: card.name || phoneText(card.number), number: card.number, email: "" });
      const { data: ticket } = await api.post("/tickets", { contactId: found.id, userId: user.id, status: "open" });
      history.push(`/tickets/${ticket.id}`);
    } catch (err) {
      toastError(err);
    }
    setBusy(false);
  };

  return (
    <div style={{ minWidth: "min(250px, 100%)" }}>
      <Grid container spacing={1}>
        <Grid item xs={2}>
          <Avatar>{(card.name || "?").charAt(0).toUpperCase()}</Avatar>
        </Grid>
        <Grid item xs={9}>
          <Typography style={{ marginTop: 4, marginLeft: 10 }} variant="subtitle1" color="primary">
            {card.name || phoneText(card.number) || "Contato"}
          </Typography>
          <Typography style={{ marginLeft: 10, opacity: 0.75 }} variant="body2">
            {card.number ? phoneText(card.number) : "Contato sem telefone no cartão"}
          </Typography>
        </Grid>
        <Grid item xs={12}>
          <Divider />
          <Button fullWidth color="primary" onClick={handleNewChat} disabled={!card.number || busy}>
            Conversar
          </Button>
        </Grid>
      </Grid>
    </div>
  );
};

// one message can carry several contacts: each one with its name, phone and "Conversar"
const VcardPreview = ({ vcard, contact, numbers }) => {
  const cards = useMemo(() => (vcard && (String(vcard).match(/BEGIN:VCARD/gi) || []).length > 1 ? parseVcards(vcard) : null), [vcard]);
  if (!cards) return <OneCard vcard={vcard} contact={contact} numbers={numbers} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {cards.map((c, i) => (
        <OneCard key={`${c.number}-${i}`} vcard={`BEGIN:VCARD\nFN:${c.name}\nTEL;waid=${c.number}:${c.number}\nEND:VCARD`} />
      ))}
    </div>
  );
};

export default VcardPreview;
