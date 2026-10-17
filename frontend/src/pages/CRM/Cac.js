import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, TextField, Typography, makeStyles,
} from "@material-ui/core";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Info, Pencil, Plus, Trash2 } from "lucide-react";

import ConfirmationModal from "../../components/ConfirmationModal";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const brl = (n) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const ymd = (d) => d.toLocaleDateString("en-CA", { timeZone: "America/Porto_Velho" });
const monthKey = (d) => ymd(d).slice(0, 7);
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const monthLabel = (key) => { const [y, m] = key.split("-"); return `${MONTHS[Number(m) - 1]}/${y}`; };
const pct = (a, b) => (b > 0 ? `${((a / b) * 100).toFixed(1).replace(".", ",")}%` : "—");

const RANGES = [["30", "Últimos 30 dias"], ["90", "Últimos 90 dias"], ["180", "Últimos 6 meses"], ["365", "Último ano"]];
const OTHER = "__other";

const useStyles = makeStyles((theme) => {
  const dark = theme.palette.type === "dark";
  const line = dark ? "rgba(255,255,255,.09)" : "#e3e9f1";
  const soft = dark ? "rgba(255,255,255,.05)" : "#f1f4f8";
  return {
    card: { background: theme.palette.cards.background, border: `1px solid ${line}`, borderRadius: 16, padding: theme.spacing(2.25), marginBottom: theme.spacing(2) },
    // inside another card (the panel): no second border, a divider instead
    flat: { borderTop: `1px solid ${line}`, paddingTop: theme.spacing(2), marginTop: theme.spacing(2) },
    hint: { fontSize: 12.5, color: theme.palette.text.secondary },
    title: { fontWeight: 700, fontSize: 14.5, marginBottom: 2 },
    notice: { display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 12, background: dark ? "rgba(6,147,227,.12)" : "rgba(6,147,227,.08)", fontSize: 13, lineHeight: 1.5, marginBottom: theme.spacing(2) },
    kpis: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: theme.spacing(1.25) },
    kpi: { border: `1px solid ${line}`, borderRadius: 14, padding: theme.spacing(1.5, 2), background: theme.palette.cards.background },
    kpiN: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" },
    table: {
      width: "100%", borderCollapse: "collapse", fontSize: 13.5,
      "& th": { textAlign: "right", fontWeight: 600, padding: "8px 10px", color: theme.palette.text.secondary, borderBottom: `1px solid ${line}`, whiteSpace: "nowrap" },
      "& td": { textAlign: "right", padding: "9px 10px", borderBottom: `1px solid ${line}`, fontVariantNumeric: "tabular-nums" },
      "& th:first-child, & td:first-child": { textAlign: "left" },
    },
    row: { display: "flex", gap: theme.spacing(1), flexWrap: "wrap", alignItems: "center" },
    scroll: { overflowX: "auto" },
    channel: { display: "grid", gridTemplateColumns: "minmax(150px, 1.2fr) minmax(120px, 2fr) 110px minmax(120px, 1fr)", gap: 12, alignItems: "center", padding: "10px 0", borderTop: `1px solid ${line}`, "&:first-of-type": { borderTop: 0 }, [theme.breakpoints.down("sm")]: { gridTemplateColumns: "1fr 1fr" } },
    track: { height: 8, borderRadius: 6, background: soft, overflow: "hidden" },
    chip: { display: "inline-block", fontSize: 11.5, fontWeight: 700, padding: "1px 8px", borderRadius: 999 },
    empty: { textAlign: "center", padding: theme.spacing(3, 2), border: `1px dashed ${line}`, borderRadius: 14 },
    entry: { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: `1px solid ${line}`, flexWrap: "wrap", "&:first-of-type": { borderTop: 0 } },
  };
});

