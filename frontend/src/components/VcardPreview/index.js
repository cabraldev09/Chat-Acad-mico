import React, { useContext, useMemo, useState } from "react";
import { useHistory } from "react-router-dom";
import toastError from "../../errors/toastError";
import api from "../../services/api";

import clsx from "clsx";
import { makeStyles, useTheme } from "@material-ui/core/styles";
import { ChevronRight } from "lucide-react";
import { wa, getChatAccent } from "../chat/chatTheme";
import { initialsOf, colorOf } from "../../utils/avatar";

import { AuthContext } from "../../context/Auth/AuthContext";


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

const useStyles = makeStyles((theme) => {
  const c = wa(theme);
  const dark = theme.palette.type === "dark";
  return {
    root: { width: 300, maxWidth: "100%", display: "flex", flexDirection: "column" },
    head: {
      display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "6px 2px 4px", border: 0, background: "transparent", font: "inherit",
      color: "inherit", textAlign: "left", cursor: "pointer", borderRadius: 6,
      "&:hover": { background: dark ? "rgba(255,255,255,.04)" : "rgba(11,20,26,.04)" }, "&[disabled]": { cursor: "default", background: "transparent" },
      "&:focus-visible": { outline: `2px solid ${c.accent}` },
    },
    avatar: {
      flex: "none", width: 46, height: 46, borderRadius: "50%", display: "grid", placeItems: "center", overflow: "hidden",
      fontSize: 16, fontWeight: 700, color: "#fff",
    },
    info: { flex: 1, minWidth: 0 },
    name: { fontSize: 15.5, lineHeight: "20px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    phone: { fontSize: 12.5, lineHeight: "16px", color: c.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    chev: { flex: "none", color: c.textSecondary },
    metaRow: { display: "flex", justifyContent: "flex-end", minHeight: 15, margin: "0 0 4px", "& > *": { float: "none !important", margin: "0 !important" } },
    // the line and the button take the whole width of the bubble, as on WhatsApp
    action: {
      display: "block", width: "calc(100% + 16px)", margin: "0 -7px -8px -9px", padding: "10px 8px", border: 0, borderTop: `1px solid ${dark ? "rgba(255,255,255,.1)" : "rgba(11,20,26,.1)"}`,
      background: "transparent", font: "inherit", fontSize: 14.5, fontWeight: 600, textAlign: "center", cursor: "pointer", borderRadius: "0 0 8px 8px",
      "&:hover": { background: dark ? "rgba(255,255,255,.04)" : "rgba(11,20,26,.04)" },
      "&[disabled]": { opacity: 0.55, cursor: "default", background: "transparent" },
    },
    between: { borderTop: `1px solid ${dark ? "rgba(255,255,255,.08)" : "rgba(11,20,26,.08)"}`, margin: "4px 0" },
    // inside a list of several contacts the button does not reach the bottom edge
    actionInList: { margin: "0 -7px 0 -9px", borderRadius: 0 },
  };
});

const actionColor = (theme, fromMe) => {
  const c = wa(theme);
  // the blue bubble of the desktop app: the button is white like the text
  if (fromMe && getChatAccent() === "blue") return c.bubbleOutText;
  return c.chipOnText;
};

// A contact shared in the conversation, as on WhatsApp: the picture (or the initials), the name and a ">" on top, the time, a line
// and "Conversar" across the bubble. Nothing is saved just because the card is on the screen; "Conversar" (or a click on the
// name) finds the person (or registers them) and opens the conversation.
const OneCard = ({ vcard, contact, numbers, meta, fromMe, inList }) => {
  const classes = useStyles();
  const theme = useTheme();
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
    if (!card.number || busy) return;
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

  const label = card.name || phoneText(card.number) || "Contato";
  return (
    <div className={classes.root}>
      <button type="button" className={classes.head} onClick={handleNewChat} disabled={!card.number || busy} title={card.number ? `Conversar com ${label}` : undefined}>
        <span className={classes.avatar} style={{ background: colorOf(card.number || label) }} aria-hidden="true">{initialsOf(label)}</span>
        <span className={classes.info}>
          <span className={classes.name} style={{ display: "block" }}>{label}</span>
          <span className={classes.phone} style={{ display: "block" }}>{card.number ? phoneText(card.number) : "Contato sem telefone no cartão"}</span>
        </span>
        <ChevronRight size={20} className={classes.chev} aria-hidden="true" />
      </button>
      {meta && <div className={classes.metaRow}>{meta}</div>}
      <button type="button" className={clsx(classes.action, inList && classes.actionInList)} style={{ color: actionColor(theme, fromMe) }} onClick={handleNewChat} disabled={!card.number || busy}>
        Conversar
      </button>
    </div>
  );
};

// one message can carry several contacts: "N contatos" on top, then each one with its name and "Conversar"
const VcardPreview = ({ vcard, contact, numbers, meta, fromMe }) => {
  const classes = useStyles();
  const cards = useMemo(() => (vcard && (String(vcard).match(/BEGIN:VCARD/gi) || []).length > 1 ? parseVcards(vcard) : null), [vcard]);
  if (!cards) return <OneCard vcard={vcard} contact={contact} numbers={numbers} meta={meta} fromMe={fromMe} />;
  return (
    <div className={classes.root}>
      <div className={classes.phone} style={{ padding: "2px 2px 4px", fontWeight: 600 }}>{cards.length} contatos</div>
      {cards.map((c, i) => (
        <OneCard
          key={`${c.number}-${i}`}
          vcard={`BEGIN:VCARD\nFN:${c.name}\nTEL;waid=${c.number}:${c.number}\nEND:VCARD`}
          fromMe={fromMe}
          inList={i < cards.length - 1}
          meta={i === cards.length - 1 ? meta : null}
        />
      ))}
    </div>
  );
};

export default VcardPreview;
