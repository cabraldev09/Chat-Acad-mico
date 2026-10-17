import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, TextField, Tooltip, makeStyles } from "@material-ui/core";
import { CalendarDays, ClipboardPaste, Copy, ImageDown, LayoutGrid, Pencil, Plus, Settings2, Table2, Trash2 } from "lucide-react";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import ShareFrame from "../../components/ShareFrame";
import BrandLogo from "../../components/BrandLogo";
import GoalsTabs from "../../components/GoalsTabs";
import NumberField from "../../components/NumberField";
import { AuthContext } from "../../context/Auth/AuthContext";
import { isManager } from "../../utils/access";
import { brDecimal, copyPng, downloadPng, renderPng } from "../../utils/shareImage";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const SHARE_WIDTH = 640;
const WORK_DAYS = [[5, "Segunda a sexta"], [6, "Segunda a sábado"], [7, "Todos os dias"]];
const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const monthName = (key) => MONTH_NAMES[Number(key.slice(5, 7)) - 1];
const monthShort = (key) => monthName(key).slice(0, 3);
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

// The number shown in each month of a polo's strip:
//  - a month that already passed shows what was done in it, and stays EMPTY when nothing was recorded (no invented target);
//  - the current and the next months share what is still missing of the semester target (months whose target was set
//    by hand keep it).
// `now` is the month of today ("YYYY-MM").
const planOfMonths = (row, now) => {
  const months = row.months || [];
  if (row.target === null || row.target === undefined) return months.map(() => ({ value: null, kind: "none" }));
  const pastDone = months.reduce((t, m) => t + (m.month < now ? m.done : 0), 0);
  const ahead = months.filter((m) => m.month >= now);
  const left = Math.max(0, row.target - Math.max(row.done - ahead.reduce((t, m) => t + m.done, 0), pastDone));
  // what is missing after the months already ahead got their own results is spread over the months still to come
  const split = row.monthlyCustom ? null : evenSplit(left + ahead.reduce((t, m) => t + m.done, 0), Math.max(1, ahead.length));
  let k = 0;
  return months.map((m) => {
    if (m.month < now) return { value: m.done > 0 ? m.done : null, kind: "past" };
    const planned = split ? split[k] : m.target;
    k += 1;
    return { value: planned, kind: m.month === now ? "current" : "future", done: m.done };
  });
};
const thisMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Porto_Velho" }).format(new Date()).slice(0, 7);
// the colour of a polo says how far it is from the target
const TONE = {
  great: { bg: "#15803d", soft: "rgba(21,128,61,.14)", label: "Meta batida", dot: "🟢" },
  good: { bg: "#22a55a", soft: "rgba(34,165,90,.14)", label: "No caminho", dot: "🟢" },
  warn: { bg: "#d99a00", soft: "rgba(217,154,0,.16)", label: "Atenção", dot: "🟡" },
  low: { bg: "#dc2626", soft: "rgba(220,38,38,.14)", label: "Precisa de reforço", dot: "🔴" },
  none: { bg: "#7b8a9d", soft: "rgba(123,138,157,.16)", label: "Sem meta", dot: "⚪" },
};
const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const shortName = (n) => String(n || "").replace(/\s*-\s*RO$/i, "");
const pctLabel = (p) => (p === null || p === undefined ? "—" : `${brDecimal(p)}%`);
const perDayLabel = (v) => (v === null || v === undefined ? "—" : brDecimal(v));
const missingLabel = (r) => (r.missing === null || r.missing === undefined ? "—" : r.missing < 0 ? `+${Math.abs(r.missing)}` : r.missing);
const evenSplit = (total, n) => { const base = Math.floor(total / n); const extra = total - base * n; return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0)); };
const sameArray = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// how much of a stretch of days has passed (calendar days)
const elapsedPct = (startIso, endIso) => {
  const t = new Date(`${startIso}T00:00:00`).getTime();
  const e = new Date(`${endIso}T23:59:59`).getTime();
  return Math.min(100, Math.max(0, ((Date.now() - t) / (e - t)) * 100));
};
const monthRange = (key, goal) => {
  const last = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0).getDate();
  const a = `${key}-01`;
  const b = `${key}-${String(last).padStart(2, "0")}`;
  return [a < goal.startsOn ? goal.startsOn : a, b > goal.endsOn ? goal.endsOn : b];
};

// the table the administration already keeps in the spreadsheet (Código, Polo, Meta, Realizado, Cancelados/transferidos)
const SHEET = [
  ["1893", "Buritis - Setor 02 - RO", 70, 11, 0],
  ["1959", "Cerejeiras - Jardim Liberdade - RO", 60, 41, 4],
  ["2027", "Alto Alegre dos Parecis - Centro - RO", 50, 31, 4],
  ["2042", "Mirante da Serra - Centro - RO", 60, 18, 5],
  ["2085", "Porto Velho - Centro - RO", 80, 77, 15],
  ["8251", "Chupinguaia - Centro - RO", 60, 36, 3],
  ["8311", "Vilhena - Centro (S-01) - RO", 80, 117, 23],
  ["8809", "Porto Velho (Juscelino Kubitschek) - RO", 90, 69, 7],
].map((r) => r.join("\t")).join("\n");

