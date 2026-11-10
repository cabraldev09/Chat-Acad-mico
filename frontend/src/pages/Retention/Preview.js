import React from "react";
import { makeStyles } from "@material-ui/core";

// How a message looks on the student's WhatsApp before it goes: the text with a first name, and the buttons when there are any.
const useStyles = makeStyles((theme) => {
  const dark = theme.palette.type === "dark";
  return {
    phone: { background: dark ? "#0b141a" : "#efeae2", borderRadius: 16, padding: theme.spacing(1.75), display: "grid", gap: 6, maxWidth: 420 },
    to: { fontSize: 11.5, color: theme.palette.text.secondary, marginBottom: 2 },
    bubble: {
      background: dark ? "#202c33" : "#ffffff", color: theme.palette.text.primary, padding: "8px 11px", borderRadius: "10px 10px 10px 2px", fontSize: 14, lineHeight: 1.45,
      whiteSpace: "pre-wrap", wordBreak: "break-word", boxShadow: "0 1px 0.5px rgba(11,20,26,.18)",
    },
    buttons: { display: "grid", gap: 4, marginTop: 2 },
    btn: { textAlign: "center", background: dark ? "#202c33" : "#ffffff", color: "#0693E3", fontWeight: 600, fontSize: 13.5, padding: "8px 10px", borderRadius: 8, boxShadow: "0 1px 0.5px rgba(11,20,26,.18)" },
    note: { fontSize: 11.5, color: theme.palette.text.secondary, marginTop: 4 },
  };
});

// {{nome}} is the first name; {{periodo}} the term of the re-enrollment
export const fillSample = (text, name = "Maria Souza", extra = {}) =>
  Object.entries({ nome: String(name).trim().split(/\s+/)[0] || "", ...extra }).reduce((t, [k, v]) => t.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), v), String(text || ""));

const WhatsPreview = ({ text, name, buttons = [], extra, note, label }) => {
  const classes = useStyles();
  return (
    <div className={classes.phone} aria-label={label || "Prévia da mensagem no WhatsApp"}>
      <div className={classes.to}>Para: {name || "Maria Souza"}</div>
      <div className={classes.bubble}>{fillSample(text, name || "Maria Souza", extra) || <i style={{ opacity: 0.6 }}>Escreva a mensagem para ver a prévia.</i>}</div>
      {buttons.length > 0 && (
        <div className={classes.buttons}>{buttons.map((b) => <div key={b} className={classes.btn}>{b}</div>)}</div>
      )}
      {note && <div className={classes.note}>{note}</div>}
    </div>
  );
};

export default WhatsPreview;
