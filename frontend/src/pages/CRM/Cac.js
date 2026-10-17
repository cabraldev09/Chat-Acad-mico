import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Button, IconButton, MenuItem, TextField, Typography, makeStyles } from "@material-ui/core";
import { Plus, Trash2 } from "lucide-react";

import api from "../../services/api";
import toastError from "../../errors/toastError";

const brl = (n) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const ymd = (d) => d.toLocaleDateString("en-CA", { timeZone: "America/Porto_Velho" });
const monthKey = (d) => ymd(d).slice(0, 7);
const monthLabel = (key) => { const [y, m] = key.split("-"); return `${["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(m) - 1]}/${y}`; };

const RANGES = [["30", "Últimos 30 dias"], ["90", "Últimos 90 dias"], ["180", "Últimos 6 meses"], ["365", "Último ano"]];

const useStyles = makeStyles((theme) => {
  const line = theme.palette.type === "dark" ? "rgba(255,255,255,.09)" : "#e3e9f1";
  return {
    card: { background: theme.palette.cards.background, border: `1px solid ${line}`, borderRadius: 16, padding: theme.spacing(2.25), marginBottom: theme.spacing(2) },
    // inside another card (the panel): no second border, a divider instead
    flat: { borderTop: `1px solid ${line}`, paddingTop: theme.spacing(1.75), marginTop: theme.spacing(1.75) },
    hint: { fontSize: 12.5, color: theme.palette.text.secondary },
    kpis: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: theme.spacing(1.5), marginBottom: theme.spacing(2) },
    kpi: { border: `1px solid ${line}`, borderRadius: 14, padding: theme.spacing(1.5, 2), background: theme.palette.cards.background },
    kpiN: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" },
    table: { width: "100%", borderCollapse: "collapse", fontSize: 13.5, "& th": { textAlign: "right", fontWeight: 600, padding: "8px 10px", color: theme.palette.text.secondary, borderBottom: `1px solid ${line}` }, "& td": { textAlign: "right", padding: "9px 10px", borderBottom: `1px solid ${line}`, fontVariantNumeric: "tabular-nums" }, "& th:first-child, & td:first-child": { textAlign: "left" } },
    row: { display: "flex", gap: theme.spacing(1), flexWrap: "wrap", alignItems: "center" },
    scroll: { overflowX: "auto" },
  };
});

