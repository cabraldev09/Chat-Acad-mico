import { fillDays } from "../../utils/chartDays";
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useHistory } from "react-router-dom";
import { Typography, TextField, MenuItem, makeStyles, Table, TableHead, TableRow, TableCell, TableBody, Button, Menu } from "@material-ui/core";
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
import { COLORS, ChartLegend, DailyChart, FunnelBars, RankBars, SplitBar, Trend } from "./panelCharts";
import { tint } from "../../utils/color";
import NotALead from "./NotALead";
import "../../styles/dash.css";

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
    band: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", [theme.breakpoints.down("md")]: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }, [theme.breakpoints.down("xs")]: { gridTemplateColumns: "1fr" } },
    cell: { padding: theme.spacing(2), borderRight: `1px solid ${line}`, borderBottom: `1px solid ${line}`, minWidth: 0, position: "relative", transition: "background-color .25s ease", "&:hover": { background: "color-mix(in srgb, var(--dash-accent, #0693e3) 7%, transparent)" } },
    cellVal: { fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.15, marginTop: 4, fontVariantNumeric: "tabular-nums" },
    delta: { display: "inline-flex", alignItems: "center", gap: 2, fontSize: 12, fontWeight: 700, padding: "1px 7px", borderRadius: 999 },
    grid: { display: "grid", gap: theme.spacing(1.5), gridTemplateColumns: "repeat(12, 1fr)" },
    card: { padding: theme.spacing(2), minWidth: 0 },
    // the cards sit side by side on a wide screen and one under the other on a phone or a narrow window
    col12: { gridColumn: "span 12" },
    col7: { gridColumn: "span 7", [theme.breakpoints.down("sm")]: { gridColumn: "span 12" } },
    col5: { gridColumn: "span 5", [theme.breakpoints.down("sm")]: { gridColumn: "span 12" } },
    chart: { height: 250 },
    funnelRow: { display: "grid", gridTemplateColumns: "150px 1fr 90px", alignItems: "center", gap: 10, padding: "5px 0", fontSize: 13.5 },
    bar: { height: 22, borderRadius: 6, transition: "width 1s cubic-bezier(.2,.8,.2,1)", minWidth: 4 },
    lane: { display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", marginBottom: 8, borderRadius: 8, background: "rgba(245,165,36,.12)", fontSize: 13, cursor: "pointer" },
    error: { margin: theme.spacing(2), padding: theme.spacing(2), display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
    miniBar: { height: 6, borderRadius: 4, background: soft, overflow: "hidden", minWidth: 50 },
  };
});

