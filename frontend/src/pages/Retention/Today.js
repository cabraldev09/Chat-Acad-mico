import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography, makeStyles } from "@material-ui/core";
import { CheckCheck, MessageCircle, StickyNote, Send, User } from "lucide-react";

import api from "../../services/api";
import toastError from "../../errors/toastError";

const RED = "#dc2626";
const AMBER = "#d97706";
const BLUE = "#0693e3";

const useStyles = makeStyles((theme) => {
  const line = theme.palette.type === "dark" ? "rgba(255,255,255,.09)" : "#dbe5f1";
  const soft = theme.palette.type === "dark" ? "rgba(255,255,255,.04)" : "#f4f7fb";
  return {
    sheet: { background: theme.palette.cards.background, border: `1px solid ${theme.palette.type === "dark" ? "rgba(255,255,255,.09)" : "#c9d6e8"}`, borderRadius: 18, padding: theme.spacing(2.25), boxShadow: "0 1px 2px rgba(11,66,121,.07)" },
    top: { display: "flex", alignItems: "flex-end", gap: theme.spacing(3), flexWrap: "wrap", marginBottom: theme.spacing(2) },
    total: { fontSize: 44, fontWeight: 750, letterSpacing: "-0.04em", lineHeight: 1, fontVariantNumeric: "tabular-nums" },
    sub: { fontSize: 13, color: theme.palette.text.secondary },
    mini: { display: "flex", gap: theme.spacing(2.5), flexWrap: "wrap", marginLeft: "auto" },
    miniItem: { fontSize: 12.5, color: theme.palette.text.secondary, "& b": { display: "block", fontSize: 20, color: theme.palette.text.primary, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" } },
    chips: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: theme.spacing(1.5) },
    chip: {
      border: `1px solid ${line}`, background: "transparent", color: theme.palette.text.secondary, borderRadius: 999, padding: "5px 13px", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600,
      "&:hover": { background: soft }, "&[aria-pressed=true]": { background: BLUE, borderColor: BLUE, color: "#fff" },
    },
    row: {
      display: "grid", gridTemplateColumns: "4px 40px minmax(0, 1fr) auto", gap: theme.spacing(1.5), alignItems: "center", padding: theme.spacing(1.25, 0), borderTop: `1px solid ${line}`,
      animation: "page-in .3s var(--ease-out) both", [theme.breakpoints.down("sm")]: { gridTemplateColumns: "4px 36px minmax(0, 1fr)" },
    },
    bar: { alignSelf: "stretch", borderRadius: 4 },
    avatar: { width: 40, height: 40, borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 700, background: soft, border: `1px solid ${line}`, color: theme.palette.text.secondary },
    name: { fontWeight: 650, fontSize: 15 },
    reasons: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 },
    reason: { fontSize: 12, fontWeight: 650, padding: "2px 9px", borderRadius: 999 },
    meta: { fontSize: 12.5, color: theme.palette.text.secondary, marginTop: 3 },
    actions: { display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", [theme.breakpoints.down("sm")]: { gridColumn: "3", justifyContent: "flex-start" } },
    empty: { textAlign: "center", padding: theme.spacing(5, 2), color: theme.palette.text.secondary },
    quote: { fontSize: 13, fontStyle: "italic", marginTop: 4, color: theme.palette.text.secondary },
  };
});

const REASON_STYLE = {
  detractor: { background: "rgba(220,38,38,.13)", color: RED },
  risk: { background: "rgba(234,88,12,.14)", color: "#c2410c" },
  rematricula: { background: "rgba(6,147,227,.14)", color: "#0369a1" },
};
const LEVEL_COLOR = { high: RED, medium: AMBER, low: "#94a3b8" };
const FILTERS = [["all", "Todos"], ["detractor", "Insatisfeitos"], ["risk", "Sem notícias"], ["rematricula", "Rematrícula"]];
const ago = (iso) => {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? "hoje" : d === 1 ? "ontem" : `há ${d} dias`;
};

// who to contact today: one line per student with every reason, the most urgent first, and one click for what comes next
const Today = ({ onChanged }) => {
  const classes = useStyles();
  const history = useHistory();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState("all");
  const [template, setTemplate] = useState("");
  const [writing, setWriting] = useState(null);
  const [contact, setContact] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.get("/retention/today").then(({ data: d }) => { setData(d); setFailed(false); }).catch((err) => { setFailed(true); toastError(err); }), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get("/retention/config").then(({ data: c }) => setTemplate((c && c.risk && c.risk.message) || "")).catch(() => undefined); }, []);

  const items = useMemo(() => (data ? data.items.filter((i) => filter === "all" || i.reasons.some((r) => r.kind === filter)) : []), [data, filter]);
  const count = (kind) => (data ? data.items.filter((i) => i.reasons.some((r) => r.kind === kind)).length : 0);
  const urgent = data ? data.items.filter((i) => i.level === "high").length : 0;

  const startWriting = (i) => setWriting({ item: i, text: String(template || "").replace(/\{\{\s*nome\s*\}\}/gi, String(i.name || "").split(" ")[0]) });
  const send = async () => {
    setBusy(true);
    try {
      await api.post(`/retention/risk/${writing.item.leadId}/message`, { message: writing.text });
      toast.success(`Mensagem enviada para ${writing.item.name}.`);
      const id = writing.item.leadId;
      setWriting(null);
      // the message is a contact too: the student leaves the list for a few days
      await api.post(`/retention/contact/${id}`, { outcome: "agendado", note: "Mensagem enviada pelo WhatsApp", snoozeDays: 3 }).catch(() => undefined);
      load(); onChanged && onChanged();
    } catch (err) { toastError(err); }
    setBusy(false);
  };
  const saveContact = async () => {
    setBusy(true);
    try {
      await api.post(`/retention/contact/${contact.item.leadId}`, { outcome: contact.outcome, note: contact.note, snoozeDays: contact.snoozeDays });
      toast.success("Contato registrado. O aluno sai da lista pelos dias escolhidos.");
      setContact(null);
      load(); onChanged && onChanged();
    } catch (err) { toastError(err); }
    setBusy(false);
  };

  if (!data) return <Typography className={classes.empty}>{failed ? "Não foi possível carregar a lista. Atualize a página." : <CircularProgress size={22} />}</Typography>;
  return (
    <div className={classes.sheet}>
      <div className={classes.top}>
        <div>
          <div className={classes.total}>{data.total}</div>
          <div className={classes.sub}>{data.total === 1 ? "aluno para contatar hoje" : "alunos para contatar hoje"}</div>
        </div>
        <div className={classes.mini}>
          <div className={classes.miniItem}><b style={{ color: urgent ? RED : undefined }}>{urgent}</b>urgentes</div>
          <div className={classes.miniItem}><b>{count("detractor")}</b>insatisfeitos</div>
          <div className={classes.miniItem}><b>{count("risk")}</b>sem notícias</div>
          <div className={classes.miniItem}><b>{count("rematricula")}</b>sem renovar</div>
        </div>
      </div>
      <div className={classes.chips}>
        {FILTERS.map(([k, label]) => (<button key={k} type="button" className={classes.chip} aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>))}
      </div>

      {items.length === 0 && (
        <div className={classes.empty}>
          <CheckCheck size={30} style={{ color: "#16a34a" }} />
          <Typography style={{ fontWeight: 650, marginTop: 6 }}>{data.total === 0 ? "Tudo em dia" : "Nenhum aluno neste filtro"}</Typography>
          <Typography className={classes.sub}>{data.total === 0 ? "Ninguém precisa de contato agora. Quem aparecer em risco ou der nota baixa entra aqui e você é avisado." : "Troque o filtro para ver os outros."}</Typography>
        </div>
      )}

      {items.map((i) => (
        <div key={i.leadId} className={classes.row}>
          <span className={classes.bar} style={{ background: LEVEL_COLOR[i.level] }} aria-hidden="true" />
          <span className={classes.avatar}>{String(i.name || "?").charAt(0).toUpperCase()}</span>
          <div style={{ minWidth: 0 }}>
            <div className={classes.name}>{i.name}</div>
            <div className={classes.reasons}>
              {i.reasons.map((r) => (<span key={r.kind} className={classes.reason} style={REASON_STYLE[r.kind]}>{r.text}</span>))}
            </div>
            {i.comment && <div className={classes.quote}>“{i.comment}”</div>}
            <div className={classes.meta}>
              {[i.polo, i.tutor ? `tutor: ${i.tutor}` : "sem tutor"].filter(Boolean).join(" · ")}
              {i.last ? ` · último contato: ${i.last.label.toLowerCase()} ${ago(i.last.at)}${i.last.by ? ` (${i.last.by.split(" ")[0]})` : ""}` : ""}
            </div>
          </div>
          <div className={classes.actions}>
            {i.ticketId && <Button size="small" variant="outlined" startIcon={<MessageCircle size={14} />} onClick={() => history.push(`/tickets/${i.ticketId}`)}>Conversa</Button>}
            <Button size="small" variant="outlined" startIcon={<Send size={14} />} onClick={() => startWriting(i)}>Mensagem</Button>
            <Button size="small" variant="contained" color="primary" disableElevation startIcon={<StickyNote size={14} />} onClick={() => setContact({ item: i, outcome: "respondeu", note: "", snoozeDays: 3 })}>Registrar contato</Button>
            <Button size="small" startIcon={<User size={14} />} onClick={() => history.push(`/crm?lead=${i.leadId}`)}>Ficha</Button>
          </div>
        </div>
      ))}

      <Dialog open={!!writing} onClose={busy ? undefined : () => setWriting(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Mensagem para {writing ? writing.item.name : ""}</DialogTitle>
        <DialogContent>
          <Typography className={classes.sub} style={{ marginBottom: 8 }}>Sai agora pelo WhatsApp da relação com o aluno. Edite como quiser.</Typography>
          <TextField fullWidth multiline rows={5} variant="outlined" value={writing ? writing.text : ""} onChange={(e) => setWriting({ ...writing, text: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWriting(null)} disabled={busy}>Cancelar</Button>
          <Button variant="contained" color="primary" disableElevation onClick={send} disabled={busy || !writing || !writing.text.trim()}>{busy ? <CircularProgress size={18} /> : "Enviar"}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!contact} onClose={busy ? undefined : () => setContact(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Registrar contato com {contact ? contact.item.name : ""}</DialogTitle>
        <DialogContent>
          <TextField select fullWidth variant="outlined" margin="dense" label="O que aconteceu" value={contact ? contact.outcome : ""} onChange={(e) => setContact({ ...contact, outcome: e.target.value, snoozeDays: e.target.value === "sem_resposta" ? 2 : e.target.value === "resolvido" ? 7 : 3 })}>
            {Object.entries(data.outcomes || {}).map(([k, label]) => (<MenuItem key={k} value={k}>{label}</MenuItem>))}
          </TextField>
          <TextField fullWidth multiline rows={3} variant="outlined" margin="dense" label="Anotação (opcional)" value={contact ? contact.note : ""} onChange={(e) => setContact({ ...contact, note: e.target.value })} />
          <TextField select fullWidth variant="outlined" margin="dense" label="Voltar para a lista em" value={contact ? contact.snoozeDays : 3} onChange={(e) => setContact({ ...contact, snoozeDays: Number(e.target.value) })}
            helperText="Até lá o aluno sai da lista de hoje. Se voltar a escrever, o risco some sozinho.">
            {[[1, "1 dia"], [2, "2 dias"], [3, "3 dias"], [7, "1 semana"], [15, "15 dias"], [30, "30 dias"]].map(([n, l]) => (<MenuItem key={n} value={n}>{l}</MenuItem>))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setContact(null)} disabled={busy}>Cancelar</Button>
          <Button variant="contained" color="primary" disableElevation onClick={saveContact} disabled={busy}>{busy ? <CircularProgress size={18} /> : "Registrar"}</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default Today;
