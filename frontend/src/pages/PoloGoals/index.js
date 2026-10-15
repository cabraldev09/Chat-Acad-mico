import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, makeStyles } from "@material-ui/core";
import { Copy, ImageDown, LayoutGrid, Pencil, Share2, Table2, Trash2 } from "lucide-react";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import ShareFrame from "../../components/ShareFrame";
import BrandLogo from "../../components/BrandLogo";
import { AuthContext } from "../../context/Auth/AuthContext";
import { isManager } from "../../utils/access";
import { brDecimal, copyPng, downloadPng, renderPng, sharePng } from "../../utils/shareImage";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const SHARE_WIDTH = 640;
const WORK_DAYS = [[5, "Segunda a sexta"], [6, "Segunda a sábado"], [7, "Todos os dias"]];
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
const missingLabel = (r) => (r.missing === null ? "—" : r.missing < 0 ? `+${Math.abs(r.missing)}` : r.missing);

// how much of the period has passed (calendar days)
const elapsed = (goal) => {
  const t = new Date(`${goal.startsOn}T12:00:00`).getTime();
  const e = new Date(`${goal.endsOn}T12:00:00`).getTime();
  const now = Date.now();
  return Math.min(100, Math.max(0, ((now - t) / (e - t)) * 100));
};

const useStyles = makeStyles((theme) => ({
  body: { flex: 1, overflowY: "auto", overflowX: "hidden", ...theme.scrollbarStyles, paddingBottom: theme.spacing(3) },
  periods: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: theme.spacing(2) },
  chipBtn: { border: theme.border.divider, background: "transparent", color: "inherit", borderRadius: 999, padding: "6px 14px", cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, "&:hover": { background: theme.palette.action.hover } },
  chipOn: { background: theme.palette.primary.main, color: "#fff", borderColor: theme.palette.primary.main, "&:hover": { background: theme.palette.primary.main } },
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
  tableWrap: { overflowX: "auto", background: theme.palette.cards.background, border: theme.border.divider, borderRadius: 16 },
  table: { borderCollapse: "collapse", width: "100%", minWidth: 940, fontSize: 13.5, fontVariantNumeric: "tabular-nums", "& th": { background: "#4a90d9", color: "#fff", fontWeight: 600, padding: "10px 12px", textAlign: "center", whiteSpace: "nowrap" }, "& td": { padding: "9px 12px", textAlign: "center", borderBottom: theme.border.divider }, "& td:nth-child(2), & th:nth-child(2)": { textAlign: "left" }, "& tfoot td": { fontWeight: 700, background: theme.palette.action.hover } },
  hint: { fontSize: 12.5, color: theme.palette.text.secondary },
  empty: { textAlign: "center", color: theme.palette.text.secondary, padding: theme.spacing(6, 2) },
  editRow: { display: "grid", gridTemplateColumns: "minmax(160px,1.6fr) 92px 92px 92px 36px", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: theme.border.divider, [theme.breakpoints.down("xs")]: { gridTemplateColumns: "1fr 1fr 1fr 36px" } },
}));