const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1).replace(".", ",")}%` : "—");
const GREEN = "#16a34a";
const AMBER = "#d97706";
const RED = "#dc2626";

// first contact: green up to 15 min, amber up to an hour, red beyond

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
  const text = !before && !points ? "novo" : !points && Math.abs(diff) > 999 ? `${diff > 0 ? "mais de +999" : "-999"}%` : `${diff > 0 ? "+" : ""}${Math.abs(diff) >= 10 ? Math.round(diff) : diff.toFixed(1).replace(".", ",")}${points ? " p.p." : "%"}`;
  return (
    <span className={c.delta} style={{ background: `${color}22`, color }} title="Em relação ao período anterior de mesma duração">
      {up ? <ArrowUpRight size={12} /> : down ? <ArrowDownRight size={12} /> : <Minus size={12} />} {text}
    </span>
  );
};

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
  // "new leads to check": mine by default; the management can look at the whole team (or at the consultant picked in the filter)
  const isManager = !!me && (me.profile === "admin" || me.role === "coordenacao");
  const [triageScope, setTriageScope] = useState("mine");
  const [triage, setTriage] = useState({ items: [], total: 0, late: 0 });
  const [triageAll, setTriageAll] = useState(false);

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

  const loadTriage = useCallback(() => {
    if (!me) return;
    const who = triageScope === "mine" || !isManager ? me.id : ownerId || undefined;
    api.get("/crm/triage", { params: { ownerId: who } }).then(({ data }) => setTriage(data)).catch(() => undefined);
  }, [me, triageScope, ownerId, isManager]);
  useEffect(() => { loadTriage(); }, [loadTriage]);

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
  const full = (r) => (r.key ? r.key.split("-").reverse().join("/") : r.day);
  const sparkLeads = series.map((r) => ({ v: r.leads || 0, day: r.day, full: full(r) }));
  const sparkWon = series.map((r) => ({ v: r.matriculas || 0, day: r.day, full: full(r) }));
  // conversion as the period goes on: enrollments so far over the leads so far
  let accLeads = 0;
  let accWon = 0;
  const sparkConv = series.map((r) => {
    accLeads += r.leads || 0;
    accWon += r.matriculas || 0;
    return { v: accLeads ? Math.round((accWon / accLeads) * 1000) / 10 : 0, day: r.day, full: full(r) };
  });
  const lostRows = (d?.lostReasons || []).slice(0, 6).map((r) => ({ key: r.name, name: r.name, value: Number(r.total), bar: lostTotal ? (Number(r.total) / Math.max(1, Number(d.lostReasons[0].total))) * 100 : 0, note: pct(Number(r.total), lostTotal), color: COLORS.lost }));
  const lostOthers = (d?.lostReasons || []).slice(6).reduce((a, r) => a + Number(r.total), 0);
  if (lostOthers > 0) lostRows.push({ key: "outros", name: "Outros motivos", value: lostOthers, bar: (lostOthers / Math.max(1, Number(d.lostReasons[0].total))) * 100, note: pct(lostOthers, lostTotal), color: COLORS.muted });
  const maxSource = Math.max(1, ...(d?.bySource || []).map((s2) => Number(s2.leads)));
  const sourceRows = (d?.bySource || []).map((s2) => ({ key: s2.name, name: s2.name, icon: <SourceIcon source={s2.name} />, value: Number(s2.leads), bar: (Number(s2.leads) / maxSource) * 100, note: `${s2.won} matr. · ${pct(s2.won, s2.leads)}`, color: COLORS.leads }));
  const maxCourse = Math.max(1, ...(d?.byCourse || []).map((c2) => Number(c2.leads)));
  const courseRows = (d?.byCourse || []).slice(0, 8).map((c2) => ({ key: c2.name, name: c2.name, value: Number(c2.leads), bar: (Number(c2.leads) / maxCourse) * 100, note: `${c2.won} matr.`, color: COLORS.brand }));
  const [ownerSort, setOwnerSort] = useState({ key: "won", dir: -1 });
  const ownersSorted = [...(d?.byOwner || [])].sort((a, b) => {
    const val = (o) => (ownerSort.key === "conv" ? (o.leads ? o.won / o.leads : 0) : Number(o[ownerSort.key] || 0));
    return (val(a) - val(b)) * ownerSort.dir || String(a.name).localeCompare(String(b.name));
  });
  const maxOwnerLeads = Math.max(1, ...(d?.byOwner || []).map((o) => Number(o.leads)));
  const sortBy = (key) => setOwnerSort((cur) => (cur.key === key ? { key, dir: -cur.dir } : { key, dir: -1 }));
  const prev = d?.previous;
  const reload = () => { load(); loadTriage(); };

  const allAlerts = d ? [
    [Hourglass, "Aguardando 1º contato", d.attention.waitingFirstContact, AMBER, "rgba(217,119,6,.14)", "/crm"],
    [AlertTriangle, "Tarefas atrasadas", d.attention.overdueTasks, RED, "rgba(220,38,38,.12)", "/crm/tarefas"],
    [Flame, "Leads esfriando (+3 dias)", d.attention.stale, "#0693E3", "rgba(6,147,227,.12)", "/crm?followUp=overdue"],
    [UserX, "Sem responsável", d.attention.unassigned ?? d.kpi.unassigned, "#64748b", "rgba(100,116,139,.14)", "/crm"],
    [CircleDollarSign, "Taxa de matrícula pendente", d.attention.feePending, "#E5484D", "rgba(229,72,77,.12)", d.attention.feeTagId ? `/crm?tagId=${d.attention.feeTagId}` : "/crm"],
    [FileWarning, "Documentos pendentes", d.attention.docsPending, "#b45309", "rgba(245,158,11,.16)", d.attention.docsTagId ? `/crm?tagId=${d.attention.docsTagId}` : "/crm"],
  ] : [];
  // only what needs attention, by urgency (an empty counter is not information)
  const alerts = allAlerts.filter((a) => Number(a[2]) > 0);


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
        <div className={`${classes.scroll} dash-scope`}>
         <div className={`${classes.content} ${loading ? classes.contentBusy : ""}`} aria-busy={loading}>
          {(triage.total > 0 || (isManager && triageScope === "all")) && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <SectionHead color="#6366f1" title={triage.total > 0 ? `Novos para conferir · ${triage.total}` : "Novos para conferir"} hint={triageScope === "mine" || !isManager ? "Seus leads novos que ninguém atendeu. Confira no mesmo dia, antes do dia fechar." : "Leads novos sem atendimento de toda a equipe."} />
                </div>
                {isManager && (
                  <div className={classes.chips} role="group" aria-label="De quem">
                    {[["mine", "Meus"], ["all", "Equipe"]].map(([k, label]) => (
                      <button key={k} type="button" className={`${classes.chip} ${triageScope === k ? classes.chipOn : ""}`} onClick={() => setTriageScope(k)}>{label}</button>
                    ))}
                  </div>
                )}
              </div>
              <GlowCard className={classes.card}>
                {triage.late > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", marginBottom: 8, borderRadius: 10, background: "rgba(220,38,38,.1)", color: "#b91c1c", fontSize: 13.5, fontWeight: 600 }}>
                    <AlertTriangle size={16} />{triage.late} {triage.late === 1 ? "chegou" : "chegaram"} em dias anteriores e já {triage.late === 1 ? "passou" : "passaram"} do prazo de conferir.
                  </div>
                )}
                {(triageAll ? triage.items : triage.items.slice(0, 6)).map((t) => (
                  <div key={t.id} className={classes.triageRow}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontWeight: 600, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        {t.name}
                        {t.late ? <StagePill stage={{ name: "Passou do dia", color: "#dc2626" }} size="sm" solid={false} /> : <StagePill stage={{ name: "Chegou hoje", color: "#d97706" }} size="sm" solid={false} />}
                        {triageScope === "all" && isManager && t.ownerName && <span className={classes.label} style={{ fontSize: 12 }}>· {t.ownerName}</span>}
                      </div>
                      <div className={classes.label} style={{ fontSize: 12.5 }}>
                        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><SourceIcon source={t.source} />{t.source}</span>
                        {t.phone ? ` · ${t.phone}` : ""} · chegou {ago(t.createdAt)}
                      </div>
                    </div>
                    <Button size="small" variant="outlined" onClick={() => history.push(`/crm?lead=${t.id}`)}>Abrir</Button>
                    <NotALead lead={t} compact onDone={reload} />
                  </div>
                ))}
                {triage.items.length > 6 && (
                  <Button size="small" style={{ marginTop: 8 }} onClick={() => setTriageAll((v) => !v)}>{triageAll ? "Mostrar menos" : `Ver todos (${triage.items.length})`}</Button>
                )}
                {triage.total === 0 && <Typography className={classes.label}>Nada para conferir. Tudo em dia.</Typography>}
              </GlowCard>
            </>
          )}

          {alerts.length > 0 ? (
            <>
              <SectionHead color="#d97706" title="Pontos de atenção" hint="Situação de agora, não muda com o período escolhido" />
              <div className={classes.alerts}>
                {alerts.map(([Icon, label, value, fg, bg, to2]) => (
                  <GlowCard key={label} lift tone={fg} className={classes.alert} role="button" tabIndex={0} onClick={() => history.push(to2)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); history.push(to2); } }}>
                    <span className={classes.alertIcon} style={{ background: bg, color: fg }}><Icon size={18} /></span>
                    <div>
                      <div className={classes.label}>{label}</div>
                      <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}><NumberTicker value={value || 0} /></div>
                    </div>
                  </GlowCard>
                ))}
              </div>
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 12, background: "rgba(22,163,74,.1)", color: "#15803d", fontWeight: 600 }}>Nenhum ponto de atenção agora.</div>
          )}

          <SectionHead color="#16a34a" title="Resultados do período" hint="Dos leads que entraram entre as datas escolhidas, quantos já se matricularam. A seta compara com o período anterior." />
          <GlowCard style={{ padding: 0, overflow: "hidden" }}>
            <div className={classes.band}>
              <div className={classes.cell}>
                <div className={classes.label}>Leads captados</div>
                <div className={classes.cellVal}><NumberTicker value={d.kpi.leads} /></div>
                <div style={{ marginTop: 4 }}><Delta now={d.kpi.leads} before={prev && prev.leads} /></div>
                <Trend data={sparkLeads} color={COLORS.leads} name="Leads" label="Leads captados por dia" />
                <div className={classes.label} style={{ fontSize: 12, marginTop: 6 }}>{d.kpi.open} em andamento agora</div>
              </div>
              <div className={classes.cell}>
                <div className={classes.label}>Matrículas</div>
                <div className={classes.cellVal}><NumberTicker value={d.kpi.won} /></div>
                <div style={{ marginTop: 4 }}><Delta now={d.kpi.won} before={prev && prev.won} /></div>
                <Trend data={sparkWon} color={COLORS.won} kind="bar" name="Matrículas" label="Matrículas confirmadas por dia" />
                <div className={classes.label} style={{ fontSize: 12, marginTop: 6 }}>{wonInPeriod} confirmadas no período</div>
              </div>
              <div className={classes.cell}>
                <div className={classes.label}>Conversão</div>
                <div className={classes.cellVal}>{`${d.kpi.conversion.toFixed(1).replace(".", ",")}%`}</div>
                <div style={{ marginTop: 4 }}><Delta now={d.kpi.conversion} before={prev && prev.conversion} points /></div>
                <Trend data={sparkConv} color={COLORS.brand} name="Conversão acumulada" unit="percent" label="Conversão acumulada ao longo do período" />
                <div className={classes.label} style={{ fontSize: 12, marginTop: 6 }}>lead → matrícula, acumulada no período</div>
              </div>
              <div className={classes.cell} style={{ borderRight: 0 }}>
                <div className={classes.label}>Tempo até a matrícula</div>
                <div className={classes.cellVal}>{d.kpi.avgDaysToEnroll === null ? "—" : `${Number(d.kpi.avgDaysToEnroll).toFixed(1).replace(".", ",")} dias`}</div>
                <div className={classes.label} style={{ fontSize: 12, marginTop: 4 }}>média, da entrada do lead à matrícula</div>
                <div style={{ marginTop: 18 }}>
                  <SplitBar parts={[{ label: "Em andamento", value: Number(d.kpi.open), color: COLORS.leads }, { label: "Matriculados", value: Number(d.kpi.won), color: COLORS.won }, { label: "Perdidos", value: Number(d.kpi.lost), color: COLORS.lost }]} />
                </div>
              </div>
            </div>
          </GlowCard>

          <div className={classes.grid} style={{ marginTop: 16 }}>
            <GlowCard className={`${classes.card} ${classes.col12}`}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", justifyContent: "space-between" }}>
                <div>
                  <Typography variant="subtitle2">Leads captados e matrículas por dia</Typography>
                  <Typography variant="caption" color="textSecondary" display="block" style={{ marginBottom: 8 }}>Cada dia do período, mesmo os sem movimento.</Typography>
                </div>
                <ChartLegend items={[[COLORS.leads, "Leads captados"], [COLORS.won, "Matrículas"], [COLORS.brand, "Média de 7 dias (leads)", true]]} />
              </div>
              <DailyChart series={series} />
            </GlowCard>

            <GlowCard className={`${classes.card} ${classes.col7}`}>
              <Typography variant="subtitle2" gutterBottom>Funil de matrícula</Typography>
              <Typography variant="caption" color="textSecondary" display="block" style={{ marginBottom: 12 }}>
                Leads que estão em cada etapa ou já passaram dela; ao lado de cada barra, a parte da etapa anterior que chegou até ali.
              </Typography>
              {lane && lane.total > 0 && (
                <div className={classes.lane} role="button" tabIndex={0} onClick={() => history.push("/crm")}
                  onKeyDown={(e) => { if (e.key === "Enter") history.push("/crm"); }}>
                  <Sprout size={15} /> <b>{lane.total}</b> indicação{lane.total > 1 ? "ões" : ""} de afiliados aguardando o 1º contato (já contam em "Leads captados")
                </div>
              )}
              <FunnelBars steps={reached} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(100,116,139,.2)", fontSize: 13.5 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: COLORS.lost }} />Perdidos (ficam fora do funil)</span>
                <b style={{ fontVariantNumeric: "tabular-nums" }}>{lostTotal} <span style={{ fontWeight: 500, opacity: 0.65, fontSize: 12 }}>{pct(lostTotal, d.kpi.leads)} dos leads</span></b>
              </div>
            </GlowCard>

            <GlowCard className={`${classes.card} ${classes.col5}`}>
              <Typography variant="subtitle2" gutterBottom>Motivos de perda</Typography>
              <Typography variant="caption" color="textSecondary" display="block" style={{ marginBottom: 12 }}>O que mais derruba os leads do período.</Typography>
              <RankBars rows={lostRows} empty="Nenhuma perda no período." />
            </GlowCard>

            <GlowCard className={`${classes.card} ${classes.col5}`}>
              <Typography variant="subtitle2" gutterBottom>Origem dos leads</Typography>
              <Typography variant="caption" color="textSecondary" display="block" style={{ marginBottom: 12 }}>Quantos leads e quantas matrículas vieram de cada canal.</Typography>
              <RankBars rows={sourceRows} />
            </GlowCard>

            <GlowCard className={`${classes.card} ${classes.col7}`}>
              <Typography variant="subtitle2" gutterBottom>Cursos mais procurados</Typography>
              <Typography variant="caption" color="textSecondary" display="block" style={{ marginBottom: 12 }}>Leads por curso (os 8 primeiros) e as matrículas de cada um.</Typography>
              <RankBars rows={courseRows} />
            </GlowCard>

            <GlowCard className={`${classes.card} ${classes.col12}`}>
              <Typography variant="subtitle2" gutterBottom>Desempenho dos consultores</Typography>
              <div style={{ overflowX: "auto" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Consultor</TableCell>
                      {[["leads", "Leads"], ["open", "Em andamento"], ["won", "Matrículas"], ["conv", "Conversão"], ["waiting", "Sem 1º contato agora"]].map(([k, label]) => (
                        <TableCell key={k} align="right" sortDirection={ownerSort.key === k ? (ownerSort.dir > 0 ? "asc" : "desc") : false}>
                          <button type="button" onClick={() => sortBy(k)} style={{ border: 0, background: "transparent", cursor: "pointer", font: "inherit", color: "inherit", fontWeight: 600, padding: 0 }} aria-label={`Ordenar por ${label}`}>
                            {label}{ownerSort.key === k ? (ownerSort.dir > 0 ? " ↑" : " ↓") : ""}
                          </button>
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {ownersSorted.map((o) => (
                      <TableRow key={o.name} hover>
                        <TableCell>
                          <div style={{ fontWeight: 600 }}>{o.name}</div>
                          <div className={classes.miniBar} style={{ marginTop: 4, width: 120 }}><div style={{ width: `${(Number(o.leads) / maxOwnerLeads) * 100}%`, height: "100%", background: COLORS.leads, opacity: 0.7 }} /></div>
                        </TableCell>
                        <TableCell align="right" style={{ fontVariantNumeric: "tabular-nums" }}>{o.leads}</TableCell>
                        <TableCell align="right" style={{ fontVariantNumeric: "tabular-nums" }}>{o.open}</TableCell>
                        <TableCell align="right" style={{ fontVariantNumeric: "tabular-nums" }}><b>{o.won}</b></TableCell>
                        <TableCell align="right" style={{ fontVariantNumeric: "tabular-nums" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                            <div className={classes.miniBar} style={{ width: 56 }}><div style={{ width: `${Math.min(100, o.leads ? (o.won / o.leads) * 100 * 4 : 0)}%`, height: "100%", background: COLORS.won }} /></div>
                            <span style={{ minWidth: 44 }}>{pct(o.won, o.leads)}</span>
                          </div>
                        </TableCell>
                        <TableCell align="right" style={{ color: o.waiting ? RED : undefined, fontWeight: o.waiting ? 700 : 400, fontVariantNumeric: "tabular-nums" }}>{o.waiting || 0}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </GlowCard>
          </div>
         </div>
        </div>
      )}

    </MainContainer>
  );
};

export default Panel;