const Section = ({ title, hint, action, children }) => {
  const c = useStyles();
  return (
    <div style={{ marginTop: 20 }}>
      <div className={c.row} style={{ marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className={c.title}>{title}</div>
          {hint && <div className={c.hint}>{hint}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
};

const blank = () => ({ id: null, month: monthKey(new Date()), channel: "", custom: "", campaign: "", amount: "", repeat: 1, note: "" });

// The form to record (or correct) an investment
const SpendDialog = ({ open, onClose, channels, editing, onSaved }) => {
  const [f, setF] = useState(blank());
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    if (editing) {
      const known = channels.some((c) => c.name === editing.source);
      setF({ id: editing.id, month: editing.month, channel: known ? editing.source : OTHER, custom: known ? "" : editing.source, campaign: editing.campaign || "", amount: String(editing.amount).replace(".", ","), repeat: 1, note: editing.note || "" });
    } else setF(blank());
  }, [open, editing, channels]);
  const source = f.channel === OTHER ? f.custom.trim() : f.channel;
  const valid = source && String(f.amount).trim() && /^\d{4}-\d{2}$/.test(f.month);
  const save = async () => {
    setSaving(true);
    try {
      const body = { month: f.month, source, campaign: f.campaign, amount: String(f.amount).replace(/\./g, "").replace(",", "."), note: f.note };
      if (f.id) await api.put(`/marketing/spend/${f.id}`, body);
      else await api.post("/marketing/spend", { ...body, repeat: Number(f.repeat) || 1 });
      toast.success(f.id ? "Investimento corrigido." : Number(f.repeat) > 1 ? `Investimento registrado em ${f.repeat} meses.` : "Investimento registrado.");
      onSaved();
      onClose();
    } catch (err) { toastError(err); }
    setSaving(false);
  };
  const chosen = channels.find((c) => c.name === f.channel);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{editing ? "Corrigir investimento" : "Registrar investimento"}</DialogTitle>
      <DialogContent dividers>
        <div style={{ display: "grid", gap: 4 }}>
          <TextField select fullWidth autoFocus variant="outlined" margin="dense" label="Onde foi investido" value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}
            helperText={chosen ? chosen.hint : "Escolha o canal de divulgação."}>
            {channels.map((c) => <MenuItem key={c.name} value={c.name}>{c.name}</MenuItem>)}
            <MenuItem value={OTHER}>Outro canal (digitar)</MenuItem>
          </TextField>
          {f.channel === OTHER && <TextField fullWidth variant="outlined" margin="dense" label="Nome do canal" value={f.custom} onChange={(e) => setF({ ...f, custom: e.target.value })} inputProps={{ maxLength: 80 }} />}
          <div className={useStyles().row} style={{ gap: 12 }}>
            <TextField variant="outlined" margin="dense" type="month" label="Mês" InputLabelProps={{ shrink: true }} value={f.month} onChange={(e) => setF({ ...f, month: e.target.value })} style={{ width: 180 }} />
            <TextField variant="outlined" margin="dense" label="Valor (R$)" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} style={{ width: 160 }} />
            {!editing && (
              <TextField variant="outlined" margin="dense" type="number" label="Repetir por quantos meses" value={f.repeat} onChange={(e) => setF({ ...f, repeat: e.target.value })} inputProps={{ min: 1, max: 12 }} style={{ width: 210 }}
                helperText={Number(f.repeat) > 1 ? `Lança o mesmo valor em ${f.repeat} meses seguidos.` : "1 = só neste mês"} />
            )}
          </div>
          <TextField fullWidth variant="outlined" margin="dense" label="Campanha ou descrição (opcional)" value={f.campaign} onChange={(e) => setF({ ...f, campaign: e.target.value })} inputProps={{ maxLength: 120 }}
            helperText="Ex.: Vestibular 2027. Se o link da campanha usa o mesmo nome (utm_campaign), o resultado dela aparece abaixo." />
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" color="primary" disabled={!valid || saving} onClick={save}>{editing ? "Salvar" : "Registrar"}</Button>
      </DialogActions>
    </Dialog>
  );
};

