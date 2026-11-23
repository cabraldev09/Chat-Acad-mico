import { fillDays } from "../../utils/chartDays";
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useHistory } from "react-router-dom";
import { Typography, TextField, MenuItem, makeStyles, Button, Menu } from "@material-ui/core";
import { AlertTriangle, Download, Sprout, RefreshCw, ArrowUpRight, Clock, Hourglass, Users } from "lucide-react";
import { format, subDays, startOfMonth } from "date-fns";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import GlowCard from "../../components/GlowCard";
import TopLoader from "../../components/TopLoader";
import { AuthContext } from "../../context/Auth/AuthContext";
import { isManager as isManagerUser } from "../../utils/access";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { downloadFile } from "../../utils/saveBlob";
import { useCrmOptions, SourceIcon, StagePill, ago } from "./shared";
import { COLORS, ChartLegend, DailyChart } from "./panelCharts";
import NotALead from "./NotALead";
import "../../styles/dash.css";
import StatsHubBar from "../../components/StatsHub";
import { InsightsCard, TeamOnline } from "../../components/Insights";
import { ACCENT, Badge, CountStat, GlowFunnel, GlowPanel, GlowRank, GlowStat, PeakChart, PeakRow, SectionTitle, change } from "../../components/peak";
import { Donut } from "../../components/charts";