const useStyles = makeStyles((theme) => ({
  body: { flex: 1, overflowY: "auto", overflowX: "hidden", ...theme.scrollbarStyles, paddingBottom: theme.spacing(3) },
  periods: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: theme.spacing(1.5) },
  chipBtn: { border: theme.border.divider, background: "transparent", color: "inherit", borderRadius: 999, padding: "6px 14px", cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, "&:hover": { background: theme.palette.action.hover } },
  chipOn: { background: theme.palette.primary.main, color: "#fff", borderColor: theme.palette.primary.main, "&:hover": { background: theme.palette.primary.main } },
  months: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: theme.spacing(2) },
  monthBtn: { border: theme.border.divider, background: theme.palette.cards.background, color: "inherit", borderRadius: 12, padding: "6px 12px 7px", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, textAlign: "left", minWidth: 76, "&:hover": { background: theme.palette.action.hover } },
  monthOn: { background: theme.palette.primary.main, color: "#fff", borderColor: theme.palette.primary.main, "&:hover": { background: theme.palette.primary.main } },
  monthBar: { height: 4, borderRadius: 4, marginTop: 6, background: "rgba(127,140,160,.3)", overflow: "hidden" },
  hero: {
    display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: theme.spacing(3), alignItems: "center", color: "#fff", borderRadius: 20, padding: theme.spacing(3),
    background: "radial-gradient(120% 140% at 0% 0%, #0f5aa8 0%, #0B4279 45%, #082f57 100%)", boxShadow: "0 14px 34px rgba(11,66,121,.28)", marginBottom: theme.spacing(2),
    [theme.breakpoints.down("xs")]: { gridTemplateColumns: "1fr", justifyItems: "center", textAlign: "center" },
  },
  heroNum: { fontSize: 44, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1, fontVariantNumeric: "tabular-nums" },
  heroSub: { opacity: 0.8, fontSize: 14, marginTop: 4 },
  facts: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14, [theme.breakpoints.down("xs")]: { justifyContent: "center" } },
  fact: { background: "rgba(255,255,255,.12)", borderRadius: 12, padding: "7px 12px", fontSize: 13, lineHeight: 1.25 },
  factN: { fontWeight: 700, fontSize: 16, fontVariantNumeric: "tabular-nums", display: "block" },
  toolbar: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: theme.spacing(1.5) },
  seg: { display: "inline-flex", border: theme.border.divider, borderRadius: 10, overflow: "hidden" },
  segBtn: { border: 0, background: "transparent", color: "inherit", padding: "6px 12px", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", gap: 6, alignItems: "center" },
  segOn: { background: theme.palette.primary.main, color: "#fff" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: theme.spacing(1.5) },
  card: { background: theme.palette.cards.background, border: theme.border.divider, borderRadius: 16, padding: theme.spacing(2), position: "relative", overflow: "hidden" },
  rank: { width: 26, height: 26, borderRadius: 8, display: "inline-grid", placeItems: "center", fontSize: 12.5, fontWeight: 700, background: theme.palette.action.selected, flexShrink: 0 },
  badge: { borderRadius: 999, padding: "3px 10px", fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#fff", whiteSpace: "nowrap" },
  track: { height: 10, borderRadius: 999, background: theme.palette.action.selected, position: "relative", marginTop: 14, marginBottom: 12 },
  fill: { height: "100%", borderRadius: 999, transition: "width .7s cubic-bezier(.2,.8,.2,1)" },
  tick: { position: "absolute", top: -4, bottom: -4, width: 2, background: theme.palette.text.primary, opacity: 0.55, borderRadius: 2 },
  nums: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 },
  numLabel: { fontSize: 11.5, color: theme.palette.text.secondary },
  numVal: { fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", lineHeight: 1.15 },
  foot: { display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", fontSize: 12, color: theme.palette.text.secondary, marginTop: 12, paddingTop: 10, borderTop: theme.border.divider },
  strip: { display: "flex", gap: 5, marginTop: 12, alignItems: "flex-end" },
  stripCol: { flex: 1, textAlign: "center", fontSize: 10.5, color: theme.palette.text.secondary, cursor: "pointer", border: 0, background: "transparent", padding: 0, fontFamily: "inherit" },
  stripNum: { fontSize: 12.5, fontWeight: 700, lineHeight: "16px", marginBottom: 2, color: theme.palette.text.primary, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },
  stripBar: { height: 26, borderRadius: 5, background: theme.palette.action.selected, position: "relative", overflow: "hidden", marginBottom: 3 },
  tableWrap: { overflowX: "auto", background: theme.palette.cards.background, border: theme.border.divider, borderRadius: 16 },
  table: { borderCollapse: "collapse", width: "100%", minWidth: 860, fontSize: 13.5, fontVariantNumeric: "tabular-nums", "& th": { background: "#4a90d9", color: "#fff", fontWeight: 600, padding: "10px 12px", textAlign: "center", whiteSpace: "nowrap" }, "& td": { padding: "9px 12px", textAlign: "center", borderBottom: theme.border.divider }, "& td:nth-child(2), & th:nth-child(2)": { textAlign: "left" }, "& tfoot td": { fontWeight: 700, background: theme.palette.action.hover } },
  hint: { fontSize: 12.5, color: theme.palette.text.secondary },
  empty: { textAlign: "center", color: theme.palette.text.secondary, padding: theme.spacing(6, 2) },
  editRow: { display: "grid", gridTemplateColumns: "minmax(160px,1.6fr) 92px 92px 92px 36px", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: theme.border.divider, [theme.breakpoints.down("xs")]: { gridTemplateColumns: "1fr 1fr 1fr 36px" } },
  monthRow: { display: "grid", gridTemplateColumns: "110px 1fr 1fr", gap: 8, alignItems: "center", padding: "4px 0" },
  sheet: { width: "100%", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12.5, whiteSpace: "pre", overflowX: "auto" },
}));

