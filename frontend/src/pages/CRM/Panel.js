import { fillDays } from "../../utils/chartDays";
import React, { useContext, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { Typography, TextField, MenuItem, makeStyles, Table, TableHead, TableRow, TableCell, TableBody, LinearProgress, Button, Menu } from "@material-ui/core";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Cell, PieChart, Pie, Legend,
} from "recharts";
import { AlertTriangle, Hourglass, UserX, Flame, Download } from "lucide-react";
import { format, subDays } from "date-fns";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import GlowCard from "../../components/GlowCard";
import NumberTicker from "../../components/NumberTicker";
import { AuthContext } from "../../context/Auth/AuthContext";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { useCrmOptions, SourceIcon } from "./shared";

const useStyles = makeStyles((theme) => ({
  scroll: { flex: 1, overflowY: "auto", overflowX: "hidden", padding: theme.spacing(1, 1, 2), ...theme.scrollbarStyles },
  kpis: { display: "grid", gap: theme.spacing(1.5), gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" },
  kpi: { padding: theme.spacing(2) },
  kpiVal: { fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.2 },
  label: { fontSize: 13, color: theme.palette.text.secondary, fontWeight: 500 },
  alerts: { display: "grid", gap: theme.spacing(1.5), gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginTop: theme.spacing(1.5) },
  alert: { padding: theme.spacing(1.5, 2), display: "flex", alignItems: "center", gap: 12, cursor: "pointer" },
  alertIcon: { width: 36, height: 36, borderRadius: 10, display: "grid", placeItems: "center", flex: "none" },
  grid: { display: "grid", gap: theme.spacing(1.5), marginTop: theme.spacing(1.5), gridTemplateColumns: "repeat(12, 1fr)" },
  card: { padding: theme.spacing(2) },
  chart: { height: 250 },
  funnelRow: { display: "grid", gridTemplateColumns: "150px 1fr 70px", alignItems: "center", gap: 10, padding: "5px 0", fontSize: 13.5 },
  bar: { height: 22, borderRadius: 6, transition: "width .8s var(--ease-out)", minWidth: 4 },
}));

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

const Panel = () => {
  const { user: me } = useContext(AuthContext);
  const canExport = !!me && me.role !== "tutor";
  const classes = useStyles();
  const history = useHistory();
  const { courses, users } = useCrmOptions();
  const [from, setFrom] = useState(format(subDays(new Date(), 29), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [ownerId, setOwnerId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [d, setD] = useState(null);
  const [exportEl, setExportEl] = useState(null);

  // downloads the report (opens in Excel) for the period on screen
  const exportReport = async (groupBy) => {
    setExportEl(null);
    try {
      const { data } = await api.get("/crm/report", { params: { from, to, groupBy, format: "csv" }, responseType: "blob" });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-${groupBy === "polo" ? "polos" : "consultores"}-${from}-a-${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toastError(err);
    }
  };

  useEffect(() => {
    api.get("/crm/metrics", { params: { from, to, ownerId: ownerId || undefined, courseId: courseId || undefined } })
      .then(({ data }) => setD(data)).catch(toastError);
  }, [from, to, ownerId, courseId]);

  const byDay = {};
  (d?.created || []).forEach((r) => { const k = String(r.day).slice(0, 10); byDay[k] = { ...byDay[k], leads: Number(r.total) }; });
  (d?.wonDaily || []).forEach((r) => { const k = String(r.day).slice(0, 10); byDay[k] = { ...byDay[k], matriculas: Number(r.total) }; });
  const series = fillDays(from, to, byDay, { leads: 0, matriculas: 0 });
  // "reached stage" = leads now in this stage or any later one (enrolled included)
  const steps = d ? d.funnel.filter((f) => f.type !== "lost") : [];
  const reached = steps.map((f, i) => ({ ...f, reached: steps.slice(i).reduce((a, x) => a + x.total, 0) }));
  const lostTotal = d ? d.funnel.filter((f) => f.type === "lost").reduce((a, x) => a + x.total, 0) : 0;
  const maxFunnel = Math.max(1, ...reached.map((f) => f.reached));

  const Kpi = ({ label, value, hint }) => (
    <GlowCard className={classes.kpi}>
      <div className={classes.label}>{label}</div>
      <div className={classes.kpiVal}>{typeof value === "number" ? <NumberTicker value={value} /> : value}</div>
      {hint && <div className={classes.label} style={{ fontSize: 12 }}>{hint}</div>}
    </GlowCard>
  );

  return (
    <MainContainer>
      <MainHeader>
        <Title>Painel do CRM</Title>
        <MainHeaderButtonsWrapper>
          <TextField size="small" type="date" label="De" variant="outlined" InputLabelProps={{ shrink: true }} value={from} onChange={(e) => setFrom(e.target.value)} />
          <TextField size="small" type="date" label="Até" variant="outlined" InputLabelProps={{ shrink: true }} value={to} onChange={(e) => setTo(e.target.value)} />
          <TextField select size="small" label="Consultor" variant="outlined" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} style={{ minWidth: 150 }}>
            <MenuItem value="">Todos</MenuItem>{users.map((u) => (<MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>))}
          </TextField>
          <TextField select size="small" label="Curso" variant="outlined" value={courseId} onChange={(e) => setCourseId(e.target.value)} style={{ minWidth: 160 }}>
            <MenuItem value="">Todos</MenuItem>{courses.map((c) => (<MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>))}
          </TextField>
          {canExport && <Button variant="outlined" startIcon={<Download size={16} />} onClick={(e) => setExportEl(e.currentTarget)}>Exportar relatório</Button>}
          <Menu anchorEl={exportEl} open={Boolean(exportEl)} onClose={() => setExportEl(null)} getContentAnchorEl={null} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
            <MenuItem onClick={() => exportReport("owner")}>Por consultor (planilha)</MenuItem>
            <MenuItem onClick={() => exportReport("polo")}>Por polo (planilha)</MenuItem>
          </Menu>
        </MainHeaderButtonsWrapper>
      </MainHeader>

      {d && (
        <div className={classes.scroll}>
          <div className={classes.kpis}>
            <Kpi label="Leads captados" value={d.kpi.leads} hint={`${d.kpi.open} em andamento`} />
            <Kpi label="Matrículas" value={d.kpi.won} hint={`${d.kpi.lost} perdidos`} />
            <Kpi label="Conversão" value={`${d.kpi.conversion.toFixed(1).replace(".", ",")}%`} hint="lead → matrícula" />
            <Kpi label="Tempo até o 1º contato" value={mins(d.kpi.avgFirstContactMin)} hint={d.kpi.businessHours ? "média, só horário comercial" : "média"} />
            <Kpi label="Tempo até a matrícula" value={d.kpi.avgDaysToEnroll === null ? "—" : `${Number(d.kpi.avgDaysToEnroll).toFixed(1).replace(".", ",")} dias`} hint="média" />
          </div>

          <div className={classes.alerts}>
            {[
              [Hourglass, "Aguardando 1º contato", d.attention.waitingFirstContact, "#d97706", "rgba(217,119,6,.14)", "/crm"],
              [AlertTriangle, "Tarefas atrasadas", d.attention.overdueTasks, "#dc2626", "rgba(220,38,38,.12)", "/crm/tarefas"],
              [Flame, "Leads esfriando (+3 dias)", d.attention.stale, "#0693E3", "rgba(6,147,227,.12)", "/crm?followUp=overdue"],
              [UserX, "Sem responsável", d.kpi.unassigned, "#64748b", "rgba(100,116,139,.14)", "/crm"],
            ].map(([Icon, label, value, fg, bg, to2]) => (
              <GlowCard key={label} className={classes.alert} onClick={() => history.push(to2)}>
                <span className={classes.alertIcon} style={{ background: bg, color: fg }}><Icon size={18} /></span>
                <div>
                  <div className={classes.label}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 600, color: value ? fg : undefined }}><NumberTicker value={value} /></div>
                </div>
              </GlowCard>
            ))}
          </div>

          <div className={classes.grid}>
            <GlowCard className={classes.card} style={span(7)}>
              <Typography variant="subtitle2" gutterBottom>Funil de matrícula</Typography>
              <Typography variant="caption" color="textSecondary" display="block" style={{ marginBottom: 8 }}>
                Leads que chegaram a cada etapa (a porcentagem é em relação à etapa anterior)
              </Typography>
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

            <GlowCard className={classes.card} style={span(5)}>
              <Typography variant="subtitle2" gutterBottom>Motivos de perda</Typography>
              {d.lostReasons.length === 0 ? <Typography color="textSecondary" variant="body2">Nenhuma perda no período.</Typography> : (
                <div className={classes.chart}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={d.lostReasons} dataKey="total" nameKey="name" innerRadius={48} outerRadius={80} paddingAngle={2}>
                        {d.lostReasons.map((r, i) => (<Cell key={r.name} fill={PIE[i % PIE.length]} />))}
                      </Pie>
                      <Tooltip /><Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </GlowCard>

            <GlowCard className={classes.card} style={span(12)}>
              <Typography variant="subtitle2" gutterBottom>Leads e matrículas por dia</Typography>
              <div className={classes.chart}>
                <ResponsiveContainer>
                  <AreaChart data={series}>
                    <defs>
                      <linearGradient id="gLeads" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0693E3" stopOpacity={0.35} /><stop offset="100%" stopColor="#0693E3" stopOpacity={0} /></linearGradient>
                      <linearGradient id="gWon" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#16a34a" stopOpacity={0.35} /><stop offset="100%" stopColor="#16a34a" stopOpacity={0} /></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="day" interval="preserveStartEnd" minTickGap={18} /><YAxis allowDecimals={false} /><Tooltip /><Legend />
                    <Area type="monotone" dataKey="leads" name="Leads" stroke="#0693E3" strokeWidth={2} fill="url(#gLeads)" />
                    <Area type="monotone" dataKey="matriculas" name="Matrículas" stroke="#16a34a" strokeWidth={2} fill="url(#gWon)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </GlowCard>

            <GlowCard className={classes.card} style={span(6)}>
              <Typography variant="subtitle2" gutterBottom>Origem dos leads</Typography>
              <Table size="small">
                <TableHead><TableRow><TableCell>Origem</TableCell><TableCell align="right">Leads</TableCell><TableCell align="right">Matrículas</TableCell><TableCell align="right">Conversão</TableCell></TableRow></TableHead>
                <TableBody>
                  {d.bySource.map((s) => (
                    <TableRow key={s.name}>
                      <TableCell><span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><SourceIcon source={s.name} />{s.name}</span></TableCell>
                      <TableCell align="right">{s.leads}</TableCell><TableCell align="right">{s.won}</TableCell><TableCell align="right">{pct(s.won, s.leads)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </GlowCard>

            <GlowCard className={classes.card} style={span(6)}>
              <Typography variant="subtitle2" gutterBottom>Cursos mais procurados</Typography>
              <div className={classes.chart}>
                <ResponsiveContainer>
                  <BarChart data={d.byCourse} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={120} /><Tooltip /><Legend />
                    <Bar dataKey="leads" name="Leads" fill="#0693E3" radius={[0, 6, 6, 0]} />
                    <Bar dataKey="won" name="Matrículas" fill="#0B4279" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlowCard>

            <GlowCard className={classes.card} style={span(12)}>
              <Typography variant="subtitle2" gutterBottom>Desempenho dos consultores</Typography>
              <Table size="small">
                <TableHead><TableRow><TableCell>Consultor</TableCell><TableCell align="right">Leads</TableCell><TableCell align="right">Em andamento</TableCell><TableCell align="right">Matrículas</TableCell><TableCell align="right">Conversão</TableCell><TableCell align="right">1º contato (média)</TableCell></TableRow></TableHead>
                <TableBody>
                  {d.byOwner.map((o) => (
                    <TableRow key={o.name}>
                      <TableCell>{o.name}</TableCell><TableCell align="right">{o.leads}</TableCell><TableCell align="right">{o.open}</TableCell>
                      <TableCell align="right"><b>{o.won}</b></TableCell><TableCell align="right">{pct(o.won, o.leads)}</TableCell><TableCell align="right">{mins(o.avgFirstContactMin)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </GlowCard>
          </div>
        </div>
      )}
      {!d && <LinearProgress />}
    </MainContainer>
  );
};

export default Panel;
