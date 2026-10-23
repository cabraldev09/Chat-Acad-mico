import { fillDays } from "../../utils/chartDays";
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useHistory } from "react-router-dom";
import { Typography, TextField, MenuItem, makeStyles, Table, TableHead, TableRow, TableCell, TableBody, Button, Menu } from "@material-ui/core";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Cell, PieChart, Pie, Legend,
} from "recharts";
import { AlertTriangle, Hourglass, UserX, Flame, Download, CircleDollarSign, FileWarning, Sprout, RefreshCw, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { format, subDays, startOfMonth } from "date-fns";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import GlowCard from "../../components/GlowCard";
import TopLoader from "../../components/TopLoader";
import NumberTicker from "../../components/NumberTicker";
import { AuthContext } from "../../context/Auth/AuthContext";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { downloadFile } from "../../utils/saveBlob";
import { useCrmOptions, SourceIcon, StagePill, ago } from "./shared";
import { tint } from "../../utils/color";
import NotALead from "./NotALead";

const useStyles = makeStyles((theme) => {
  const dark = theme.palette.type === "dark";
  const line = dark ? "rgba(255,255,255,.09)" : "#e3e9f1";
  const soft = dark ? "rgba(255,255,255,.05)" : "#f1f4f8";
  return {
    scroll: { flex: 1, overflowY: "auto", overflowX: "hidden", padding: theme.spacing(1, 1, 3), ...theme.scrollbarStyles },
    // changing a filter: the numbers dim and settle back instead of jumping (nothing moves, so the page keeps its place)
    content: {
      transition: "opacity .45s cubic-bezier(.2,.8,.2,1), transform .45s cubic-bezier(.2,.8,.2,1), filter .45s ease",
      "@media (prefers-reduced-motion: reduce)": { transition: "none" },
    },
    contentBusy: { opacity: 0.55, transform: "translateY(3px)", filter: "saturate(.75)", pointerEvents: "none" },
    label: { fontSize: 13, color: theme.palette.text.secondary, fontWeight: 500 },
    chips: { display: "inline-flex", gap: 4, padding: 3, borderRadius: 12, background: soft, border: `1px solid ${line}` },
    chip: {
      border: 0, background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: theme.palette.text.secondary, padding: "5px 12px", borderRadius: 9,
      "&:hover": { color: theme.palette.text.primary },
    },
    chipOn: { background: dark ? "#0f1826" : "#ffffff", color: theme.palette.text.primary, boxShadow: dark ? "none" : "0 1px 3px rgba(11,26,46,.12)" },
    sectionHead: { display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", margin: theme.spacing(2.5, 0, 1) },
    sectionTitle: { fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em" },
    sectionHint: { fontSize: 12.5, color: theme.palette.text.secondary },
    alerts: { display: "grid", gap: theme.spacing(1.25), gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" },
    alert: {
      padding: theme.spacing(1.5, 2), display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left", transition: "transform .15s",
      "&:hover": { transform: "translateY(-1px)" }, "&:focus-visible": { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
    },
    alertIcon: { width: 36, height: 36, borderRadius: 10, display: "grid", placeItems: "center", flex: "none" },
    triageRow: { display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderTop: `1px solid ${line}`, flexWrap: "wrap", "&:first-of-type": { borderTop: 0 } },
    band: { display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", [theme.breakpoints.down("md")]: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }, [theme.breakpoints.down("xs")]: { gridTemplateColumns: "1fr" } },
    cell: { padding: theme.spacing(2), borderRight: `1px solid ${line}`, borderBottom: `1px solid ${line}`, minWidth: 0 },
    cellVal: { fontSize: 32, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.15, marginTop: 4, fontVariantNumeric: "tabular-nums" },
    delta: { display: "inline-flex", alignItems: "center", gap: 2, fontSize: 12, fontWeight: 700, padding: "1px 7px", borderRadius: 999 },
    grid: { display: "grid", gap: theme.spacing(1.5), gridTemplateColumns: "repeat(12, 1fr)" },
    card: { padding: theme.spacing(2) },
    chart: { height: 250 },
    funnelRow: { display: "grid", gridTemplateColumns: "150px 1fr 90px", alignItems: "center", gap: 10, padding: "5px 0", fontSize: 13.5 },
    bar: { height: 22, borderRadius: 6, transition: "width 1s cubic-bezier(.2,.8,.2,1)", minWidth: 4 },
    lane: { display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", marginBottom: 8, borderRadius: 8, background: "rgba(245,165,36,.12)", fontSize: 13, cursor: "pointer" },
    error: { margin: theme.spacing(2), padding: theme.spacing(2), display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
    miniBar: { height: 6, borderRadius: 4, background: soft, overflow: "hidden", minWidth: 50 },
  };
});

const span = (n) => ({ gridColumn: `span ${n}`, minWidth: 0 });
const mins = (m) => {
  if (m === null || m === undefined) return "—";
  if (m < 1) return "menos de 1 min";
  if (m < 60) return `${Math.round(m)} min`;
  if (m < 1440) return `${(m / 60).toFixed(1).replace(".", ",")} h`;
  return `${(m / 1440).toFixed(1).replace(".", ",")} d`;
};
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1).replace(".", ",")}%` : "—");
const PIE = ["#0B4279", "#0693E3", "#FEF84C", "#6366f1", "#f97316", "#14b8a6", "#ec4899", "#64748b", "#84cc16"];
const GREEN = "#16a34a";
const AMBER = "#d97706";
const RED = "#dc2626";

// first contact: green up to 15 min, amber up to an hour, red beyond
const contactTone = (m) => (m === null || m === undefined ? undefined : m <= 15 ? GREEN : m <= 60 ? AMBER : RED);

// the change against the period right before: arrow and percentage (points for a rate)
const Delta = ({ now, before, points = false, goodWhenDown = false }) => {
  const c = useStyles();
  if (before === undefined || before === null) return null;
  if (!before && !now) return <span className={c.delta} style={{ background: "rgba(100,116,139,.14)", color: "#64748b" }}><Minus size={12} /> igual</span>;
  const diff = points ? now - before : before ? ((now - before) / before) * 100 : 100;
  const up = diff > 0.05;
  const down = diff < -0.05;
  const good = goodWhenDown ? down : up;
  const bad = goodWhenDown ? up : down;
  const color = good ? GREEN : bad ? RED : "#64748b";
  const text = !before && !points ? "novo" : `${diff > 0 ? "+" : ""}${Math.abs(diff) >= 10 ? Math.round(diff) : diff.toFixed(1).replace(".", ",")}${points ? " p.p." : "%"}`;
  return (
    <span className={c.delta} style={{ background: `${color}22`, color }} title="Em relação ao período anterior de mesma duração">
      {up ? <ArrowUpRight size={12} /> : down ? <ArrowDownRight size={12} /> : <Minus size={12} />} {text}
    </span>
  );
};

const Spark = ({ data, color }) => (
  <div style={{ height: 34, marginTop: 6 }} aria-hidden="true">
    <ResponsiveContainer>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.8} fill={color} fillOpacity={0.14} animationDuration={1100} animationEasing="ease-out" />
      </AreaChart>
    </ResponsiveContainer>
  </div>
);

const SectionHead = ({ title, hint, color = "#0693E3" }) => {
  const c = useStyles();
  return (
    <div className={c.sectionHead}>
      <span style={{ width: 5, height: 20, borderRadius: 3, background: color, alignSelf: "center", flex: "none" }} />
      <span className={c.sectionTitle}>{title}</span>
      {hint && <span className={c.sectionHint}>{hint}</span>}
    </div>
  );
};

const todayStr = () => format(new Date(), "yyyy-MM-dd");

const Panel = () => {
  const { user: me } = useContext(AuthContext);
  const canExport = !!me && me.role !== "tutor";
  const classes = useStyles();
  const history = useHistory();
  const { courses, users } = useCrmOptions();
  const [from, setFrom] = useState(format(subDays(new Date(), 29), "yyyy-MM-dd"));
  const [to, setTo] = useState(todayStr());
  const [ownerId, setOwnerId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [d, setD] = useState(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exportEl, setExportEl] = useState(null);

  // quick periods; the one that matches the dates on screen is marked
  const presets = useMemo(() => {
    const t = new Date();
    const semesterStart = new Date(t.getFullYear(), t.getMonth() < 6 ? 0 : 6, 1);
    return [
      ["7 dias", format(subDays(t, 6), "yyyy-MM-dd")],
      ["30 dias", format(subDays(t, 29), "yyyy-MM-dd")],
      ["Este mês", format(startOfMonth(t), "yyyy-MM-dd")],
      ["Semestre", format(semesterStart, "yyyy-MM-dd")],
    ];
  }, []);

  // downloads the report (opens in Excel) for the period on screen
  const exportReport = async (groupBy) => {
    setExportEl(null);
    await downloadFile("/crm/report", { from, to, groupBy, format: "csv" }, `relatorio-${groupBy === "polo" ? "polos" : "consultores"}-${from}-a-${to}.csv`);
  };

  const ticket = useRef(0);
  const load = useCallback(() => {
    const mine = ++ticket.current;
    setLoading(true);
    setFailed(false);
    api.get("/crm/metrics", { params: { from, to, ownerId: ownerId || undefined, courseId: courseId || undefined } })
      .then(({ data }) => { if (mine === ticket.current) setD(data); })
      .catch((err) => { if (mine === ticket.current) { setFailed(true); toastError(err); } })
      .finally(() => { if (mine === ticket.current) setLoading(false); });
  }, [from, to, ownerId, courseId]);
  useEffect(() => {
    // the first load is at once; after that a short wait keeps typing a date from firing one request per digit
    const t = setTimeout(load, d ? 160 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const byDay = {};
  (d?.created || []).forEach((r) => { const k = String(r.day).slice(0, 10); byDay[k] = { ...byDay[k], leads: Number(r.total) }; });
  (d?.wonDaily || []).forEach((r) => { const k = String(r.day).slice(0, 10); byDay[k] = { ...byDay[k], matriculas: Number(r.total) }; });
  const series = fillDays(from, to, byDay, { leads: 0, matriculas: 0 });
  // "reached stage" = leads now in this stage or any later one (enrolled included). The column of the people an affiliate
  // referred comes before the funnel (it only holds them until the first contact), so it is not a step of it.
  const lane = d ? d.funnel.find((f) => f.isAffiliateLane) : null;
  const steps = d ? d.funnel.filter((f) => f.type !== "lost" && !f.isAffiliateLane) : [];
  const reached = steps.map((f, i) => ({ ...f, reached: steps.slice(i).reduce((a, x) => a + x.total, 0) }));
  const lostTotal = d ? d.funnel.filter((f) => f.type === "lost").reduce((a, x) => a + x.total, 0) : 0;
  const maxFunnel = Math.max(1, ...reached.map((f) => f.reached));
  const wonInPeriod = (d?.wonDaily || []).reduce((a, r) => a + Number(r.total || 0), 0);
  const sparkLeads = series.map((r) => ({ v: r.leads || 0 }));
  const sparkWon = series.map((r) => ({ v: r.matriculas || 0 }));
  const prev = d?.previous;
  const reload = () => { load(); };

  const alerts = d ? [
    [Hourglass, "Aguardando 1º contato", d.attention.waitingFirstContact, AMBER, "rgba(217,119,6,.14)", "/crm"],
    [AlertTriangle, "Tarefas atrasadas", d.attention.overdueTasks, RED, "rgba(220,38,38,.12)", "/crm/tarefas"],
    [Flame, "Leads esfriando (+3 dias)", d.attention.stale, "#0693E3", "rgba(6,147,227,.12)", "/crm?followUp=overdue"],
    [UserX, "Sem responsável", d.attention.unassigned ?? d.kpi.unassigned, "#64748b", "rgba(100,116,139,.14)", "/crm"],
    [CircleDollarSign, "Taxa de matrícula pendente", d.attention.feePending, "#E5484D", "rgba(229,72,77,.12)", d.attention.feeTagId ? `/crm?tagId=${d.attention.feeTagId}` : "/crm"],
    [FileWarning, "Documentos pendentes", d.attention.docsPending, "#b45309", "rgba(245,158,11,.16)", d.attention.docsTagId ? `/crm?tagId=${d.attention.docsTagId}` : "/crm"],
  ] : [];

  return (
    <MainContainer>
      <MainHeader>
        <Title>Painel do CRM</Title>
        <MainHeaderButtonsWrapper>
          <div className={classes.chips} role="group" aria-label="Período">
            {presets.map(([label, start]) => (
              <button key={label} type="button" className={`${classes.chip} ${from === start && to === todayStr() ? classes.chipOn : ""}`} onClick={() => { setFrom(start); setTo(todayStr()); }}>{label}</button>
            ))}
          </div>
          <TextField size="small" type="date" label="De" variant="outlined" InputLabelProps={{ shrink: true }} value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
          <TextField size="small" type="date" label="Até" variant="outlined" InputLabelProps={{ shrink: true }} value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
          <TextField select size="small" label="Consultor" variant="outlined" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} style={{ minWidth: 130 }}>
            <MenuItem value="">Todos</MenuItem>{users.map((u) => (<MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>))}
          </TextField>
          <TextField select size="small" label="Curso" variant="outlined" value={courseId} onChange={(e) => setCourseId(e.target.value)} style={{ minWidth: 130 }}>
            <MenuItem value="">Todos</MenuItem>{courses.map((c) => (<MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>))}
          </TextField>
          {canExport && <Button variant="outlined" startIcon={<Download size={16} />} onClick={(e) => setExportEl(e.currentTarget)}>Exportar</Button>}
          <Menu anchorEl={exportEl} open={Boolean(exportEl)} onClose={() => setExportEl(null)} getContentAnchorEl={null} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
            <MenuItem onClick={() => exportReport("owner")}>Por consultor (planilha)</MenuItem>
            <MenuItem onClick={() => exportReport("polo")}>Por polo (planilha)</MenuItem>
          </Menu>
        </MainHeaderButtonsWrapper>
      </MainHeader>

      <TopLoader active={loading} />
      {failed && !d && (
        <GlowCard className={classes.error}>
          <Typography>Não foi possível carregar o painel.</Typography>
          <Button variant="outlined" startIcon={<RefreshCw size={16} />} onClick={load}>Tentar de novo</Button>
        </GlowCard>
      )}
      {d && (
        <div className={classes.scroll}>
         <div className={`${classes.content} ${loading ? classes.contentBusy : ""}`} aria-busy={loading}>
          <SectionHead color="#d97706" title="Pontos de atenção" hint="Situação de agora, não muda com o período escolhido" />
          <div className={classes.alerts}>
            {alerts.map(([Icon, label, value, fg, bg, to2]) => (
              <GlowCard key={label} tone={fg} className={classes.alert} role="button" tabIndex={0} onClick={() => history.push(to2)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); history.push(to2); } }}>
                <span className={classes.alertIcon} style={{ background: bg, color: fg }}><Icon size={18} /></span>
                <div>
                  <div className={classes.label}>{label}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: value ? fg : "#94a3b8", fontVariantNumeric: "tabular-nums" }}><NumberTicker value={value || 0} /></div>
                </div>
              </GlowCard>
            ))}
          </div>

          {d.triage && d.triage.length > 0 && (
            <>
              <SectionHead color="#6366f1" title="Novos para conferir" hint="Os seus leads novos que ninguém atendeu ainda. Cada consultor confere os seus no mesmo dia, antes do dia fechar: se for amigo ou da equipe, tire do funil para não contar como lead." />
              <GlowCard className={classes.card}>
                {d.triage.map((t) => (
                  <div key={t.id} className={classes.triageRow}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontWeight: 600, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{t.name}{t.ownerName && <span className={classes.label} style={{ fontSize: 12 }}>· {t.ownerName}</span>}{t.late && <StagePill stage={{ name: "Passou do dia", color: "#dc2626" }} size="sm" solid={false} />}<StagePill stage={{ name: "Novo · sem atendimento", color: "#d97706" }} size="sm" solid={false} /></div>
                      <div className={classes.label} style={{ fontSize: 12.5 }}>
                        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><SourceIcon source={t.source} />{t.source}</span>
                        {t.phone ? ` · ${t.phone}` : ""} · chegou {ago(t.createdAt)}
                      </div>
                    </div>
                    <Button size="small" variant="outlined" onClick={() => history.push(`/crm?lead=${t.id}`)}>Abrir</Button>
                    <NotALead lead={t} compact onDone={reload} />
                  </div>
                ))}
                {d.attention.waitingFirstContact > d.triage.length && (
                  <Button size="small" style={{ marginTop: 8 }} onClick={() => history.push("/crm")}>Ver os {d.attention.waitingFirstContact} que aguardam no funil</Button>
                )}
              </GlowCard>
            </>
          )}

          <SectionHead color="#16a34a" title="Resultados do período" hint="Dos leads que entraram entre as datas escolhidas, quantos já se matricularam. A seta compara com o período anterior." />
          <GlowCard style={{ padding: 0, overflow: "hidden" }}>
            <div className={classes.band}>
              <div className={classes.cell}>
                <div className={classes.label}>Leads captados</div>
                <div className={classes.cellVal} style={{ color: "#0693E3" }}><NumberTicker value={d.kpi.leads} /></div>
                <div style={{ marginTop: 4 }}><Delta now={d.kpi.leads} before={prev && prev.leads} /></div>
                <Spark data={sparkLeads} color="#0693E3" />
                <div className={classes.label} style={{ fontSize: 12 }}>{d.kpi.open} em andamento</div>
              </div>
              <div className={classes.cell}>
                <div className={classes.label}>Matrículas</div>
                <div className={classes.cellVal} style={{ color: GREEN }}><NumberTicker value={d.kpi.won} /></div>
                <div style={{ marginTop: 4 }}><Delta now={d.kpi.won} before={prev && prev.won} /></div>
                <Spark data={sparkWon} color={GREEN} />
                <div className={classes.label} style={{ fontSize: 12 }}>{d.kpi.lost} perdidos · {wonInPeriod} confirmadas no período</div>
              </div>
              <div className={classes.cell}>
                <div className={classes.label}>Conversão</div>
                <div className={classes.cellVal} style={{ color: "#8b5cf6" }}>{`${d.kpi.conversion.toFixed(1).replace(".", ",")}%`}</div>
                <div style={{ marginTop: 4 }}><Delta now={d.kpi.conversion} before={prev && prev.conversion} points /></div>
                <div className={classes.label} style={{ fontSize: 12, marginTop: 8 }}>lead → matrícula</div>
              </div>
              <div className={classes.cell}>
                <div className={classes.label}>Tempo até o 1º contato</div>
                <div className={classes.cellVal} style={{ color: contactTone(d.kpi.avgFirstContactMin) }}>{mins(d.kpi.avgFirstContactMin)}</div>
                <div className={classes.label} style={{ fontSize: 12, marginTop: 8 }}>{d.kpi.businessHours ? "média, só horário comercial" : "média"} · ideal até 15 min</div>
              </div>
              <div className={classes.cell} style={{ borderRight: 0, borderTop: `2px solid ${"#14b8a6"}` }}>
                <div className={classes.label}>Tempo até a matrícula</div>
                <div className={classes.cellVal} style={{ color: "#14b8a6" }}>{d.kpi.avgDaysToEnroll === null ? "—" : `${Number(d.kpi.avgDaysToEnroll).toFixed(1).replace(".", ",")} dias`}</div>
                <div className={classes.label} style={{ fontSize: 12, marginTop: 8 }}>média</div>
              </div>
            </div>
          </GlowCard>

          <div className={classes.grid} style={{ marginTop: 16 }}>
            <GlowCard tone={"#0693E3"} className={classes.card} style={span(7)}>
              <Typography variant="subtitle2" gutterBottom>Funil de matrícula</Typography>
              <Typography variant="caption" color="textSecondary" display="block" style={{ marginBottom: 8 }}>
                Leads que estão em cada etapa ou já passaram dela (a porcentagem é em relação à etapa anterior). Os perdidos ficam à parte.
              </Typography>
              {lane && lane.total > 0 && (
                <div className={classes.lane} role="button" tabIndex={0} onClick={() => history.push("/crm")}
                  onKeyDown={(e) => { if (e.key === "Enter") history.push("/crm"); }}>
                  <Sprout size={15} /> <b>{lane.total}</b> indicação{lane.total > 1 ? "ões" : ""} de afiliados aguardando o 1º contato (já contam em "Leads captados")
                </div>
              )}
              {reached.map((f, i) => (
                <div key={f.id} className={classes.funnelRow}>
                  <span>{f.name}</span>
                  <div><div className={classes.bar} style={{ width: `${(f.reached / maxFunnel) * 100}%`, background: f.color }} /></div>
                  <span style={{ textAlign: "right", fontWeight: 600 }}>
                    {f.reached}
                    {i > 0 && reached[i - 1].reached ? <span style={{ opacity: 0.55, fontWeight: 400, fontSize: 11.5 }}> {pct(f.reached, reached[i - 1].reached)}</span> : null}
                  </span>
                </div>
              ))}
              <div className={classes.funnelRow} style={{ opacity: 0.8 }}>
                <span>Perdidos</span><div /><span style={{ textAlign: "right", fontWeight: 600 }}>{lostTotal}</span>
              </div>
            </GlowCard>

            <GlowCard tone={"#dc2626"} className={classes.card} style={span(5)}>
              <Typography variant="subtitle2" gutterBottom>Motivos de perda</Typography>
              {d.lostReasons.length === 0 ? <Typography color="textSecondary" variant="body2">Nenhuma perda no período.</Typography> : (
                <div className={classes.chart}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={d.lostReasons} dataKey="total" nameKey="name" innerRadius={48} outerRadius={80} paddingAngle={2} animationDuration={1000} animationEasing="ease-out">
                        {d.lostReasons.map((r, i) => (<Cell key={r.name} fill={PIE[i % PIE.length]} />))}
                      </Pie>
                      <Tooltip /><Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </GlowCard>

            <GlowCard tone={"#16a34a"} className={classes.card} style={span(12)}>
              <Typography variant="subtitle2" gutterBottom>Leads captados e matrículas confirmadas por dia</Typography>
              <div className={classes.chart}>
                <ResponsiveContainer>
                  <AreaChart data={series}>
                    <defs>
                      <linearGradient id="gLeads" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0693E3" stopOpacity={0.35} /><stop offset="100%" stopColor="#0693E3" stopOpacity={0} /></linearGradient>
                      <linearGradient id="gWon" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#16a34a" stopOpacity={0.35} /><stop offset="100%" stopColor="#16a34a" stopOpacity={0} /></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="day" interval="preserveStartEnd" minTickGap={18} /><YAxis allowDecimals={false} /><Tooltip /><Legend />
                    <Area type="monotone" dataKey="leads" name="Leads" stroke="#0693E3" strokeWidth={2} fill="url(#gLeads)" animationDuration={1200} animationEasing="ease-out" />
                    <Area type="monotone" dataKey="matriculas" name="Matrículas" stroke="#16a34a" strokeWidth={2} fill="url(#gWon)" animationDuration={1200} animationEasing="ease-out" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </GlowCard>

            <GlowCard tone={"#8b5cf6"} className={classes.card} style={span(6)}>
              <Typography variant="subtitle2" gutterBottom>Origem dos leads</Typography>
              <Table size="small">
                <TableHead><TableRow><TableCell>Origem</TableCell><TableCell align="right">Leads</TableCell><TableCell align="right">Matrículas</TableCell><TableCell align="right" style={{ minWidth: 110 }}>Conversão</TableCell></TableRow></TableHead>
                <TableBody>
                  {d.bySource.map((s) => (
                    <TableRow key={s.name}>
                      <TableCell><span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><SourceIcon source={s.name} />{s.name}</span></TableCell>
                      <TableCell align="right">{s.leads}</TableCell><TableCell align="right">{s.won}</TableCell>
                      <TableCell align="right">
                        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                          <div className={classes.miniBar} style={{ width: 50 }}><div style={{ width: `${Math.min(100, s.leads ? (s.won / s.leads) * 100 * 4 : 0)}%`, height: "100%", background: GREEN }} /></div>
                          <span style={{ minWidth: 44 }}>{pct(s.won, s.leads)}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </GlowCard>

            <GlowCard tone={"#14b8a6"} className={classes.card} style={span(6)}>
              <Typography variant="subtitle2" gutterBottom>Cursos mais procurados</Typography>
              <div className={classes.chart}>
                <ResponsiveContainer>
                  <BarChart data={d.byCourse} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={120} /><Tooltip /><Legend />
                    <Bar dataKey="leads" name="Leads" fill="#0693E3" radius={[0, 6, 6, 0]} animationDuration={1000} animationEasing="ease-out" />
                    <Bar dataKey="won" name="Matrículas" fill="#0B4279" radius={[0, 6, 6, 0]} animationDuration={1000} animationEasing="ease-out" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlowCard>

            <GlowCard tone={"#0B4279"} className={classes.card} style={span(12)}>
              <Typography variant="subtitle2" gutterBottom>Desempenho dos consultores</Typography>
              <Table size="small">
                <TableHead><TableRow><TableCell>Consultor</TableCell><TableCell align="right">Leads</TableCell><TableCell align="right">Em andamento</TableCell><TableCell align="right">Matrículas</TableCell><TableCell align="right">Conversão</TableCell><TableCell align="right">1º contato (média)</TableCell><TableCell align="right">Sem 1º contato agora</TableCell></TableRow></TableHead>
                <TableBody>
                  {d.byOwner.map((o) => (
                    <TableRow key={o.name}>
                      <TableCell>{o.name}</TableCell><TableCell align="right">{o.leads}</TableCell><TableCell align="right">{o.open}</TableCell>
                      <TableCell align="right"><b>{o.won}</b></TableCell><TableCell align="right">{pct(o.won, o.leads)}</TableCell>
                      <TableCell align="right" style={{ color: contactTone(o.avgFirstContactMin), fontWeight: 600 }}>{mins(o.avgFirstContactMin)}</TableCell>
                      <TableCell align="right" style={{ color: o.waiting ? RED : undefined, fontWeight: o.waiting ? 700 : 400 }}>{o.waiting || 0}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </GlowCard>
          </div>
         </div>
        </div>
      )}

    </MainContainer>
  );
};

export default Panel;