// the ring on the hero: how much of the target is done
const Ring = ({ pct, size = 150, caption = "da meta" }) => {
  const r = (size - 16) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.min(100, pct || 0);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${pctLabel(pct)} ${caption}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="12" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#FEF84C" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dasharray .8s cubic-bezier(.2,.8,.2,1)" }} />
      <text x="50%" y="48%" textAnchor="middle" fill="#fff" style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.03em" }}>{pct === null || pct === undefined ? "—" : `${Math.round(pct)}%`}</text>
      <text x="50%" y="63%" textAnchor="middle" fill="rgba(255,255,255,.75)" style={{ fontSize: 12 }}>{caption}</text>
    </svg>
  );
};

// the picture that goes to the group: its own colours, whatever the theme
const ShareCard = ({ rows, totals, heading, sub }) => (
  <div style={{ background: "#fff", color: "#0b1a2e", fontFamily: "Geist, system-ui, sans-serif" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "22px 30px 18px" }}>
      <BrandLogo height={46} tone="color" />
      <div style={{ textAlign: "right", fontSize: 14, color: "#4b5d73" }}>{sub}</div>
    </div>
    <div style={{ background: "linear-gradient(135deg, #0B4279, #0693E3)", color: "#fff", padding: "20px 30px 22px" }}>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em" }}>{heading}</div>
      <div style={{ display: "flex", gap: 28, marginTop: 14, alignItems: "flex-end" }}>
        {[["Feitas", totals.done], ["Meta", totals.target], ["Faltam", Math.max(0, totals.missing)]].map(([l, v]) => (
          <div key={l}>
            <div style={{ fontSize: 13, opacity: 0.85 }}>{l}</div>
            <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1.05 }}>{v}</div>
          </div>
        ))}
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ fontSize: 13, opacity: 0.85 }}>Progresso</div>
          <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1.05, color: "#FEF84C" }}>{pctLabel(totals.pct)}</div>
        </div>
      </div>
      <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,.25)", marginTop: 16, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(100, totals.pct || 0)}%`, height: "100%", background: "#FEF84C", borderRadius: 999 }} />
      </div>
    </div>
    <div style={{ padding: "6px 30px 4px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 54px 54px 62px 88px", gap: 8, padding: "12px 0 8px", fontSize: 12.5, color: "#6b7b90", fontWeight: 600 }}>
        <span>Polo</span><span style={{ textAlign: "right" }}>Meta</span><span style={{ textAlign: "right" }}>Feitas</span><span style={{ textAlign: "right" }}>Faltam</span><span style={{ textAlign: "right" }}>Progresso</span>
      </div>
      {rows.map((r) => (
        <div key={r.poloId} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 54px 54px 62px 88px", gap: 8, alignItems: "center", padding: "10px 0", borderTop: "1px solid #e6ecf4", fontSize: 16 }}>
          <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortName(r.name)}</span>
          <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.p.target === null ? "—" : r.p.target}</span>
          <span style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{r.p.done}</span>
          <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: r.p.missing !== null && r.p.missing <= 0 ? "#15803d" : "#0b1a2e" }}>{missingLabel(r.p)}</span>
          <span style={{ textAlign: "right" }}>
            <span style={{ display: "inline-block", minWidth: 76, textAlign: "center", borderRadius: 999, padding: "3px 8px", fontSize: 14, fontWeight: 700, color: "#fff", background: TONE[r.p.status].bg, fontVariantNumeric: "tabular-nums" }}>{pctLabel(r.p.pct)}</span>
          </span>
        </div>
      ))}
    </div>
    <div style={{ background: "#f4f8fc", padding: "14px 30px", display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600, marginTop: 8, whiteSpace: "nowrap", gap: 12 }}>
      <span>{totals.daysLeft} dia{totals.daysLeft === 1 ? "" : "s"} útei{totals.daysLeft === 1 ? "l" : "s"}</span>
      <span>{totals.perDay === null ? "—" : brDecimal(totals.perDay, 1)} matrículas/dia</span>
    </div>
  </div>
);

const textFor = (goal, rows, totals, heading, rangeLabel) => {
  const head =
    `📊 ${heading} — ${rangeLabel}\n\n` +
    `Meta total: ${totals.target}\nRealizado: ${totals.done}\nFaltam: ${Math.max(0, totals.missing)}\nProgresso geral: ${pctLabel(totals.pct)}\n` +
    `Dias úteis restantes: ${totals.daysLeft}\nPrecisamos de: ${totals.perDay === null ? "—" : brDecimal(totals.perDay, 1)} matrículas por dia`;
  const rank = rows.map((r) => `${TONE[r.p.status].dot} ${shortName(r.name)}: ${r.p.done}/${r.p.target === null ? "—" : r.p.target} — ${pctLabel(r.p.pct)}`).join("\n");
  return `${head}\n\n🏆 Ranking dos polos\n\n${rank}`;
};