// the ring on the hero: how much of the total target is done
const Ring = ({ pct, size = 150 }) => {
  const r = (size - 16) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.min(100, pct || 0);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${pctLabel(pct)} da meta`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="12" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#FEF84C" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dasharray .8s cubic-bezier(.2,.8,.2,1)" }} />
      <text x="50%" y="48%" textAnchor="middle" fill="#fff" style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.03em" }}>{pct === null || pct === undefined ? "—" : `${Math.round(pct)}%`}</text>
      <text x="50%" y="63%" textAnchor="middle" fill="rgba(255,255,255,.75)" style={{ fontSize: 12 }}>da meta</text>
    </svg>
  );
};

// the picture that goes to the group: its own colours, whatever the theme
const ShareCard = ({ data }) => {
  const { goal, rows, totals } = data;
  return (
    <div style={{ background: "#fff", color: "#0b1a2e", fontFamily: "Geist, system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "22px 30px 18px" }}>
        <BrandLogo height={46} tone="color" />
        <div style={{ textAlign: "right", fontSize: 14, color: "#4b5d73" }}>{dm(goal.startsOn)} até {dm(goal.endsOn)}</div>
      </div>
      <div style={{ background: "linear-gradient(135deg, #0B4279, #0693E3)", color: "#fff", padding: "20px 30px 22px" }}>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em" }}>{goal.title || "Matrículas por polo"}</div>
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
            <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.target === null ? "—" : r.target}</span>
            <span style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{r.done}</span>
            <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: r.missing !== null && r.missing <= 0 ? "#15803d" : "#0b1a2e" }}>{missingLabel(r)}</span>
            <span style={{ textAlign: "right" }}>
              <span style={{ display: "inline-block", minWidth: 76, textAlign: "center", borderRadius: 999, padding: "3px 8px", fontSize: 14, fontWeight: 700, color: "#fff", background: TONE[r.status].bg, fontVariantNumeric: "tabular-nums" }}>{pctLabel(r.pct)}</span>
            </span>
          </div>
        ))}
      </div>
      <div style={{ background: "#f4f8fc", padding: "14px 30px", display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600, marginTop: 8, whiteSpace: "nowrap", gap: 12 }}>
        <span>{goal.daysLeft} dia{goal.daysLeft === 1 ? "" : "s"} útei{goal.daysLeft === 1 ? "l" : "s"}</span>
        <span>{totals.perDay === null ? "—" : brDecimal(totals.perDay, 1)} matrículas/dia</span>
        <span>{totals.leadsPerDay === null ? "—" : brDecimal(totals.leadsPerDay, 0)} leads/dia</span>
      </div>
    </div>
  );
};

const textFor = (data) => {
  const { goal, rows, totals } = data;
  const head =
    `📊 ${goal.title || "Matrículas por polo"} — ${dm(goal.startsOn)} até ${dm(goal.endsOn)}\n\n` +
    `Meta total: ${totals.target}\nRealizado: ${totals.done}\nFaltam: ${Math.max(0, totals.missing)}\nProgresso geral: ${pctLabel(totals.pct)}\n` +
    `Dias úteis restantes: ${goal.daysLeft}\nPrecisamos de: ${totals.perDay === null ? "—" : brDecimal(totals.perDay, 1)} matrículas por dia`;
  const rank = rows.map((r) => `${TONE[r.status].dot} ${shortName(r.name)}: ${r.done}/${r.target === null ? "—" : r.target} — ${pctLabel(r.pct)}`).join("\n");
  return `${head}\n\n🏆 Ranking dos polos\n\n${rank}`;
};

// administration: targets, hand adjustments and cancellations of every polo of the period
const EditDialog = ({ open, onClose, data, onSaved }) => {
  const classes = useStyles();
  const [rows, setRows] = useState([]);
  const [workDays, setWorkDays] = useState(5);
  const [saving, setSaving] = useState(false);
  const [add, setAdd] = useState("");
  useEffect(() => {
    if (!open || !data) return;
    setWorkDays(data.goal.workDays);
    setRows(data.rows.map((r) => ({ poloId: r.poloId, name: r.name, code: r.code, target: r.target === null ? "" : r.target, manual: r.manual, canceled: r.canceled, auto: r.auto })));
    setAdd("");
  }, [open, data]);
  const set = (i, patch) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const free = (data ? data.available : []).filter((p) => !rows.some((r) => r.poloId === p.id));
  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/goals/${data.goal.id}/polos`, {
        workDays,
        rows: rows.map((r) => ({ poloId: r.poloId, target: r.target === "" ? null : Number(r.target), manual: Number(r.manual || 0), canceled: Number(r.canceled || 0) })),
      });
      toast.success("Metas dos polos salvas.");
      onSaved();
    } catch (e) { toastError(e); }
    setSaving(false);
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper">
      <DialogTitle>Editar metas por polo</DialogTitle>
      <DialogContent dividers>
        <TextField select size="small" variant="outlined" label="Dias úteis do período" value={workDays} onChange={(e) => setWorkDays(Number(e.target.value))} style={{ minWidth: 220, marginBottom: 12 }}>
          {WORK_DAYS.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
        </TextField>
        <div className={`${classes.editRow} ${classes.hint}`} style={{ fontWeight: 600 }}><span>Polo</span><span>Meta</span><span title="Matrículas que não estão no CRM">Ajuste (+)</span><span>Cancelados</span><span /></div>
        {rows.map((r, i) => (
          <div className={classes.editRow} key={r.poloId}>
            <div><div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div><div className={classes.hint}>{r.code ? `Código ${r.code} · ` : ""}{r.auto} no CRM</div></div>
            <TextField size="small" variant="outlined" type="number" inputProps={{ min: 0 }} value={r.target} onChange={(e) => set(i, { target: e.target.value })} />
            <TextField size="small" variant="outlined" type="number" inputProps={{ min: 0 }} value={r.manual} onChange={(e) => set(i, { manual: e.target.value })} />
            <TextField size="small" variant="outlined" type="number" inputProps={{ min: 0 }} value={r.canceled} onChange={(e) => set(i, { canceled: e.target.value })} />
            <Button size="small" aria-label="Tirar polo" style={{ minWidth: 0 }} onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}><Trash2 size={16} /></Button>
          </div>
        ))}
        {free.length > 0 && (
          <TextField select size="small" variant="outlined" label="Adicionar polo" value={add} style={{ minWidth: 260, marginTop: 14 }}
            onChange={(e) => { const p = free.find((x) => x.id === Number(e.target.value)); if (p) setRows((rs) => [...rs, { poloId: p.id, name: p.name, code: p.code, target: "", manual: 0, canceled: 0, auto: 0 }]); setAdd(""); }}>
            {free.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </TextField>
        )}
        <div className={classes.hint} style={{ marginTop: 12 }}>
          As matrículas vêm sozinhas do CRM: contam quando o lead é matriculado e tem o polo escolhido. Use “Ajuste” para somar o que está fora do CRM e “Cancelados” para os cancelamentos e transferências; os alunos em curso são a diferença.
        </div>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="contained" color="primary" onClick={save} disabled={saving}>Salvar</Button>
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
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const shareRef = useRef(null);

  const load = useCallback(async (goalId) => {
    try {
      const { data: d } = await api.get("/goals/polos", { params: goalId ? { goalId } : {} });
      setData(d);
    } catch (e) { toastError(e); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const pace = useMemo(() => (data && data.goal ? elapsed(data.goal) : 0), [data]);

  const makePng = async () => renderPng(shareRef.current, SHARE_WIDTH);
  const fileName = data && data.goal ? `matriculas-por-polo-${data.goal.startsOn}-${data.goal.endsOn}.png` : "matriculas.png";
  const withPng = (fn) => async () => {
    setBusy(true);
    try { await fn(await makePng()); } catch (e) { toast.error("Não foi possível gerar a imagem. Tire um print da tela."); }
    setBusy(false);
  };
  const download = withPng(async (url) => { downloadPng(url, fileName); });
  const copyImage = withPng(async (url) => {
    try { await copyPng(url); toast.success("Imagem copiada. Cole na conversa do WhatsApp."); } catch (e) { downloadPng(url, fileName); toast.info("Este navegador não copia imagem; a imagem foi baixada."); }
  });
  const share = withPng(async (url) => {
    const ok = await sharePng(url, fileName, textFor(data)).catch(() => true);
    if (!ok) { downloadPng(url, fileName); toast.info("Imagem baixada. Envie pelo WhatsApp."); }
  });
  const copyText = async () => {
    try { await navigator.clipboard.writeText(textFor(data)); toast.success("Texto copiado. É só colar no grupo."); } catch (e) { toast.error("Não foi possível copiar."); }
  };

  if (!data) return <MainContainer><MainHeader><Title>Metas por polo</Title></MainHeader></MainContainer>;
  const { goal, rows, totals } = data;

  return (
    <MainContainer>
      <MainHeader>
        <Title>Metas por polo</Title>
        <MainHeaderButtonsWrapper>
          {manager && goal && <Button variant="contained" color="primary" startIcon={<Pencil size={16} />} onClick={() => setEditing(true)}>Editar metas</Button>}
        </MainHeaderButtonsWrapper>
      </MainHeader>

      <div className={classes.body}>
        {!goal && (
          <div className={classes.empty}>
            Ainda não há um período de metas.{manager ? " Crie um em Metas da equipe e volte aqui para definir a meta de cada polo." : " A administração vai cadastrar as metas em breve."}
          </div>
        )}

        {goal && (
          <>
            <div className={classes.periods}>
              {data.periods.map((p) => (
                <button key={p.id} type="button" className={`${classes.chipBtn} ${p.id === goal.id ? classes.chipOn : ""}`} onClick={() => load(p.id)}>{dm(p.startsOn)} – {dm(p.endsOn)}{p.title ? ` · ${p.title}` : ""}</button>
              ))}
            </div>

            <div className={classes.hero}>
              <Ring pct={totals.pct} />
              <div>
                <div style={{ opacity: 0.8, fontSize: 14 }}>{goal.title || "Matrículas por polo"} · {dm(goal.startsOn)} até {dm(goal.endsOn)}</div>
                <div className={classes.heroNum}>{totals.done}<span style={{ fontSize: 22, opacity: 0.7, fontWeight: 600 }}> / {totals.target}</span></div>
                <div className={classes.heroSub}>
                  {totals.missing > 0 ? `Faltam ${totals.missing} matrículas` : "Meta geral batida"}
                  {totals.pct !== null && ` · ${totals.pct >= pace ? `${brDecimal(totals.pct - pace, 0)} pontos à frente do ritmo` : `${brDecimal(pace - totals.pct, 0)} pontos atrás do ritmo`}`}
                </div>
                <div className={classes.facts}>
                  <span className={classes.fact}><span className={classes.factN}>{goal.daysLeft}</span>dias úteis restantes</span>
                  <span className={classes.fact}><span className={classes.factN}>{perDayLabel(totals.perDay)}</span>matrículas por dia</span>
                  <span className={classes.fact}><span className={classes.factN}>{totals.leadsPerDay === null ? "—" : brDecimal(totals.leadsPerDay, 0)}</span>leads por dia</span>
                  <span className={classes.fact}><span className={classes.factN}>{totals.inCourse}</span>em curso</span>
                  <span className={classes.fact}><span className={classes.factN}>{totals.canceled}<span style={{ fontSize: 12, fontWeight: 500 }}> · {brDecimal(totals.canceledPct)}%</span></span>cancelados ou transferidos</span>
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
              <Button size="small" variant="contained" color="primary" startIcon={<Share2 size={15} />} onClick={share} disabled={busy}>Enviar no WhatsApp</Button>
            </div>

            {rows.length === 0 && <div className={classes.empty}>Nenhum polo com meta neste período.{manager ? " Use “Editar metas” para definir." : ""}</div>}

            {view === "cards" && rows.length > 0 && (
              <div className={classes.grid}>
                {rows.map((r, i) => {
                  const tone = TONE[r.status];
                  return (
                    <div key={r.poloId} className={classes.card}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span className={classes.rank}>{i + 1}</span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.name}>{shortName(r.name)}</div>
                          <div className={classes.hint}>{r.code ? `Código ${r.code} · ` : ""}{tone.label}</div>
                        </div>
                        <span className={classes.badge} style={{ background: tone.bg }}>{pctLabel(r.pct)}</span>
                      </div>
                      <div className={classes.track} title={`Ritmo esperado hoje: ${Math.round(pace)}%`}>
                        <div className={classes.fill} style={{ width: `${Math.min(100, r.pct || 0)}%`, background: tone.bg }} />
                        <span className={classes.tick} style={{ left: `${pace}%` }} />
                      </div>
                      <div className={classes.nums}>
                        <div><div className={classes.numLabel}>Feitas</div><div className={classes.numVal}>{r.done}</div></div>
                        <div><div className={classes.numLabel}>Meta</div><div className={classes.numVal}>{r.target === null ? "—" : r.target}</div></div>
                        <div><div className={classes.numLabel}>{r.missing !== null && r.missing < 0 ? "Acima" : "Faltam"}</div><div className={classes.numVal} style={{ color: r.missing !== null && r.missing <= 0 ? "#15803d" : undefined }}>{r.missing === null ? "—" : Math.abs(r.missing)}</div></div>
                      </div>
                      <div className={classes.foot}>
                        <span>{perDayLabel(r.perDay)}/dia · {r.leadsPerDay === null ? "—" : brDecimal(r.leadsPerDay, 1)} leads/dia</span>
                        <span>{r.inCourse} em curso · {r.canceled} cancel.</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {view === "table" && rows.length > 0 && (
              <div className={classes.tableWrap}>
                <table className={classes.table}>
                  <thead>
                    <tr><th>Código</th><th>Polo</th><th>Meta</th><th>Realizado</th><th>Faltam</th><th>% Progresso</th><th>Matrículas/dia</th><th>Leads/dia</th><th>Em curso</th><th>Cancelados</th><th>%</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.poloId}>
                        <td>{r.code || "—"}</td><td style={{ fontWeight: 600 }}>{r.name}</td><td>{r.target === null ? "—" : r.target}</td><td>{r.done}</td><td>{r.missing === null ? "—" : r.missing}</td>
                        <td style={{ background: TONE[r.status].soft, fontWeight: 700, color: TONE[r.status].bg }}>{pctLabel(r.pct)}</td>
                        <td>{perDayLabel(r.perDay)}</td><td>{r.leadsPerDay === null ? "—" : brDecimal(r.leadsPerDay)}</td><td>{r.inCourse}</td><td>{r.canceled}</td><td>{brDecimal(r.canceledPct)}%</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td /><td style={{ textAlign: "left" }}>TOTAL</td><td>{totals.target}</td><td>{totals.done}</td><td>{totals.missing}</td><td>{pctLabel(totals.pct)}</td>
                      <td>{perDayLabel(totals.perDay)}</td><td>{totals.leadsPerDay === null ? "—" : brDecimal(totals.leadsPerDay)}</td><td>{totals.inCourse}</td><td>{totals.canceled}</td><td>{brDecimal(totals.canceledPct)}%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <div className={classes.hint} style={{ marginTop: 12 }}>
              O traço em cada barra marca onde o polo deveria estar hoje, pelo tempo do período. Leads por dia usa a taxa de matrícula dos últimos 120 dias ({brDecimal(data.leadsPerEnrollment, 1)} leads para cada matrícula).
            </div>

            {rows.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div className={classes.hint} style={{ marginBottom: 6, fontWeight: 600 }}>Imagem para o grupo</div>
                <div style={{ maxWidth: SHARE_WIDTH, borderRadius: 18, overflow: "hidden", boxShadow: "0 10px 30px rgba(11,66,121,.18)" }}>
                  <ShareFrame width={SHARE_WIDTH} innerRef={shareRef}><ShareCard data={data} /></ShareFrame>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {manager && <EditDialog open={editing} onClose={() => setEditing(false)} data={data} onSaved={() => { setEditing(false); load(goal && goal.id); }} />}
    </MainContainer>
  );
};

export default PoloGoals;
