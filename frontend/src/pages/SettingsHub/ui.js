import React, { useState } from "react";
import { Button, Paper, makeStyles } from "@material-ui/core";

// The pieces every section of Configurações is made of, so all of them look the same: a card with a title and one line that says
// what it is for, the fields in a grid (two columns on a computer, one on a phone) and a save bar that only lights up when
// something changed. Fields that save by themselves (switches, selects) have no bar.
const useStyles = makeStyles((theme) => ({
  card: { borderRadius: 16, padding: theme.spacing(2.25), display: "grid", gap: theme.spacing(1.5), background: theme.palette.cards ? theme.palette.cards.background : undefined, minWidth: 0 },
  title: { fontWeight: 700, fontSize: 15 },
  sub: { fontSize: 13, color: theme.palette.text.secondary, marginTop: 2, lineHeight: 1.5 },
  fields: { display: "grid", gap: theme.spacing(1.75), gridTemplateColumns: "repeat(2, minmax(0, 1fr))", alignItems: "start", [theme.breakpoints.down("xs")]: { gridTemplateColumns: "minmax(0, 1fr)" } },
  bar: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", paddingTop: theme.spacing(0.5) },
  gap: { [theme.breakpoints.down("xs")]: { display: "none" } },
  note: { fontSize: 12.5, color: theme.palette.text.secondary },
  fold: { border: 0, background: "transparent", padding: 0, font: "inherit", fontWeight: 600, fontSize: 14, cursor: "pointer", color: theme.palette.text.primary, display: "flex", gap: 6, alignItems: "center", justifySelf: "start" },
}));

export const SetCard = ({ title, sub, children, right }) => {
  const c = useStyles();
  return (
    <Paper variant="outlined" className={c.card}>
      {(title || right) && (
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: "1 1 240px" }}>
            {title && <div className={c.title}>{title}</div>}
            {sub && <div className={c.sub}>{sub}</div>}
          </div>
          {right}
        </div>
      )}
      {children}
    </Paper>
  );
};

export const Fields = ({ children, style }) => {
  const c = useStyles();
  return <div className={c.fields} style={style}>{children}</div>;
};

// an empty cell that keeps the next field on its own row on a computer (nothing on a phone)
export const Gap = () => <span className={useStyles().gap} aria-hidden="true" />;

// "Salvar" is lit only with a change; "Descartar" brings back what is saved
export const SaveBar = ({ dirty, busy, onSave, onDiscard, label = "Salvar", note, children }) => {
  const c = useStyles();
  return (
    <div className={c.bar}>
      <Button variant="contained" color="primary" disabled={!dirty || busy} onClick={onSave}>{busy ? "Salvando..." : label}</Button>
      {dirty && onDiscard && <Button disabled={busy} onClick={onDiscard}>Descartar</Button>}
      {children}
      {note && <span className={c.note}>{note}</span>}
      {!dirty && !note && <span className={c.note}>Tudo salvo.</span>}
    </div>
  );
};

// what is rarely changed stays folded
export const Fold = ({ label, children, defaultOpen = false }) => {
  const c = useStyles();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <button type="button" className={c.fold} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span aria-hidden="true">{open ? "▾" : "▸"}</span> {label}
      </button>
      {open && children}
    </div>
  );
};