// the dates, the title and the working-day rule of a period (a semester)
const PeriodDialog = ({ open, onClose, goal, onSaved }) => {
  const [f, setF] = useState({ title: "", startsOn: "", endsOn: "", workDays: 5 });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    if (goal) setF({ title: goal.title || "", startsOn: goal.startsOn, endsOn: goal.endsOn, workDays: goal.workDays });
    else {
      const y = new Date().getFullYear();
      const second = new Date().getMonth() >= 6;
      setF({ title: `Graduação ${second ? 2 : 1}º semestre de ${y}`, startsOn: `${y}-${second ? "07" : "01"}-01`, endsOn: `${y}-${second ? "12-31" : "06-30"}`, workDays: 5 });
    }
  }, [open, goal]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setSaving(true);
    try {
      let id;
      if (goal) {
        await api.put(`/goals/${goal.id}`, { title: f.title, startsOn: f.startsOn, endsOn: f.endsOn });
        await api.put(`/goals/${goal.id}/polos`, { workDays: f.workDays });
        id = goal.id;
      } else {
        const { data } = await api.post("/goals", { kind: "polo", title: f.title, startsOn: f.startsOn, endsOn: f.endsOn, members: [] });
        await api.put(`/goals/${data.id}/polos`, { workDays: f.workDays });
        id = data.id;
      }
      toast.success(goal ? "Período atualizado." : "Semestre criado.");
      onSaved(id);
    } catch (e) { toastError(e); }
    setSaving(false);
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{goal ? "Período das metas" : "Novo semestre de metas"}</DialogTitle>
      <DialogContent>
        <TextField fullWidth variant="outlined" margin="dense" label="Nome" value={f.title} onChange={set("title")} />
        <TextField fullWidth variant="outlined" margin="dense" type="date" label="Início" value={f.startsOn} onChange={set("startsOn")} InputLabelProps={{ shrink: true }} />
        <TextField fullWidth variant="outlined" margin="dense" type="date" label="Fim" value={f.endsOn} onChange={set("endsOn")} InputLabelProps={{ shrink: true }} />
        <TextField select fullWidth variant="outlined" margin="dense" label="Dias úteis" value={f.workDays} onChange={(e) => setF({ ...f, workDays: Number(e.target.value) })}>
          {WORK_DAYS.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
        </TextField>
        <div style={{ fontSize: 12.5, opacity: 0.75, marginTop: 8 }}>A meta de cada polo vale para o período todo e é distribuída pelos meses dele. Se você trocar os meses do período, a distribuição mensal volta a ser igual para todos.</div>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="contained" color="primary" onClick={save} disabled={saving || !f.startsOn || !f.endsOn || f.startsOn > f.endsOn}>Salvar</Button>
      </DialogActions>
    </Dialog>
  );
};

// quick edit of ONE polo: target of the semester, what it already has, cancellations and the target of each month
const PoloDialog = ({ open, onClose, row, data, onSaved }) => {
  const classes = useStyles();
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  const months = (data && data.months) || [];
  useEffect(() => {
    if (!open || !row) return;
    setF({ target: row.target, manual: row.manual, canceled: row.canceled, monthly: [...row.monthly], adjust: months.map((m) => row.manualMonthly[m] || 0) });
  }, [open, row]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!f || !row) return null;
  const sum = f.monthly.reduce((t, v) => t + v, 0);
  // changing the semester target spreads it again, unless the months were set by hand
  const changeTarget = (v) => {
    const wasEven = f.target !== null && sameArray(f.monthly, evenSplit(f.target || 0, months.length));
    setF({ ...f, target: v, monthly: wasEven || f.target === null ? evenSplit(v || 0, months.length) : f.monthly });
  };
  const save = async () => {
    setSaving(true);
    try {
      const manualMonthly = {};
      months.forEach((m, i) => { if (f.adjust[i]) manualMonthly[m] = f.adjust[i]; });
      await api.put(`/goals/${data.goal.id}/polos/${row.poloId}`, { target: f.target, manual: f.manual, canceled: f.canceled, monthly: f.target === null ? null : f.monthly, manualMonthly });
      toast.success("Meta do polo atualizada.");
      onSaved();
    } catch (e) { toastError(e); }
    setSaving(false);
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth scroll="paper">
      <DialogTitle>{shortName(row.name)}</DialogTitle>
      <DialogContent dividers>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          <NumberField fullWidth variant="outlined" size="small" nullable label="Meta do semestre" InputLabelProps={{ shrink: true }} value={f.target} onChange={changeTarget} />
          <NumberField fullWidth variant="outlined" size="small" label="Já realizado (fora do CRM)" InputLabelProps={{ shrink: true }} value={f.manual} onChange={(v) => setF({ ...f, manual: v })} />
          <NumberField fullWidth variant="outlined" size="small" label="Cancelados ou transferidos" InputLabelProps={{ shrink: true }} value={f.canceled} onChange={(v) => setF({ ...f, canceled: v })} />
        </div>
        <div className={classes.hint} style={{ marginTop: 6 }}>No CRM este polo tem {row.auto} matrícula{row.auto === 1 ? "" : "s"} no período; elas entram sozinhas e somam ao que você informar.</div>

        <div style={{ display: "flex", alignItems: "center", marginTop: 16 }}>
          <div style={{ fontWeight: 700, flex: 1 }}>Meta de cada mês</div>
          <Button size="small" disabled={f.target === null} onClick={() => setF({ ...f, monthly: evenSplit(f.target || 0, months.length) })}>Distribuir igualmente</Button>
        </div>
        <div className={`${classes.monthRow} ${classes.hint}`} style={{ fontWeight: 600 }}><span>Mês</span><span>Meta do mês</span><span title="Matrículas do mês que não estão no CRM">Ajuste (+)</span></div>
        {months.map((m, i) => (
          <div className={classes.monthRow} key={m}>
            <span style={{ textTransform: "capitalize" }}>{monthName(m)}</span>
            <NumberField variant="outlined" size="small" value={f.monthly[i]} onChange={(v) => setF({ ...f, monthly: f.monthly.map((x, k) => (k === i ? v : x)) })} />
            <NumberField variant="outlined" size="small" value={f.adjust[i]} onChange={(v) => setF({ ...f, adjust: f.adjust.map((x, k) => (k === i ? v : x)) })} />
          </div>
        ))}
        <div className={classes.hint} style={{ marginTop: 8, color: f.target !== null && sum !== f.target ? "#b45309" : undefined }}>
          Soma dos meses: {sum}{f.target !== null ? ` de ${f.target} do semestre${sum === f.target ? "" : sum > f.target ? ` (${sum - f.target} a mais)` : ` (faltam ${f.target - sum})`}` : ""}.
        </div>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="contained" color="primary" onClick={save} disabled={saving}>Salvar</Button>
      </DialogActions>
    </Dialog>
  );
};