// What was invested to attract students against what came in. Conversations that start on WhatsApp do not say which ad brought
// them, so the cost is read on the whole (invested ÷ leads and enrollments, month by month) and by where the money went;
// the channels that leave a trace in the lead's origin also show their own result.
// `from`/`to` (yyyy-MM-dd): the period of the screen that shows it (the panel); without them it has its own selector.
const Cac = ({ from, to }) => {
  const classes = useStyles();
  const embedded = !!(from && to);
  const [range, setRange] = useState("90");
  const [data, setData] = useState(null);
  const [spend, setSpend] = useState([]);
  const [dialog, setDialog] = useState({ open: false, editing: null });
  const [removing, setRemoving] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const period = useMemo(() => {
    if (from && to) return { from, to };
    const end = new Date();
    const start = new Date(end.getTime() - (Number(range) - 1) * 86400000);
    return { from: ymd(start), to: ymd(end) };
  }, [range, from, to]);

  const load = useCallback(async () => {
    try {
      const [{ data: d }, { data: s }] = await Promise.all([api.get("/marketing/cac", { params: period }), api.get("/marketing/spend", { params: period })]);
      setData(d);
      setSpend(Array.isArray(s) ? s : []);
    } catch (err) { toastError(err); }
  }, [period]);
  useEffect(() => { load(); }, [load]);

  const remove = async () => {
    const row = removing;
    try { await api.delete(`/marketing/spend/${row.id}`); toast.success("Investimento apagado."); await load(); } catch (err) { toastError(err); }
  };

  if (!data) return <Typography className={classes.hint}>Carregando...</Typography>;
  const t = data.total;
  const hasSpend = t.spent > 0;
  const box = embedded ? classes.flat : classes.card;
  const chart = data.monthly.map((m) => ({ ...m, label: monthLabel(m.month) }));
  const sources = data.bySource.filter((r) => r.leads > 0 || r.enrolled > 0);
  const channelNames = data.channels;
  const entries = showAll ? spend : spend.slice(0, 6);

  return (
    <div>
      <div className={classes.row} style={{ marginBottom: 12 }}>
        {!embedded && (
          <TextField select size="small" variant="outlined" label="Período" value={range} onChange={(e) => setRange(e.target.value)} style={{ width: 200 }}>
            {RANGES.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
          </TextField>
        )}
        <span style={{ flex: 1 }} />
        <Button size="small" variant="contained" color="primary" startIcon={<Plus size={15} />} onClick={() => setDialog({ open: true, editing: null })}>Registrar investimento</Button>
      </div>

      <div className={classes.notice}>
        <Info size={17} style={{ flex: "none", marginTop: 2, color: "#0693E3" }} />
        <span>
          Quem chega pelo WhatsApp não diz de qual anúncio veio, então o custo é medido <b>sobre o total</b>: tudo o que foi investido no período dividido por todos os leads e por todas as matrículas.
          Os canais que deixam rastro na origem do lead (Instagram, Facebook, Google e eventos) mostram também o resultado próprio.
        </span>
      </div>

      <div className={classes.kpis}>
        <div className={classes.kpi}><div className={classes.hint}>Investido</div><div className={classes.kpiN}>{brl(t.spent)}</div></div>
        <div className={classes.kpi}><div className={classes.hint}>Leads</div><div className={classes.kpiN}>{t.leads}</div></div>
        <div className={classes.kpi}><div className={classes.hint}>Matrículas</div><div className={classes.kpiN}>{t.enrolled}</div></div>
        <div className={classes.kpi}><div className={classes.hint}>Custo por lead</div><div className={classes.kpiN}>{brl(t.costPerLead)}</div></div>
        <div className={classes.kpi}><div className={classes.hint}>Custo por matrícula</div><div className={classes.kpiN}>{brl(t.cac)}</div></div>
      </div>

      {!hasSpend && (
        <div className={classes.empty} style={{ marginTop: 16 }}>
          <Typography style={{ fontWeight: 600 }}>Nenhum investimento registrado neste período</Typography>
          <Typography className={classes.hint} style={{ margin: "4px 0 12px" }}>Registre o que foi gasto em anúncios, eventos e materiais para ver quanto custa cada lead e cada matrícula.</Typography>
          <Button variant="outlined" startIcon={<Plus size={15} />} onClick={() => setDialog({ open: true, editing: null })}>Registrar o primeiro investimento</Button>
        </div>
      )}

      {hasSpend && (
        <>
          <Section title="Mês a mês" hint="O que foi investido e quantas matrículas vieram em cada mês. As matrículas de um mês podem ser de leads de meses anteriores.">
            {chart.length > 1 && (
              <div style={{ height: 220 }}>
                <ResponsiveContainer>
                  <ComposedChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.35} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis yAxisId="l" tickLine={false} axisLine={false} fontSize={12} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)} mil` : v)} />
                    <YAxis yAxisId="r" orientation="right" allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                    <Tooltip formatter={(v, n) => (n === "Investido" ? brl(v) : v)} />
                    <Legend />
                    <Bar yAxisId="l" dataKey="spent" name="Investido" fill="#0693E3" radius={[5, 5, 0, 0]} animationDuration={1000} animationEasing="ease-out" />
                    <Line yAxisId="r" type="monotone" dataKey="enrolled" name="Matrículas" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} animationDuration={1100} animationEasing="ease-out" />
                    <Line yAxisId="r" type="monotone" dataKey="leads" name="Leads" stroke="#0B4279" strokeWidth={2} strokeDasharray="4 3" dot={false} animationDuration={1100} animationEasing="ease-out" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className={classes.scroll}>
              <table className={classes.table}>
                <thead><tr><th>Mês</th><th>Investido</th><th>Leads</th><th>Matrículas</th><th>Custo por lead</th><th>Custo por matrícula</th></tr></thead>
                <tbody>
                  {data.monthly.map((m) => (
                    <tr key={m.month}>
                      <td>{monthLabel(m.month)}</td><td>{m.spent ? brl(m.spent) : "—"}</td><td>{m.leads}</td><td>{m.enrolled}</td><td>{brl(m.costPerLead)}</td><td><b>{brl(m.cac)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Onde o dinheiro foi" hint="Cada canal de divulgação com a sua parte do investimento. Onde há rastro, o resultado do canal aparece ao lado.">
            {data.byChannel.map((c) => (
              <div key={c.name} className={classes.channel}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{c.name}</div>
                  <span className={classes.chip} style={c.trackable ? { background: "rgba(22,163,74,.14)", color: "#15803d" } : { background: "rgba(100,116,139,.16)", color: "#475569" }}
                    title={c.trackable ? `Os leads de ${c.sources.join(" e ")} contam como resultado deste canal.` : "Este canal não deixa rastro na origem do lead: só dá para comparar com o total."}>
                    {c.trackable ? "com rastreio" : "sem rastreio"}
                  </span>
                </div>
                <div className={classes.track} aria-hidden="true"><div style={{ width: `${c.share}%`, height: "100%", background: "#0693E3", transition: "width 1s cubic-bezier(.2,.8,.2,1)" }} /></div>
                <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}><b>{brl(c.spent)}</b><div className={classes.hint}>{String(c.share).replace(".", ",")}% do total</div></div>
                <div className={classes.hint} style={{ textAlign: "right" }}>
                  {c.trackable ? (
                    <>
                      {c.leads} lead{c.leads === 1 ? "" : "s"} · {c.enrolled} matrícula{c.enrolled === 1 ? "" : "s"}
                      <div style={{ color: "inherit" }}>{c.cac !== null ? <><b>{brl(c.cac)}</b> por matrícula</> : c.costPerLead !== null ? <><b>{brl(c.costPerLead)}</b> por lead</> : "sem resultado ainda"}</div>
                    </>
                  ) : "—"}
                </div>
              </div>
            ))}
          </Section>
        </>
      )}

      <Section title="De onde vieram os leads" hint="Só o resultado, sem custo: a origem é o que o lead informou ou o canal por onde chegou.">
        {sources.length === 0 ? <Typography className={classes.hint}>Nenhum lead no período.</Typography> : (
          <div className={classes.scroll}>
            <table className={classes.table}>
              <thead><tr><th>Origem</th><th>Leads</th><th>Matrículas</th><th>Conversão</th></tr></thead>
              <tbody>
                {sources.map((r) => (
                  <tr key={r.name}><td>{r.name}</td><td>{r.leads}</td><td>{r.enrolled}</td><td>{pct(r.enrolled, r.leads)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Typography className={classes.hint} style={{ marginTop: 8 }}>
          Para saber mais, peça ao consultor que pergunte “como você conheceu a gente?” no primeiro contato e corrija a Origem do lead. Os links das páginas por curso já marcam a origem sozinhos.
        </Typography>
      </Section>

      {data.byCampaign.length > 0 && (
        <Section title="Por campanha" hint="Vem do utm_campaign do link ou do formulário. O custo aparece quando o investimento tem o mesmo nome da campanha.">
          <div className={classes.scroll}>
            <table className={classes.table}>
              <thead><tr><th>Campanha</th><th>Leads</th><th>Matrículas</th><th>Investido</th><th>Custo por matrícula</th></tr></thead>
              <tbody>
                {data.byCampaign.map((r) => (
                  <tr key={r.name}><td>{r.name}</td><td>{r.leads}</td><td>{r.enrolled}</td><td>{r.spent ? brl(r.spent) : "—"}</td><td><b>{brl(r.cac)}</b></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {spend.length > 0 && (
        <Section title="Investimentos registrados" hint="Do mais recente para o mais antigo.">
          {entries.map((s) => (
            <div key={s.id} className={classes.entry}>
              <span style={{ width: 80 }}>{monthLabel(s.month)}</span>
              <span style={{ flex: 1, minWidth: 160 }}>{s.source}{s.campaign ? <span className={classes.hint}> · {s.campaign}</span> : ""}</span>
              <b style={{ fontVariantNumeric: "tabular-nums" }}>{brl(s.amount)}</b>
              <IconButton size="small" aria-label="Corrigir" onClick={() => setDialog({ open: true, editing: s })}><Pencil size={15} /></IconButton>
              <IconButton size="small" aria-label="Apagar" onClick={() => setRemoving(s)}><Trash2 size={15} /></IconButton>
            </div>
          ))}
          {spend.length > 6 && <Button size="small" onClick={() => setShowAll((v) => !v)}>{showAll ? "Mostrar menos" : `Mostrar todos (${spend.length})`}</Button>}
        </Section>
      )}

      <SpendDialog open={dialog.open} editing={dialog.editing} channels={channelNames} onClose={() => setDialog({ open: false, editing: null })} onSaved={load} />
      <ConfirmationModal title="Apagar este investimento?" open={!!removing} onClose={() => setRemoving(null)} onConfirm={remove}>
        {removing ? `${monthLabel(removing.month)} · ${removing.source} · ${brl(removing.amount)}. O custo por lead e por matrícula do período será recalculado.` : ""}
      </ConfirmationModal>
    </div>
  );
};

export default Cac;