const useStyles = makeStyles((theme) => {
  const line = "var(--line)";
  const soft = "var(--surface-2)";
  return {
    scroll: { flex: 1, overflowY: "auto", overflowX: "hidden", padding: theme.spacing(1, 1, 3), ...theme.scrollbarStyles },
    // changing a filter: the numbers dim and settle back instead of jumping (nothing moves, so the page keeps its place)
    content: {
      transition: "opacity .45s cubic-bezier(.2,.8,.2,1), filter .45s ease",
      "@media (prefers-reduced-motion: reduce)": { transition: "none" },
    },
    contentBusy: { opacity: 0.55, filter: "saturate(.75)", pointerEvents: "none" },
    label: { fontSize: 13, color: theme.palette.text.secondary, fontWeight: 500 },
    chips: { display: "inline-flex", gap: 2, padding: 3, borderRadius: 10, background: soft, border: `1px solid ${line}` },
    chip: {
      border: 0, background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 550, color: theme.palette.text.secondary, padding: "5px 12px", borderRadius: 7,
      "&:hover": { color: theme.palette.text.primary },
    },
    chipOn: { background: "var(--surface)", color: theme.palette.text.primary, boxShadow: "0 1px 2px rgba(15,23,42,.08), 0 0 0 1px var(--line)" },
    triageRow: { display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderTop: `1px solid ${line}`, flexWrap: "wrap", "&:first-of-type": { borderTop: 0 } },
    grid: { display: "grid", gap: theme.spacing(1.5), gridTemplateColumns: "repeat(12, 1fr)" },
    card: { padding: theme.spacing(2), minWidth: 0 },
    // the cards sit side by side on a wide screen and one under the other on a phone or a narrow window
    col12: { gridColumn: "span 12", minWidth: 0 },
    col7: { gridColumn: "span 7", minWidth: 0, [theme.breakpoints.down("sm")]: { gridColumn: "span 12" } },
    col5: { gridColumn: "span 5", minWidth: 0, [theme.breakpoints.down("sm")]: { gridColumn: "span 12" } },
    lane: { display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", marginBottom: 12, borderRadius: 8, background: "rgba(245,165,36,.16)", fontSize: 13, cursor: "pointer" },
    error: { margin: theme.spacing(2), padding: theme.spacing(2), display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  };
});

const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1).replace(".", ",")}%` : "—");
const nf = (v) => Number(v || 0).toLocaleString("pt-BR");
// one colour per slice, the same order on every chart of shares
const SHARE_COLORS = ["leads", "brand", "violet", "teal", "warn", "won", "muted"];
const dm = (key) => (key ? `${String(key).slice(8, 10)}/${String(key).slice(5, 7)}` : "");

const todayStr = () => format(new Date(), "yyyy-MM-dd");

// mode "now": the Painel do CRM, what to do today (no period). mode "results": Estatísticas → Captação, the period with its charts.
const Panel = ({ mode = "now" }) => {
  const results = mode === "results";
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
  const isManager = isManagerUser(me);
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

  // the triage block says when it could not load (instead of simply not appearing)
  const [triageFailed, setTriageFailed] = useState(false);
  const loadTriage = useCallback(() => {
    if (!me) return;
    const who = triageScope === "mine" || !isManager ? me.id : ownerId || undefined;
    setTriageFailed(false);
    api.get("/crm/triage", { params: { ownerId: who } }).then(({ data }) => setTriage(data)).catch(() => setTriageFailed(true));
  }, [me, triageScope, ownerId, isManager]);
  useEffect(() => { loadTriage(); }, [loadTriage]);

  const ticket = useRef(0);
  const load = useCallback(() => {
    const mine = ++ticket.current;
    setLoading(true);
    setFailed(false);
    api.get("/crm/metrics", { params: results ? { from, to, ownerId: ownerId || undefined, courseId: courseId || undefined } : { now: 1, ownerId: ownerId || undefined, courseId: courseId || undefined } })
      .then(({ data }) => { if (mine === ticket.current) setD(data); })
      .catch((err) => { if (mine === ticket.current) { setFailed(true); toastError(err); } })
      .finally(() => { if (mine === ticket.current) setLoading(false); });
  }, [from, to, ownerId, courseId, results]);
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
  // now: how many leads are in each stage today; results: who reached each stage (this one or a later one)
  const reached = steps.map((f, i) => ({ ...f, reached: results ? steps.slice(i).reduce((a, x) => a + x.total, 0) : f.total }));
  const lostTotal = d ? d.funnel.filter((f) => f.type === "lost").reduce((a, x) => a + x.total, 0) : 0;
  const wonInPeriod = d && d.enrollmentsInPeriod !== undefined ? d.enrollmentsInPeriod : (d?.wonDaily || []).reduce((a, r) => a + Number(r.total || 0), 0);
  const dayLabels = series.map((r) => dm(r.key));
  // conversion as the period goes on: enrollments so far over the leads so far
  let accLeads = 0;
  let accWon = 0;
  const convSeries = series.map((r) => {
    accLeads += r.leads || 0;
    accWon += r.matriculas || 0;
    return accLeads ? Math.round((accWon / accLeads) * 1000) / 10 : 0;
  });
  const topLost = Math.max(1, Number(d?.lostReasons?.[0]?.total || 0));
  const lostRows = (d?.lostReasons || []).slice(0, 6).map((r) => ({ key: r.name, name: r.name, value: nf(r.total), bar: (Number(r.total) / topLost) * 100, note: `${pct(Number(r.total), lostTotal)} das perdas` }));
  const lostOthers = (d?.lostReasons || []).slice(6).reduce((a, r) => a + Number(r.total), 0);
  if (lostOthers > 0) lostRows.push({ key: "outros", name: "Outros motivos", value: nf(lostOthers), bar: (lostOthers / topLost) * 100, note: `${pct(lostOthers, lostTotal)} das perdas` });
  const lostParts = [...(d?.lostReasons || []).slice(0, 6).map((r, i) => ({ label: r.name, value: Number(r.total), color: ["lost", "warn", "violet", "brand", "teal", "leads"][i] })), ...(lostOthers > 0 ? [{ label: "Outros motivos", value: lostOthers, color: "muted" }] : [])];
  const maxSource = Math.max(1, ...(d?.bySource || []).map((s2) => Number(s2.leads)));
  const sourceRows = (d?.bySource || []).map((s2) => ({ key: s2.name, name: s2.name, value: nf(s2.leads), bar: (Number(s2.leads) / maxSource) * 100, note: `${nf(s2.won)} matrículas, ${pct(s2.won, s2.leads)} de conversão` }));
  const maxCourse = Math.max(1, ...(d?.byCourse || []).map((c2) => Number(c2.leads)));
  const courseRows = (d?.byCourse || []).slice(0, 8).map((c2) => ({ key: c2.name, name: c2.name, value: nf(c2.leads), bar: (Number(c2.leads) / maxCourse) * 100, note: `${nf(c2.won)} matrículas` }));
  const [ownerSort, setOwnerSort] = useState({ key: mode === "results" ? "won" : "waiting", dir: -1 });
  const ownersSorted = [...(d?.byOwner || [])].sort((a, b) => {
    const val = (o) => (ownerSort.key === "conv" ? (o.leads ? o.won / o.leads : 0) : Number(o[ownerSort.key] || 0));
    return (val(a) - val(b)) * ownerSort.dir || String(a.name).localeCompare(String(b.name));
  });
  const sortBy = (key) => setOwnerSort((cur) => (cur.key === key ? { key, dir: -cur.dir } : { key, dir: -1 }));
  const prev = d?.previous;
  const reload = () => { load(); loadTriage(); };
  const noKpi = { leads: 0, won: 0, lost: 0, open: 0, conversion: 0, avgDaysToEnroll: null, unassigned: 0 };
  const kpi = (d && d.kpi) || noKpi;

  // what is waiting now
  const owners = d?.byOwner || [];
  const openNow = reached.reduce((a, f) => a + (f.type === "won" ? 0 : Number(f.reached) || 0), 0);
  // the server counts what needs attention; without it (an older answer) the people on screen are added up
  const attention = d?.attention || {};
  const waitingNow = attention.waitingFirstContact ?? owners.reduce((a, o) => a + Number(o.waiting || 0), 0);
  const staleNow = attention.stale ?? owners.reduce((a, o) => a + Number(o.stale || 0), 0);
  const leadsDelta = prev ? change(kpi.leads, prev.leads) : null;
  const convDelta = prev && prev.conversion !== undefined && prev.conversion !== null ? Math.round((kpi.conversion - prev.conversion) * 10) / 10 : null;

  return (
    <MainContainer>
      <MainHeader>
        <Title>{results ? "Captação e resultados" : "Painel do CRM"}</Title>
        <MainHeaderButtonsWrapper>
          {results && <div className={classes.chips} role="group" aria-label="Período">
            {presets.map(([label, start]) => (
              <button key={label} type="button" aria-pressed={from === start && to === todayStr()} className={`${classes.chip} ${from === start && to === todayStr() ? classes.chipOn : ""}`} onClick={() => { setFrom(start); setTo(todayStr()); }}>{label}</button>
            ))}
          </div>}
          {results && <TextField size="small" type="date" label="De" variant="outlined" InputLabelProps={{ shrink: true }} value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />}
          {results && <TextField size="small" type="date" label="Até" variant="outlined" InputLabelProps={{ shrink: true }} value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />}
          {/* only the management narrows the panel to one consultant: everybody else already sees what is theirs */}
          {isManager && (
            <TextField select size="small" label="Consultor" variant="outlined" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} style={{ minWidth: 130 }}>
              <MenuItem value="">Todos</MenuItem>{users.map((u) => (<MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>))}
            </TextField>
          )}
          <TextField select size="small" label="Curso" variant="outlined" value={courseId} onChange={(e) => setCourseId(e.target.value)} style={{ minWidth: 130 }}>
            <MenuItem value="">Todos</MenuItem>{courses.map((c) => (<MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>))}
          </TextField>
          {!results && <Button variant="outlined" startIcon={<ArrowUpRight size={16} />} onClick={() => history.push("/estatisticas/captacao")}>Ver resultados</Button>}
          {canExport && results && <Button variant="outlined" startIcon={<Download size={16} />} onClick={(e) => setExportEl(e.currentTarget)}>Exportar</Button>}
          <Menu anchorEl={exportEl} open={Boolean(exportEl)} onClose={() => setExportEl(null)} getContentAnchorEl={null} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
            <MenuItem onClick={() => exportReport("owner")}>Por consultor (planilha)</MenuItem>
            <MenuItem onClick={() => exportReport("polo")}>Por polo (planilha)</MenuItem>
          </Menu>
        </MainHeaderButtonsWrapper>
      </MainHeader>
      {results && <StatsHubBar />}

      <TopLoader active={loading} />
      {failed && !d && (
        <GlowCard className={classes.error} role="alert">
          <Typography>Não foi possível carregar o painel.</Typography>
          <Button variant="outlined" startIcon={<RefreshCw size={16} />} onClick={load}>Tentar de novo</Button>
        </GlowCard>
      )}
      {!d && !failed && (
        <div className={classes.scroll}>
          <div className="pk-grid" aria-hidden="true">{[0, 1, 2, 3].map((i) => <div key={i} className="pk pk-skel" style={{ height: 116 }} />)}</div>
        </div>
      )}
      {d && (
        <div className={`${classes.scroll} dash-scope`}>
         <div className={`${classes.content} ${loading ? classes.contentBusy : ""}`} aria-busy={loading}>

          {/* ---- Painel do CRM: what asks for action now, the priorities and the new leads, the funnel and the people ---- */}
          {!results && (
            <>
              <SectionTitle title="O que pede ação agora" hint="Os números de agora. Cada cartão abre a lista já filtrada." style={{ marginTop: 10 }} />
              <div className="pk-grid-4">
                <CountStat id="open" label="Leads em andamento" icon={Users} tone="brand" value={openNow} hint="Em alguma etapa do funil" action="Abrir o funil" onClick={() => history.push("/crm")} />
                <CountStat id="waiting" label="Sem primeiro contato" icon={Clock} tone={waitingNow ? "bad" : "good"} value={waitingNow} hint={waitingNow ? "Chegaram há mais de uma hora" : "Ninguém esperando o primeiro contato"} action="Atender agora" onClick={() => history.push("/crm")} />
                <CountStat id="stale" label="Esfriando" icon={Hourglass} tone={staleNow ? "warn" : "good"} value={staleNow} hint="Três dias ou mais sem contato" action="Retomar o contato" onClick={() => history.push("/crm?followUp=overdue")} />
                <CountStat id="triage" label="Novos para conferir" icon={AlertTriangle} tone={triage.late ? "bad" : triage.total ? "warn" : "good"} value={triage.total} hint={triage.late ? `${nf(triage.late)} de dias anteriores` : "Confira no mesmo dia"} />
              </div>

              <div className={classes.grid} style={{ marginTop: 16 }}>
                <div className={classes.col7}><InsightsCard /></div>
                <div className={classes.col5}>
                  <GlowPanel id="triage" tone={triage.late ? "bad" : triage.total ? "warn" : undefined} title="Novos para conferir"
                    sub={triageScope === "mine" || !isManager ? "Seus leads novos que ninguém atendeu. Confira no mesmo dia." : "Leads novos sem atendimento de toda a equipe."}
                    error={triageFailed} onRetry={loadTriage}
                    action={isManager ? (
                      <div className={classes.chips} role="group" aria-label="De quem">
                        {[["mine", "Meus"], ["all", "Equipe"]].map(([k, label]) => (
                          <button key={k} type="button" aria-pressed={triageScope === k} className={`${classes.chip} ${triageScope === k ? classes.chipOn : ""}`} onClick={() => setTriageScope(k)}>{label}</button>
                        ))}
                      </div>
                    ) : null}>
                    {triage.late > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", marginBottom: 8, borderRadius: 8, background: "color-mix(in srgb, var(--c-lost) 9%, transparent)", border: "1px solid color-mix(in srgb, var(--c-lost) 22%, transparent)", color: "var(--c-lost)", fontSize: 13, fontWeight: 600 }}>
                        <AlertTriangle size={16} />{triage.late} {triage.late === 1 ? "chegou" : "chegaram"} em dias anteriores e já {triage.late === 1 ? "passou" : "passaram"} do prazo de conferir.
                      </div>
                    )}
                    {(triageAll ? triage.items : triage.items.slice(0, 5)).map((t) => (
                      <div key={t.id} className={classes.triageRow}>
                        <div style={{ flex: 1, minWidth: 160 }}>
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
                    {triage.items.length > 5 && (
                      <Button size="small" style={{ marginTop: 8 }} onClick={() => setTriageAll((v) => !v)}>{triageAll ? "Mostrar menos" : `Ver todos (${triage.items.length})`}</Button>
                    )}
                    {triage.total === 0 && <div className="pk-state" style={{ minHeight: 80 }}>Nada para conferir. Tudo em dia.</div>}
                  </GlowPanel>
                </div>
              </div>

              <SectionTitle title="Funil agora" hint="Quantos leads estão em cada etapa hoje. Clique em uma etapa para abrir o quadro." style={{ marginTop: 26 }}
                action={<span className="pk-hint">Perdidos, fora do funil: <b>{nf(lostTotal)}</b></span>} />
              <GlowPanel id="funnel" tone="brand" empty={!reached.some((f) => f.reached > 0) && !(lane && lane.total > 0)} emptyText="Nenhum lead em andamento agora.">
                {lane && lane.total > 0 && (
                  <div className={classes.lane} role="button" tabIndex={0} onClick={() => history.push("/crm")}
                    onKeyDown={(e) => { if (e.key === "Enter") history.push("/crm"); }}>
                    <Sprout size={15} /> <b>{lane.total}</b> indicação{lane.total > 1 ? "ões" : ""} de afiliados aguardando o 1º contato
                  </div>
                )}
                <GlowFunnel steps={reached.map((f) => ({ key: f.id ?? f.name, name: f.name, value: f.reached, color: f.color || undefined }))} onStep={() => history.push("/crm")} />
              </GlowPanel>

              {isManager && (
                <>
                  <SectionTitle title="Equipe" hint="Como está a carteira de cada consultor e quem está no sistema." style={{ marginTop: 26 }} />
                  <div className={classes.grid}>
                    <div className={classes.col7}>
                      <GlowPanel id="owners" title="Consultores agora" sub="Toque no título de uma coluna para ordenar." empty={!ownersSorted.length} emptyText="Ninguém com leads em andamento agora.">
                        <table className="pk-table pk-stack">
                          <thead>
                            <tr>
                              <th>Consultor</th>
                              {[["open", "Em andamento"], ["waiting", "Sem 1º contato"], ["stale", "Esfriando"]].map(([k, label]) => (
                                <th key={k} className="r" aria-sort={ownerSort.key === k ? (ownerSort.dir > 0 ? "ascending" : "descending") : undefined}>
                                  <button type="button" onClick={() => sortBy(k)} style={{ border: 0, background: "transparent", cursor: "pointer", font: "inherit", color: "inherit", padding: 0, textTransform: "inherit", letterSpacing: "inherit" }} aria-label={`Ordenar por ${label}`}>
                                    {label}{ownerSort.key === k ? (ownerSort.dir > 0 ? " ↑" : " ↓") : ""}
                                  </button>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {ownersSorted.map((o) => (
                              <tr key={o.name}>
                                <td data-main="1" style={{ fontWeight: 600 }}>{o.name}</td>
                                <td className="r" data-label="Em andamento"><b>{nf(o.open)}</b></td>
                                <td className="r" data-label="Sem 1º contato"><Badge tone={Number(o.waiting) ? "bad" : "good"}>{nf(o.waiting)}</Badge></td>
                                <td className="r" data-label="Esfriando"><Badge tone={Number(o.stale) ? "warn" : "good"}>{nf(o.stale)}</Badge></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </GlowPanel>
                    </div>
                    <div className={classes.col5}><TeamOnline /></div>
                  </div>
                </>
              )}
            </>
          )}

          {/* ---- Captação: the period with its lines ---- */}
          {results && (
            <>
              <SectionTitle title="Resultados do período" hint="Leads que entraram e matrículas confirmadas entre as datas escolhidas, comparados com o período anterior." style={{ marginTop: 10 }} />
              <PeakRow label="Resultados do período">
                <PeakChart title="Leads captados" value={Number(kpi.leads) || 0} data={series.map((r) => r.leads || 0)} labels={dayLabels} accent={ACCENT.brand}
                  trend={!leadsDelta ? "none" : leadsDelta > 0 ? "up" : "down"} caption={leadsDelta === null ? "Sem período anterior para comparar" : `${leadsDelta > 0 ? "+" : ""}${leadsDelta}% contra o período anterior`} />
                <PeakChart title="Matrículas no período" value={Number(wonInPeriod) || 0} data={series.map((r) => r.matriculas || 0)} labels={dayLabels} accent={ACCENT.good}
                  caption={`${nf(kpi.won)} são de leads que entraram neste período`} />
                <PeakChart title="Conversão" value={Number(kpi.conversion) || 0} decimals={1} valueSuffix="%" data={convSeries} labels={dayLabels} accent={ACCENT.violet}
                  formatValue={(v) => `${(Math.round(v * 10) / 10).toLocaleString("pt-BR")}%`}
                  trend={!convDelta ? "none" : convDelta > 0 ? "up" : "down"} caption={convDelta === null ? "Dos leads que entraram, quantos já se matricularam" : `${convDelta > 0 ? "+" : ""}${String(convDelta).replace(".", ",")} p.p. contra o período anterior`} />
              </PeakRow>
              <div className="pk-grid">
                <GlowStat id="days" label="Tempo até a matrícula" icon={Clock} value={kpi.avgDaysToEnroll === null || kpi.avgDaysToEnroll === undefined ? "—" : `${Number(kpi.avgDaysToEnroll).toFixed(1).replace(".", ",")} dias`} hint="Média, da entrada do lead à matrícula" />
                <GlowStat id="open" label="Em andamento" icon={Hourglass} value={nf(kpi.open)} hint="Leads do período ainda no funil" />
                <GlowStat id="lost" label="Perdidos" tone={Number(kpi.lost) ? "bad" : undefined} value={nf(kpi.lost)} hint={`${pct(Number(kpi.lost), Number(kpi.leads))} dos leads do período`} />
                {isManager && <GlowStat id="unassigned" label="Sem responsável" tone={Number(kpi.unassigned) ? "warn" : "good"} value={nf(kpi.unassigned)} hint="Leads do período sem consultor" />}
              </div>

              <SectionTitle title="Dia a dia" hint="Cada dia do período, mesmo os sem movimento." style={{ marginTop: 26 }} />
              <GlowPanel id="daily" tone="brand" action={<ChartLegend items={[[COLORS.leads, "Leads captados"], [COLORS.won, "Matrículas"], [COLORS.brand, "Média de 7 dias (leads)", true]]} />}>
                <DailyChart series={series} />
              </GlowPanel>

              <SectionTitle title="De onde vêm e por que se perdem" hint="A proporção de cada canal, de cada motivo e de cada curso." style={{ marginTop: 26 }} />

              <div className="pk-grid-wide">
                <GlowPanel id="sources" title="Origem dos leads" sub="A parte de cada canal nos leads do período." empty={!sourceRows.length} emptyText="Nenhum lead no período.">
                  <Donut parts={(d.bySource || []).map((x, i) => ({ label: x.name, value: Number(x.leads), color: SHARE_COLORS[i % SHARE_COLORS.length] }))} centerLabel="leads" />
                </GlowPanel>
                <GlowPanel id="lost-reasons" tone="bad" title="Motivos de perda" sub="O que mais derruba os leads do período." empty={!lostRows.length} emptyText="Nenhuma perda no período.">
                  <Donut parts={lostParts} centerLabel="perdas" />
                </GlowPanel>
                <GlowPanel id="courses" tone="violet" title="Cursos mais procurados" sub="Os 8 primeiros, com as matrículas de cada um." empty={!courseRows.length} emptyText="Nenhum lead com curso no período.">
                  <GlowRank rows={courseRows} />
                </GlowPanel>
              </div>
            </>
          )}
         </div>
        </div>
      )}

    </MainContainer>
  );
};

export default Panel;