const Table = ({ rows, empty }) => {
  const classes = useStyles();
  if (!rows.length) return <Typography className={classes.hint}>{empty}</Typography>;
  return (
    <div className={classes.scroll}>
      <table className={classes.table}>
        <thead><tr><th>Origem</th><th>Leads</th><th>Matrículas</th><th>Conversão</th><th>Investido</th><th>Custo por lead</th><th>Custo por matrícula</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td><td>{r.leads}</td><td>{r.enrolled}</td>
              <td>{r.conversion === null ? "—" : `${String(r.conversion).replace(".", ",")}%`}</td>
              <td>{r.spent ? brl(r.spent) : "—"}</td><td>{brl(r.costPerLead)}</td><td><b>{brl(r.cac)}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// What was spent to attract students and what it cost for each lead and each enrollment, by source and by campaign.
// `from`/`to` (yyyy-MM-dd): the period of the screen that shows it (the panel); without them it has its own selector.
const Cac = ({ from, to }) => {
  const classes = useStyles();
  const embedded = !!(from && to);
  const [range, setRange] = useState("90");
  const [showForm, setShowForm] = useState(false);
  const [data, setData] = useState(null);
  const [spend, setSpend] = useState([]);
  const [form, setForm] = useState({ month: monthKey(new Date()), source: "", campaign: "", amount: "" });
  const [saving, setSaving] = useState(false);

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

  const add = async () => {
    setSaving(true);
    try {
      await api.post("/marketing/spend", { ...form, amount: String(form.amount).replace(",", ".") });
      toast.success("Investimento registrado.");
      setForm({ ...form, campaign: "", amount: "" });
      setShowForm(false);
      await load();
    } catch (err) { toastError(err); }
    setSaving(false);
  };
  const remove = async (id) => {
    try { await api.delete(`/marketing/spend/${id}`); await load(); } catch (err) { toastError(err); }
  };

  if (!data) return <Typography className={classes.hint}>Carregando...</Typography>;
  const t = data.total;
  const box = embedded ? classes.flat : classes.card;
  return (
    <div>
      <div className={classes.row} style={{ marginBottom: 16 }}>
        {!embedded && (
          <TextField select size="small" variant="outlined" label="Período" value={range} onChange={(e) => setRange(e.target.value)} style={{ width: 200 }}>
            {RANGES.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
          </TextField>
        )}
        <Typography className={classes.hint}>Leads que chegaram e matrículas confirmadas no período, com o que foi investido nos meses dele.</Typography>
        <span style={{ flex: 1 }} />
        <Button size="small" variant="outlined" startIcon={<Plus size={15} />} onClick={() => setShowForm((v) => !v)}>{showForm ? "Fechar" : "Registrar investimento"}</Button>
      </div>

      {showForm && (
      <div className={box}>
        <Typography style={{ fontWeight: 600, marginBottom: 8 }}>Registrar investimento</Typography>
        <div className={classes.row}>
          <TextField size="small" variant="outlined" type="month" label="Mês" InputLabelProps={{ shrink: true }} value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} style={{ width: 170 }} />
          <TextField select size="small" variant="outlined" label="Origem" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} style={{ width: 210 }}>
            {data.sources.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
          <TextField size="small" variant="outlined" label="Campanha (opcional)" value={form.campaign} onChange={(e) => setForm({ ...form, campaign: e.target.value })} style={{ width: 210 }} />
          <TextField size="small" variant="outlined" label="Valor (R$)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={{ width: 140 }} />
          <Button variant="contained" color="primary" startIcon={<Plus size={16} />} disabled={saving || !form.source || !form.amount} onClick={add}>Registrar</Button>
        </div>
      </div>
      )}

      <div className={classes.kpis}>
        <div className={classes.kpi}><div className={classes.hint}>Investido</div><div className={classes.kpiN}>{brl(t.spent)}</div></div>
        <div className={classes.kpi}><div className={classes.hint}>Leads</div><div className={classes.kpiN}>{t.leads}</div></div>
        <div className={classes.kpi}><div className={classes.hint}>Matrículas</div><div className={classes.kpiN}>{t.enrolled}</div></div>
        <div className={classes.kpi}><div className={classes.hint}>Custo por lead</div><div className={classes.kpiN}>{brl(t.costPerLead)}</div></div>
        <div className={classes.kpi}><div className={classes.hint}>Custo por matrícula</div><div className={classes.kpiN}>{brl(t.cac)}</div></div>
      </div>

      <div className={box}>
        <Typography style={{ fontWeight: 600, marginBottom: 8 }}>Por origem</Typography>
        <Table rows={data.bySource} empty="Nenhum lead nem investimento no período." />
        <Typography className={classes.hint} style={{ marginTop: 8 }}>O custo por matrícula só aparece quando há investimento e ao menos uma matrícula na origem.</Typography>
      </div>

      {data.byCampaign.length > 0 && (
        <div className={box}>
          <Typography style={{ fontWeight: 600, marginBottom: 8 }}>Por campanha</Typography>
          <Table rows={data.byCampaign} empty="" />
          <Typography className={classes.hint} style={{ marginTop: 8 }}>Vem do UTM de campanha do link ou do formulário. Para ter o custo, registre o investimento com o mesmo nome da campanha.</Typography>
        </div>
      )}

      {spend.length > 0 && (
      <div className={box}>
        <Typography style={{ fontWeight: 600, marginBottom: 4 }}>Investimentos registrados</Typography>
        <div style={{ marginTop: 6 }}>
          {spend.map((s) => (
            <div key={s.id} className={classes.row} style={{ padding: "6px 0", borderTop: "1px solid rgba(128,128,128,.2)" }}>
              <span style={{ width: 80 }}>{monthLabel(s.month)}</span>
              <span style={{ flex: 1, minWidth: 140 }}>{s.source}{s.campaign ? ` · ${s.campaign}` : ""}</span>
              <b style={{ fontVariantNumeric: "tabular-nums" }}>{brl(s.amount)}</b>
              <IconButton size="small" aria-label="Apagar" onClick={() => remove(s.id)}><Trash2 size={15} /></IconButton>
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
};

export default Cac;
