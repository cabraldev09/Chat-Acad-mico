// The system's own confirmation dialog, in place of the browser's boxes (window.confirm / prompt / alert show the site's address and
// look out of place). One host is mounted with the routes; any code asks through the promise functions below:
//
//   if (!(await confirmDialog({ title: "Excluir o print?", message: "…", confirmText: "Excluir", tone: "danger" }))) return;
//   const reason = await promptDialog({ title: "O que faltou?", label: "Comentário (opcional)" });   // null = cancelled
//   await copyDialog({ title: "Link da ficha", text: link });
//
// Reference: the "Alert Dialog" of 21st.dev (shadcn): an icon in a soft circle, a short title, the message, and the action on the right
// (red when it deletes or turns something off). On a phone the buttons fill the width, the action on top.
import React, { useEffect, useRef, useState } from "react";
import { Button, Dialog, TextField, makeStyles, useMediaQuery, useTheme } from "@material-ui/core";
import { AlertTriangle, HelpCircle, Copy } from "lucide-react";

let push = null;
const queue = [];
const ask = (opts) => new Promise((resolve) => {
  const item = { ...opts, resolve };
  if (push) push(item);
  else queue.push(item);
});

/** Resolves true when confirmed, false when cancelled or closed. */
export const confirmDialog = (opts) => ask({ kind: "confirm", ...(typeof opts === "string" ? { message: opts } : opts) });
/** Resolves the typed text ("" when left empty), or null when cancelled. */
export const promptDialog = (opts) => ask({ kind: "prompt", ...opts });
/** Shows a text with a "Copiar" button (for when the clipboard is not available). */
export const copyDialog = (opts) => ask({ kind: "copy", ...opts });
/** A message with only "Entendi". */
export const noticeDialog = (opts) => ask({ kind: "notice", ...(typeof opts === "string" ? { message: opts } : opts) });

const useStyles = makeStyles((theme) => {
  const dark = theme.palette.type === "dark";
  return {
    paper: { borderRadius: 16, width: "100%", maxWidth: 440, margin: theme.spacing(2), backgroundImage: "none" },
    body: { display: "flex", gap: 14, padding: theme.spacing(3, 3, 1.5), [theme.breakpoints.down("xs")]: { flexDirection: "column", alignItems: "center", textAlign: "center", padding: theme.spacing(3, 2.5, 1.5) } },
    icon: { flex: "0 0 auto", width: 44, height: 44, borderRadius: "50%", display: "grid", placeItems: "center" },
    danger: { background: dark ? "rgba(239,68,68,.16)" : "#fee2e2", color: dark ? "#fca5a5" : "#dc2626" },
    info: { background: dark ? "rgba(59,130,246,.16)" : "#dbeafe", color: dark ? "#93c5fd" : "#1d4ed8" },
    text: { minWidth: 0, flex: 1 },
    title: { margin: 0, fontSize: 17, fontWeight: 700, lineHeight: 1.3, color: theme.palette.text.primary },
    message: { margin: "6px 0 0", fontSize: 14, lineHeight: 1.5, color: theme.palette.text.secondary, whiteSpace: "pre-line", overflowWrap: "anywhere" },
    field: { marginTop: 12 },
    actions: {
      display: "flex", justifyContent: "flex-end", gap: 8, padding: theme.spacing(1.5, 3, 3),
      [theme.breakpoints.down("xs")]: { flexDirection: "column-reverse", padding: theme.spacing(1.5, 2.5, 2.5) },
    },
    btn: { minHeight: 40, borderRadius: 10, textTransform: "none", fontWeight: 600, padding: "6px 18px", [theme.breakpoints.down("xs")]: { width: "100%", minHeight: 44 } },
    red: { background: "#dc2626", color: "#fff", "&:hover": { background: "#b91c1c" } },
  };
});

const ConfirmHost = () => {
  const classes = useStyles();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("xs"));
  const [items, setItems] = useState([]);
  const [text, setText] = useState("");
  const inputRef = useRef(null);
  const current = items[0] || null;

  useEffect(() => {
    push = (item) => setItems((list) => [...list, item]);
    if (queue.length) setItems((list) => [...list, ...queue.splice(0)]);
    return () => { push = null; };
  }, []);
  useEffect(() => { if (current) setText(current.defaultValue || current.text || ""); }, [current]);

  if (!current) return null;
  const close = (value) => {
    current.resolve(value);
    setItems((list) => list.slice(1));
  };
  const cancelValue = current.kind === "prompt" ? null : false;
  const danger = current.tone === "danger";
  const needsText = current.kind === "prompt" && current.required && !String(text).trim();
  const accept = async () => {
    if (current.kind === "prompt") return close(String(text));
    if (current.kind === "copy") {
      try { await navigator.clipboard.writeText(current.text); } catch (e) {
        if (inputRef.current) { inputRef.current.select(); try { document.execCommand("copy"); } catch (er) { /* the text stays selected */ } }
      }
      return close(true);
    }
    return close(true);
  };
  const confirmText = current.confirmText || (current.kind === "copy" ? "Copiar" : current.kind === "notice" ? "Entendi" : "Confirmar");
  const Icon = current.kind === "copy" ? Copy : danger ? AlertTriangle : HelpCircle;

  return (
    <Dialog open onClose={() => close(cancelValue)} classes={{ paper: classes.paper }} aria-labelledby="sys-dialog-title" aria-describedby="sys-dialog-message">
      <div className={classes.body}>
        <span className={`${classes.icon} ${danger ? classes.danger : classes.info}`} aria-hidden="true"><Icon size={21} /></span>
        <div className={classes.text}>
          <h2 id="sys-dialog-title" className={classes.title}>{current.title || "Confirmar"}</h2>
          {current.message && <p id="sys-dialog-message" className={classes.message}>{current.message}</p>}
          {(current.kind === "prompt" || current.kind === "copy") && (
            <TextField
              className={classes.field} fullWidth variant="outlined" size="small" autoFocus={!phone}
              label={current.label || (current.kind === "copy" ? "Link" : "Resposta")}
              value={text} inputRef={inputRef}
              multiline={!!current.multiline} rows={current.multiline ? 3 : undefined}
              InputProps={{ readOnly: current.kind === "copy" }}
              onFocus={current.kind === "copy" ? (e) => e.target.select() : undefined}
              onChange={(e) => { const v = e.target.value; setText(v); }}
              onKeyDown={(e) => { if (e.key === "Enter" && !current.multiline && !needsText) { e.preventDefault(); accept(); } }}
            />
          )}
        </div>
      </div>
      <div className={classes.actions}>
        {current.kind !== "notice" && (
          <Button className={classes.btn} variant="outlined" onClick={() => close(cancelValue)}>{current.cancelText || (current.kind === "copy" ? "Fechar" : "Cancelar")}</Button>
        )}
        <Button className={`${classes.btn} ${danger ? classes.red : ""}`} variant="contained" color={danger ? "default" : "primary"} disableElevation
          disabled={needsText} autoFocus={current.kind !== "prompt"} onClick={accept}>
          {confirmText}
        </Button>
      </div>
    </Dialog>
  );
};

export default ConfirmHost;