// every polo at once: targets, what they already have and cancellations
const EditDialog = ({ open, onClose, data, onSaved }) => {
  const classes = useStyles();
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [add, setAdd] = useState("");
  useEffect(() => {
    if (!open || !data) return;
    setRows((data.rows || []).map((r) => ({ poloId: r.poloId, name: r.name, code: r.code, target: r.target, manual: r.manual, canceled: r.canceled, auto: r.auto, monthly: r.monthly, manualMonthly: r.manualMonthly, oldTarget: r.target })));
    setAdd("");
  }, [open, data]);
  const set = (i, patch) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const free = ((data && data.available) || []).filter((p) => !rows.some((r) => r.poloId === p.id));
  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/goals/${data.goal.id}/polos`, {
        rows: rows.map((r) => ({
          poloId: r.poloId, target: r.target, manual: r.manual, canceled: r.canceled, manualMonthly: r.manualMonthly,
          // a changed target is spread again over the months; an untouched one keeps its monthly targets
          monthly: r.target === r.oldTarget ? r.monthly : undefined,
        })),
      });
      toast.success("Metas dos polos salvas.");
      onSaved();
    } catch (e) { toastError(e); }
    setSaving(false);
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper">
      <DialogTitle>Metas de todos os polos</DialogTitle>
      <DialogContent dividers>
        <div className={`${classes.editRow} ${classes.hint}`} style={{ fontWeight: 600 }}><span>Polo</span><span>Meta</span><span title="Matrículas que não estão no CRM">Já realizado</span><span>Cancelados</span><span /></div>
        {rows.map((r, i) => (
          <div className={classes.editRow} key={r.poloId}>
            <div><div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div><div className={classes.hint}>{r.code ? `Código ${r.code} · ` : ""}{r.auto} no CRM</div></div>
            <NumberField size="small" variant="outlined" nullable value={r.target} onChange={(v) => set(i, { target: v })} />
            <NumberField size="small" variant="outlined" value={r.manual} onChange={(v) => set(i, { manual: v })} />
            <NumberField size="small" variant="outlined" value={r.canceled} onChange={(v) => set(i, { canceled: v })} />
            <Button size="small" aria-label="Tirar polo" style={{ minWidth: 0 }} onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}><Trash2 size={16} /></Button>
          </div>
        ))}
        {free.length > 0 && (
          <TextField select size="small" variant="outlined" label="Adicionar polo" value={add} style={{ minWidth: 260, marginTop: 14 }}
            onChange={(e) => { const p = free.find((x) => x.id === Number(e.target.value)); if (p) setRows((rs) => [...rs, { poloId: p.id, name: p.name, code: p.code, target: null, manual: 0, canceled: 0, auto: 0, monthly: [], manualMonthly: {}, oldTarget: null }]); setAdd(""); }}>
            {free.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </TextField>
        )}
        <div className={classes.hint} style={{ marginTop: 12 }}>
          Para ajustar a meta de um mês, use o lápis no cartão do polo. As matrículas do CRM entram sozinhas; “Já realizado” soma o que está fora do CRM.
        </div>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="contained" color="primary" onClick={save} disabled={saving}>Salvar</Button>
      </DialogActions>
    </Dialog>
  );
};

// paste the spreadsheet: found polos are updated, missing ones are created
const parseSheet = (text) =>
  text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const c = l.split(/\t|;/).map((x) => x.trim());
    const num = (v) => Number(String(v || 0).replace(/\D/g, "")) || 0;
    if (c.length >= 5) return { code: c[0], name: c[1], target: num(c[2]), done: num(c[3]), canceled: num(c[4]) };
    return { code: "", name: c[0], target: num(c[1]), done: num(c[2]), canceled: num(c[3]) };
  });

const ImportDialog = ({ open, onClose, goal, onSaved }) => {
  const classes = useStyles();
  const [text, setText] = useState(SHEET);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setText(SHEET); setPreview(null); } }, [open]);
  const run = async (dryRun) => {
    setBusy(true);
    try {
      const { data } = await api.post(`/goals/${goal.id}/polos/import`, { items: parseSheet(text), dryRun });
      if (dryRun) setPreview(data);
      else { toast.success(`Metas carregadas: ${data.updated} polos atualizados e ${data.created} criados.`); onSaved(); }
    } catch (e) { toastError(e); }
    setBusy(false);
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper">
      <DialogTitle>Carregar a planilha de metas</DialogTitle>
      <DialogContent dividers>
        <div className={classes.hint} style={{ marginBottom: 8 }}>
          Uma linha por polo, com as colunas separadas por tabulação (é só copiar da planilha): <b>Código, Polo, Meta, Realizado, Cancelados</b>. O realizado é o total do polo no período; o que o CRM já contou é descontado para não somar duas vezes. A tabela abaixo já vem com os polos da sua planilha.
        </div>
        <textarea className={classes.sheet} rows={10} value={text} onChange={(e) => { setText(e.target.value); setPreview(null); }} spellCheck={false} />
        {preview && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>O que vai acontecer: {preview.updated} polos atualizados, {preview.created} novos{preview.errors ? `, ${preview.errors} linhas com problema` : ""}.</div>
            {preview.rows.map((r) => (
              <div key={r.line} className={classes.hint} style={{ color: r.status === "error" ? "#b91c1c" : undefined }}>
                {r.status === "new" ? "Novo" : r.status === "update" ? "Atualiza" : "Erro"} · {r.name || "linha sem nome"}{r.status !== "error" ? ` · meta ${r.target} · realizado ${r.done} · cancelados ${r.canceled}` : " · confira o nome e a meta"}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="outlined" onClick={() => run(true)} disabled={busy || !text.trim()}>Conferir</Button>
        <Button variant="contained" color="primary" onClick={() => run(false)} disabled={busy || !preview || preview.errors === preview.rows.length}>Carregar</Button>
      </DialogActions>
    </Dialog>
  );
};

const PoloGoals = () => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);
  const manager = isManager(user);
  const [data, setData] = useState(null);
  const [view, setView] = useState("cards");
  const [month, setMonth] = useState(null);
  const [dialog, setDialog] = useState(null); // period-new | period-edit | all | import | { polo }
  const [busy, setBusy] = useState(false);
  const shareRef = useRef(null);

  const load = useCallback(async (goalId) => {
    try {
      const { data: d } = await api.get("/goals/polos", { params: goalId ? { goalId } : {} });
      setData(d);
      setMonth((m) => (m && (d.months || []).includes(m) ? m : null));
    } catch (e) { toastError(e); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const goal = data && data.goal;
  const mi = goal && month ? data.months.indexOf(month) : -1;
  const daysLeft = goal ? (month ? data.monthTotals[mi].daysLeft : goal.daysLeft) : 0;
  // each row with the numbers of what is on screen: the semester or the chosen month
  const shown = useMemo(() => {
    if (!data || !data.goal) return { rows: [], totals: null };
    const rows = data.rows.map((r) => ({ ...r, p: month ? r.months[mi] : r }));
    if (month) rows.sort((a, b) => (b.p.pct ?? -1) - (a.p.pct ?? -1) || b.p.done - a.p.done);
    const t = month ? data.monthTotals[mi] : data.totals;
    return { rows: rows.filter((r) => r.p.target !== null || r.p.done > 0), totals: { ...t, daysLeft } };
  }, [data, month, mi, daysLeft]);
  const pace = useMemo(() => {
    if (!goal) return 0;
    const [a, b] = month ? monthRange(month, goal) : [goal.startsOn, goal.endsOn];
    return elapsedPct(a, b);
  }, [goal, month]);

  const heading = goal ? `${goal.title || "Matrículas por polo"}${month ? ` · ${cap(monthName(month))}` : ""}` : "";
  const rangeLabel = goal ? (month ? `${dm(monthRange(month, goal)[0])} até ${dm(monthRange(month, goal)[1])}` : `${dm(goal.startsOn)} até ${dm(goal.endsOn)}`) : "";
  const fileName = goal ? `matriculas-por-polo-${month || `${goal.startsOn}-${goal.endsOn}`}.png` : "matriculas.png";
  const withPng = (fn) => async () => {
    setBusy(true);
    try { await fn(await renderPng(shareRef.current, SHARE_WIDTH)); } catch (e) { toast.error("Não foi possível gerar a imagem. Tire um print da tela."); }
    setBusy(false);
  };
  const download = withPng(async (url) => { downloadPng(url, fileName); });
  const copyImage = withPng(async (url) => {
    try { await copyPng(url); toast.success("Imagem copiada. Cole na conversa do WhatsApp."); } catch (e) { downloadPng(url, fileName); toast.info("Este navegador não copia imagem; a imagem foi baixada."); }
  });
  const copyText = async () => {
    try { await navigator.clipboard.writeText(textFor(goal, shown.rows, shown.totals, heading, rangeLabel)); toast.success("Texto copiado. É só colar no grupo."); } catch (e) { toast.error("Não foi possível copiar."); }
  };
  const reload = () => { setDialog(null); load(goal && goal.id); };

  if (!data) return <MainContainer><MainHeader><Title>Metas</Title></MainHeader></MainContainer>;
  const { totals } = shown;

  return (
    <MainContainer>
      <MainHeader>
        <Title>Metas</Title>
        <MainHeaderButtonsWrapper>
          {manager && goal && <Button variant="outlined" startIcon={<ClipboardPaste size={16} />} onClick={() => setDialog("import")}>Carregar planilha</Button>}
          {manager && goal && <Button variant="contained" color="primary" startIcon={<Settings2 size={16} />} onClick={() => setDialog("all")}>Editar metas</Button>}
          {manager && <Button variant="outlined" startIcon={<Plus size={16} />} onClick={() => setDialog("period-new")}>Novo semestre</Button>}
        </MainHeaderButtonsWrapper>
      </MainHeader>

      <div className={classes.body}>
        <GoalsTabs current="polo" />
        {!goal && (
          <div className={classes.empty}>
            Ainda não há um período de metas por polo.{manager ? " Crie o semestre, defina o início e o fim, e carregue a planilha dos polos." : " A administração vai cadastrar as metas em breve."}
          </div>
        )}

        {goal && (
          <>
            <div className={classes.periods}>
              {data.periods.map((p) => (
                <button key={p.id} type="button" className={`${classes.chipBtn} ${p.id === goal.id ? classes.chipOn : ""}`} onClick={() => load(p.id)}>{p.title ? `${p.title} · ` : ""}{dm(p.startsOn)} – {dm(p.endsOn)}</button>
              ))}
              {manager && (
                <Tooltip title="Definir início, fim e dias úteis do período"><IconButton size="small" onClick={() => setDialog("period-edit")} aria-label="Editar período"><CalendarDays size={18} /></IconButton></Tooltip>
              )}
            </div>

            <div className={classes.months}>
              <button type="button" className={`${classes.monthBtn} ${!month ? classes.monthOn : ""}`} onClick={() => setMonth(null)}>
                Semestre
                <div className={classes.monthBar}><div style={{ width: `${Math.min(100, data.totals.pct || 0)}%`, height: "100%", background: !month ? "#FEF84C" : TONE.good.bg }} /></div>
              </button>
              {data.monthTotals.map((m) => (
                <button key={m.month} type="button" className={`${classes.monthBtn} ${month === m.month ? classes.monthOn : ""}`} onClick={() => setMonth(m.month)} title={`Meta ${m.target} · feitas ${m.done}`}>
                  {cap(monthShort(m.month))}
                  <div className={classes.monthBar}><div style={{ width: `${Math.min(100, m.pct || 0)}%`, height: "100%", background: month === m.month ? "#FEF84C" : TONE[m.status].bg }} /></div>
                </button>
              ))}
            </div>

            <div className={classes.hero}>
              <Ring pct={totals.pct} caption={month ? "do mês" : "da meta"} />
              <div>
                <div style={{ opacity: 0.8, fontSize: 14 }}>{heading} · {rangeLabel}</div>
                <div className={classes.heroNum}>{totals.done}<span style={{ fontSize: 22, opacity: 0.7, fontWeight: 600 }}> / {totals.target}</span></div>
                <div className={classes.heroSub}>
                  {totals.missing > 0 ? `Faltam ${totals.missing} matrículas${month ? " neste mês" : ""}` : month ? "Meta do mês batida" : "Meta geral batida"}
                  {totals.pct !== null && ` · ${totals.pct >= pace ? `${brDecimal(totals.pct - pace, 0)} pontos à frente do ritmo` : `${brDecimal(pace - totals.pct, 0)} pontos atrás do ritmo`}`}
                </div>
                <div className={classes.facts}>
                  <span className={classes.fact}><span className={classes.factN}>{daysLeft}</span>dias úteis restantes</span>
                  <span className={classes.fact}><span className={classes.factN}>{perDayLabel(totals.perDay)}</span>matrículas por dia</span>
                  {month ? (
                    <span className={classes.fact}><span className={classes.factN}>{data.totals.done}<span style={{ fontSize: 12, fontWeight: 500 }}> / {data.totals.target}</span></span>no semestre</span>
                  ) : (
                    <>
                      <span className={classes.fact}><span className={classes.factN}>{totals.inCourse}</span>em curso</span>
                      <span className={classes.fact}><span className={classes.factN}>{totals.canceled}<span style={{ fontSize: 12, fontWeight: 500 }}> · {brDecimal(totals.canceledPct)}%</span></span>cancelados ou transferidos</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className={classes.toolbar}>
              <div className={classes.seg}>
                <button type="button" className={`${classes.segBtn} ${view === "cards" ? classes.segOn : ""}`} onClick={() => setView("cards")}><LayoutGrid size={15} /> Cartões</button>
                <button type="button" className={`${classes.segBtn} ${view === "table" ? classes.segOn : ""}`} onClick={() => setView("table")}><Table2 size={15} /> Tabela</button>
              </div>
              <span style={{ flex: 1 }} />
              <Button size="small" variant="outlined" startIcon={<Copy size={15} />} onClick={copyText}>Copiar texto</Button>
              <Button size="small" variant="outlined" startIcon={<ImageDown size={15} />} onClick={download} disabled={busy}>Baixar imagem</Button>
              <Button size="small" variant="outlined" startIcon={<Copy size={15} />} onClick={copyImage} disabled={busy}>Copiar imagem</Button>
            </div>

            {shown.rows.length === 0 && <div className={classes.empty}>Nenhum polo com meta neste período.{manager ? " Use “Carregar planilha” ou “Editar metas”." : ""}</div>}

            {view === "cards" && shown.rows.length > 0 && (
              <div className={classes.grid}>
                {shown.rows.map((r, i) => {
                  const tone = TONE[r.p.status];
                  return (
                    <div key={r.poloId} className={classes.card}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span className={classes.rank}>{i + 1}</span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.name}>{shortName(r.name)}</div>
                          <div className={classes.hint}>{r.code ? `Código ${r.code} · ` : ""}{tone.label}</div>
                        </div>
                        <span className={classes.badge} style={{ background: tone.bg }}>{pctLabel(r.p.pct)}</span>
                        {manager && <Tooltip title="Atualizar a meta deste polo"><IconButton size="small" aria-label={`Editar ${r.name}`} onClick={() => setDialog({ polo: r })}><Pencil size={16} /></IconButton></Tooltip>}
                      </div>
                      <div className={classes.track} title={`Ritmo esperado hoje: ${Math.round(pace)}%`}>
                        <div className={classes.fill} style={{ width: `${Math.min(100, r.p.pct || 0)}%`, background: tone.bg }} />
                        <span className={classes.tick} style={{ left: `${pace}%` }} />
                      </div>
                      <div className={classes.nums}>
                        <div><div className={classes.numLabel}>Feitas</div><div className={classes.numVal}>{r.p.done}</div></div>
                        <div><div className={classes.numLabel}>Meta</div><div className={classes.numVal}>{r.p.target === null ? "—" : r.p.target}</div></div>
                        <div><div className={classes.numLabel}>{r.p.missing !== null && r.p.missing < 0 ? "Acima" : "Faltam"}</div><div className={classes.numVal} style={{ color: r.p.missing !== null && r.p.missing <= 0 ? "#15803d" : undefined }}>{r.p.missing === null ? "—" : Math.abs(r.p.missing)}</div></div>
                      </div>
                      {!month && r.target !== null && (
                        <div className={classes.strip} aria-label="Meta e feitas por mês">
                          {r.months.map((m, k) => {
                            const plan = planOfMonths(r, thisMonth())[k];
                            const shown = plan.kind === "current" ? `${plan.done || 0}/${plan.value}` : plan.value === null ? "" : String(plan.value);
                            const title = plan.kind === "past"
                              ? `${cap(monthName(m.month))}: ${m.done > 0 ? `${m.done} matrículas feitas` : "sem registro"}`
                              : `${cap(monthName(m.month))}: ${plan.done || 0} feitas de ${plan.value} previstas`;
                            return (
                              <button key={m.month} type="button" className={classes.stripCol} onClick={() => setMonth(m.month)} title={title}>
                                <div className={classes.stripNum} style={{ opacity: plan.kind === "future" ? 0.8 : 1 }}>{shown || "\u00a0"}</div>
                                <div className={classes.stripBar}><div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${Math.min(100, m.pct || 0)}%`, background: TONE[m.status].bg }} /></div>
                                {monthShort(m.month)}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <div className={classes.foot}>
                        <span>{perDayLabel(r.p.perDay)} por dia</span>
                        {!month && <span>{r.inCourse} em curso · {r.canceled} cancel.</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {view === "table" && shown.rows.length > 0 && (
              <div className={classes.tableWrap}>
                <table className={classes.table}>
                  <thead>
                    <tr>
                      <th>Código</th><th>Polo</th><th>Meta</th><th>Realizado</th><th>Faltam</th><th>% Progresso</th><th>Matrículas/dia</th>
                      {!month && <><th>Em curso</th><th>Cancelados</th><th>%</th></>}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.rows.map((r) => (
                      <tr key={r.poloId}>
                        <td>{r.code || "—"}</td><td style={{ fontWeight: 600 }}>{r.name}</td><td>{r.p.target === null ? "—" : r.p.target}</td><td>{r.p.done}</td><td>{r.p.missing === null ? "—" : r.p.missing}</td>
                        <td style={{ background: TONE[r.p.status].soft, fontWeight: 700, color: TONE[r.p.status].bg }}>{pctLabel(r.p.pct)}</td>
                        <td>{perDayLabel(r.p.perDay)}</td>
                        {!month && <><td>{r.inCourse}</td><td>{r.canceled}</td><td>{brDecimal(r.canceledPct)}%</td></>}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td /><td style={{ textAlign: "left" }}>TOTAL</td><td>{totals.target}</td><td>{totals.done}</td><td>{totals.missing}</td><td>{pctLabel(totals.pct)}</td><td>{perDayLabel(totals.perDay)}</td>
                      {!month && <><td>{totals.inCourse}</td><td>{totals.canceled}</td><td>{brDecimal(totals.canceledPct)}%</td></>}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <div className={classes.hint} style={{ marginTop: 12 }}>
              O traço em cada barra marca onde o polo deveria estar hoje, pelo tempo {month ? "do mês" : "do período"}. A meta do semestre é distribuída pelos meses; clique em um mês para ver a meta dele.
            </div>

            {shown.rows.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div className={classes.hint} style={{ marginBottom: 6, fontWeight: 600 }}>Imagem para o grupo</div>
                <div style={{ maxWidth: SHARE_WIDTH, borderRadius: 18, overflow: "hidden", boxShadow: "0 10px 30px rgba(11,66,121,.18)" }}>
                  <ShareFrame width={SHARE_WIDTH} innerRef={shareRef}><ShareCard rows={shown.rows} totals={totals} heading={heading} sub={rangeLabel} /></ShareFrame>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {manager && (
        <>
          <PeriodDialog open={dialog === "period-new" || dialog === "period-edit"} onClose={() => setDialog(null)} goal={dialog === "period-edit" ? goal : null} onSaved={(id) => { setDialog(null); load(id); }} />
          <EditDialog open={dialog === "all"} onClose={() => setDialog(null)} data={data} onSaved={reload} />
          {goal && <ImportDialog open={dialog === "import"} onClose={() => setDialog(null)} goal={goal} onSaved={reload} />}
          <PoloDialog open={!!dialog && !!dialog.polo} onClose={() => setDialog(null)} row={dialog && dialog.polo} data={data} onSaved={reload} />
        </>
      )}
    </MainContainer>
  );
};

export default PoloGoals;
