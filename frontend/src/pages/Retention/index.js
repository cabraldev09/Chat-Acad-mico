import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { Button, Checkbox, FormControlLabel, LinearProgress, MenuItem, Switch, Tab, Tabs, TextField, Typography, makeStyles } from "@material-ui/core";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, MessageSquare, Play, RefreshCw, Send, User } from "lucide-react";

import ConfirmationModal from "../../components/ConfirmationModal";
import openSocket from "../../services/socket-io";
import WhatsPreview, { fillSample } from "./Preview";
import Envios, { Composer } from "./Envios";
import Operacao from "./Operacao";
import { Adjust, NpsBlock, RelationshipBlock, RematBlock, RiskBlock, RunNow, useRetentionConfig } from "./Settings";
import Today from "./Today";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import { AuthContext } from "../../context/Auth/AuthContext";
import { isManager } from "../../utils/access";
import { downloadFile } from "../../utils/saveBlob";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => {
  const line = theme.palette.type === "dark" ? "rgba(255,255,255,.09)" : "#c9d6e8";
  return {
    body: { flex: 1, overflowY: "auto", overflowX: "hidden", ...theme.scrollbarStyles, paddingBottom: theme.spacing(4) },
    wrap: { maxWidth: 1180 },
    card: { background: theme.palette.cards.background, border: `1px solid ${line}`, borderRadius: 16, padding: theme.spacing(2.25), marginBottom: theme.spacing(2) },
    hint: { fontSize: 13, color: theme.palette.text.secondary },
    row: { display: "flex", gap: theme.spacing(1.25), flexWrap: "wrap", alignItems: "center" },
    kpis: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: theme.spacing(1.5), marginBottom: theme.spacing(2) },
    kpi: { border: `1px solid ${line}`, borderRadius: 14, padding: theme.spacing(1.5, 2), background: theme.palette.type === "dark" ? theme.palette.cards.background : theme.palette.cards.background, boxShadow: "0 1px 2px rgba(11,66,121,.06)" },
    big: { fontSize: 30, fontWeight: 700, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" },
    item: { display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: `1px solid ${line}`, flexWrap: "wrap" },
    chip: { fontSize: 12, fontWeight: 700, padding: "2px 9px", borderRadius: 999 },
    bar: { display: "flex", height: 12, borderRadius: 8, overflow: "hidden", margin: "8px 0" },
    // the three numbers on top: each one opens its tab
    strip: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: theme.spacing(1.5), marginBottom: theme.spacing(2) },
    stripCard: {
      textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "inherit", background: theme.palette.type === "dark" ? theme.palette.cards.background : theme.palette.cards.background, border: `1px solid ${line}`, boxShadow: "0 1px 2px rgba(11,66,121,.07)",
      borderLeftWidth: 4, borderRadius: 14, padding: theme.spacing(1.5, 2),
      "&:hover": { borderColor: theme.palette.primary.main }, "&:focus-visible": { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
    },
    toolbar: { display: "flex", gap: theme.spacing(1.25), flexWrap: "wrap", alignItems: "center", marginBottom: theme.spacing(1.5) },
    badge: { marginLeft: 6, fontSize: 11.5, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: "rgba(220,38,38,.14)", color: "#dc2626" },
    preview: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: theme.spacing(2), alignItems: "start", [theme.breakpoints.down("sm")]: { gridTemplateColumns: "1fr" } },
    diverge: { position: "relative", width: 120, height: 8, borderRadius: 6, background: theme.palette.action.hover },
  };
});

const KIND = { onboarding: "Após a ambientação", d30: "30 dias de matrícula", d90: "90 dias de matrícula" };
const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "");
const pctOf = (n, total) => (total > 0 ? (n / total) * 100 : 0);
const RANGES = [["30", "Últimos 30 dias"], ["90", "Últimos 90 dias"], ["365", "Último ano"]];
const RED = "#dc2626";
const AMBER = "#d97706";
const GREEN = "#16a34a";
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const npsColor = (v) => (v === null || v === undefined ? undefined : v >= 50 ? "#15803d" : v >= 0 ? "#b45309" : RED);

// loading, failure and the empty state the same way in every tab
const useLoad = (path, params) => {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const key = JSON.stringify(params || {});
  const load = useCallback(() => {
    setFailed(false);
    return api.get(path, { params: JSON.parse(key) }).then(({ data: d }) => setData(d)).catch((e) => { setFailed(true); toastError(e); });
  }, [path, key]);
  useEffect(() => { load(); }, [load]);
  return { data, setData, failed, load };
};

const Loading = ({ failed, retry }) => {
  const classes = useStyles();
  if (!failed) return <LinearProgress />;
  return (
    <div className={classes.card}>
      <div className={classes.row}>
        <Typography>Não foi possível carregar esta aba.</Typography>
        <Button size="small" variant="outlined" startIcon={<RefreshCw size={14} />} onClick={retry}>Tentar de novo</Button>
      </div>
    </div>
  );
};

// polo and tutor filters, built from what is on the list
const useStudentFilters = (students) => {
  const [polo, setPolo] = useState("");
  const [tutor, setTutor] = useState("");
  const [search, setSearch] = useState("");
  const polos = useMemo(() => [...new Map((students || []).filter((s) => s.poloId).map((s) => [s.poloId, s.polo])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]), "pt-BR")), [students]);
  const tutors = useMemo(() => [...new Map((students || []).filter((s) => s.tutorId).map((s) => [s.tutorId, s.tutor])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]), "pt-BR")), [students]);
  const q = search.trim().toLowerCase();
  const filtered = (students || []).filter((s) => (!polo || String(s.poloId) === String(polo)) && (!tutor || String(s.tutorId) === String(tutor)) && (!q || String(s.name).toLowerCase().includes(q)));
  return { polo, setPolo, tutor, setTutor, search, setSearch, polos, tutors, filtered };
};

const Filters = ({ f, showTutor }) => (
  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
    <TextField size="small" variant="outlined" label="Buscar aluno" value={f.search} onChange={(e) => f.setSearch(e.target.value)} style={{ width: 190 }} />
    {f.polos.length > 1 && (
      <TextField select size="small" variant="outlined" label="Polo" value={f.polo} onChange={(e) => f.setPolo(e.target.value)} style={{ minWidth: 170 }}>
        <MenuItem value="">Todos os polos</MenuItem>
        {f.polos.map(([id, name]) => <MenuItem key={id} value={id}>{name}</MenuItem>)}
      </TextField>
    )}
    {showTutor && f.tutors.length > 1 && (
      <TextField select size="small" variant="outlined" label="Tutor" value={f.tutor} onChange={(e) => f.setTutor(e.target.value)} style={{ minWidth: 170 }}>
        <MenuItem value="">Todos os tutores</MenuItem>
        {f.tutors.map(([id, name]) => <MenuItem key={id} value={id}>{name}</MenuItem>)}
      </TextField>
    )}
  </div>
);

const Sheet = ({ path, params, name }) => {
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); await downloadFile(path, params, name); setBusy(false); };
  return <Button size="small" variant="outlined" startIcon={<Download size={15} />} disabled={busy} onClick={go}>Baixar planilha</Button>;
};

// where a student can be opened: the lead (management and consultants) and the conversation
const OpenLinks = ({ s, canLead }) => {
  const history = useHistory();
  return (
    <>
      {canLead && <Button size="small" startIcon={<User size={14} />} onClick={() => history.push(`/crm?lead=${s.id}`)}>Abrir lead</Button>}
      {s.ticketId && <Button size="small" startIcon={<MessageSquare size={14} />} onClick={() => history.push(`/tickets/${s.ticketId}`)}>Abrir conversa</Button>}
    </>
  );
};

const Diverge = ({ value }) => {
  const classes = useStyles();
  if (value === null || value === undefined) return <span className={classes.hint}>—</span>;
  const w = Math.min(50, Math.abs(value) / 2);
  return (
    <span className={classes.diverge} aria-hidden="true">
      <span style={{ position: "absolute", left: "50%", top: -2, bottom: -2, width: 1, background: "currentColor", opacity: 0.35 }} />
      <span style={{ position: "absolute", top: 0, bottom: 0, borderRadius: 6, background: value >= 0 ? GREEN : RED, width: `${w}%`, left: value >= 0 ? "50%" : `${50 - w}%` }} />
    </span>
  );
};

// "Ajustar" over a tab: the managers change what happens here (the survey, the message, the period) without going to another screen
const TabAdjust = ({ Block, title, hint, defaultOpen, manager }) => {
  const { c, setC, save } = useRetentionConfig();
  if (!manager || !c) return null;
  return <Adjust title={title} hint={hint} defaultOpen={defaultOpen}><Block c={c} setC={setC} save={save} bare /></Adjust>;
};

const Nps = ({ manager }) => {
  const classes = useStyles();
  const [range, setRange] = useState("90");
  const period = useMemo(() => {
    const day = (t) => t.toLocaleDateString("en-CA", { timeZone: "America/Porto_Velho" });
    const to = new Date();
    return { from: day(new Date(to.getTime() - (Number(range) - 1) * 86400000)), to: day(to) };
  }, [range]);
  const { data: d, failed, load } = useLoad("/retention/nps", period);
  if (!d) return <Loading failed={failed} retry={load} />;
  const total = d.answered;
  const series = (d.series || []).map((w) => ({ ...w, label: new Date(`${w.week}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) }));
  return (
    <div>
      <TabAdjust manager={manager} Block={NpsBlock} title="Ajustar a pesquisa de satisfação" hint="Ligar ou desligar, a pergunta, os momentos e os botões" />
      <div className={classes.toolbar}>
        <TextField select size="small" variant="outlined" label="Período" value={range} onChange={(e) => setRange(e.target.value)} style={{ width: 200 }}>
          {RANGES.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
        </TextField>
        <Typography className={classes.hint} style={{ flex: 1, minWidth: 220 }}>Pesquisas enviadas pelo WhatsApp: o aluno responde com um número de 0 a 10.{!manager ? " Você vê só os alunos que acompanha." : ""}</Typography>
        <Sheet path="/retention/nps.csv" params={period} name={`satisfacao-${period.from}-a-${period.to}.csv`} />
      </div>
      <div className={classes.kpis}>
        <div className={classes.kpi}><div className={classes.hint}>NPS</div><div className={classes.big} style={{ color: npsColor(d.nps) }}>{d.nps === null ? "—" : d.nps}</div></div>
        <div className={classes.kpi}><div className={classes.hint}>Respostas</div><div className={classes.big}>{d.answered}</div></div>
        <div className={classes.kpi}><div className={classes.hint}>Enviadas</div><div className={classes.big}>{d.sent}</div></div>
        <div className={classes.kpi}><div className={classes.hint}>Taxa de resposta</div><div className={classes.big}>{d.responseRate === null ? "—" : `${d.responseRate}%`}</div></div>
      </div>
      <div className={classes.card}>
        <Typography style={{ fontWeight: 600 }}>Quem respondeu</Typography>
        {total === 0 ? <Typography className={classes.hint} style={{ marginTop: 6 }}>Ainda sem respostas neste período.{manager ? " Ligue a pesquisa em “Ajustar a pesquisa” acima." : " Quando seus alunos responderem, as notas aparecem aqui."}</Typography> : (
          <>
            <div className={classes.bar}>
              <span style={{ width: `${pctOf(d.promoters, total)}%`, background: GREEN }} />
              <span style={{ width: `${pctOf(d.neutrals, total)}%`, background: "#f59e0b" }} />
              <span style={{ width: `${pctOf(d.detractors, total)}%`, background: RED }} />
            </div>
            <div className={classes.row}>
              <span className={classes.hint}><b style={{ color: GREEN }}>{d.promoters}</b> promotores (9 e 10)</span>
              <span className={classes.hint}><b style={{ color: "#b45309" }}>{d.neutrals}</b> neutros (7 e 8)</span>
              <span className={classes.hint}><b style={{ color: RED }}>{d.detractors}</b> detratores (0 a 6)</span>
            </div>
          </>
        )}
      </div>
      <div className={classes.card}>
        <Typography style={{ fontWeight: 600 }}>Evolução por semana</Typography>
        {series.length < 2 ? (
          <Typography className={classes.hint} style={{ marginTop: 6 }}>O gráfico aparece quando houver respostas em pelo menos duas semanas.</Typography>
        ) : (
          <div style={{ height: 200, marginTop: 8 }}>
            <ResponsiveContainer>
              <LineChart data={series} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.35} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis domain={[-100, 100]} tickLine={false} axisLine={false} fontSize={12} />
                <ReferenceLine y={0} stroke="currentColor" opacity={0.3} />
                <Tooltip formatter={(v, n, item) => [`${v} (${item.payload.answered} respostas)`, "NPS"]} labelFormatter={(l) => `Semana de ${l}`} />
                <Line type="monotone" dataKey="nps" stroke="#0693E3" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <div className={classes.card}>
        <Typography style={{ fontWeight: 600 }}>Por momento da pesquisa</Typography>
        {d.byKind.map((k) => (
          <div key={k.kind} className={classes.item}>
            <span style={{ flex: 1, minWidth: 150 }}>{KIND[k.kind]}</span>
            <span className={classes.hint}>{plural(k.answered, "resposta", "respostas")}</span>
            <Diverge value={k.nps} />
            <b style={{ width: 44, textAlign: "right", color: npsColor(k.nps) }} title="NPS do momento">{k.nps === null || k.nps === undefined ? "—" : k.nps}</b>
            <span className={classes.hint} style={{ width: 70, textAlign: "right" }} title="Nota média">média {k.avg === null ? "—" : String(k.avg).replace(".", ",")}</span>
          </div>
        ))}
      </div>
      {d.comments.length > 0 && (
        <div className={classes.card}>
          <Typography style={{ fontWeight: 600 }}>O que os alunos disseram</Typography>
          {d.commentsTotal > d.comments.length && <Typography className={classes.hint}>Mostrando os {d.comments.length} mais recentes de {d.commentsTotal}. A planilha traz todos.</Typography>}
          {d.comments.map((c) => (
            <div key={c.id} className={classes.item}>
              <span className={classes.chip} style={{ background: c.score >= 9 ? "rgba(22,163,74,.15)" : c.score >= 7 ? "rgba(245,158,11,.18)" : "rgba(220,38,38,.14)", color: c.score >= 9 ? "#15803d" : c.score >= 7 ? "#b45309" : RED }}>{c.score}</span>
              <div style={{ flex: 1, minWidth: 200 }}><div>{c.comment}</div><div className={classes.hint}>{c.lead} · {fmt(c.at)}</div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Risk = ({ manager, onChanged }) => {
  const classes = useStyles();
  const { data: d, setData, failed, load } = useLoad("/retention/risk");
  const [busy, setBusy] = useState(0);
  const [ask, setAsk] = useState(null);
  const f = useStudentFilters(d && d.students);
  const message = async (s) => {
    setBusy(s.id);
    try {
      await api.post(`/retention/risk/${s.id}/message`);
      toast.success(`Mensagem enviada para ${s.name}.`);
      setData((cur) => ({ ...cur, students: cur.students.map((x) => (x.id === s.id ? { ...x, messagedAt: new Date().toISOString() } : x)) }));
      onChanged();
    } catch (e) { toastError(e); }
    setBusy(0);
  };
  if (!d) return <Loading failed={failed} retry={load} />;
  return (
    <>
    <TabAdjust manager={manager} Block={RiskBlock} title="Ajustar a mensagem e os dias sem notícias" hint="Quantos dias sem escrever viram risco e o texto enviado ao aluno" />
    <div className={classes.card}>
      <div className={classes.toolbar} style={{ marginBottom: 4 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <Typography style={{ fontWeight: 600 }}>Alunos sem notícias há {d.riskDays} dias ou mais</Typography>
          <Typography className={classes.hint}>Alunos matriculados que não escrevem há tempo. Eles recebem a etiqueta “Risco de evasão” e uma tarefa para o tutor, e a etiqueta sai quando voltam a escrever.</Typography>
        </div>
        <Sheet path="/retention/risk.csv" name="alunos-em-risco.csv" />
      </div>
      {d.students.length > 0 && <Filters f={f} showTutor={manager} />}
      {d.total > d.students.length && <Typography className={classes.hint} style={{ marginTop: 8 }}>Mostrando os {d.students.length} que estão há mais tempo sem notícias, de {d.total}. A planilha traz todos.</Typography>}
      {d.students.length === 0 && <Typography className={classes.hint} style={{ marginTop: 10 }}>Ninguém em risco agora.</Typography>}
      {d.students.length > 0 && f.filtered.length === 0 && <Typography className={classes.hint} style={{ marginTop: 10 }}>Nenhum aluno com esses filtros.</Typography>}
      {f.filtered.map((s) => (
        <div key={s.id} className={classes.item}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 600 }}>{s.name}</div>
            <div className={classes.hint}>{[s.polo, s.tutor ? `tutor: ${s.tutor}` : null].filter(Boolean).join(" · ") || "Sem polo"}</div>
            {s.messagedAt && <div className={classes.hint} style={{ color: "#0369a1" }}>Mensagem de retenção enviada em {fmt(s.messagedAt)}</div>}
          </div>
          <span className={classes.chip} style={s.level === "high" ? { background: "rgba(220,38,38,.14)", color: RED } : { background: "rgba(234,88,12,.15)", color: "#c2410c" }}>{s.days} dias</span>
          <OpenLinks s={s} canLead={manager} />
          <Button size="small" variant="outlined" startIcon={<Send size={14} />} disabled={busy === s.id} onClick={() => setAsk(s)}>Enviar mensagem</Button>
        </div>
      ))}
      <ConfirmationModal title="Enviar mensagem de retenção?" open={!!ask} onClose={() => setAsk(null)} onConfirm={() => ask && message(ask)}>
        {ask ? `A mensagem de retenção será enviada agora, pelo WhatsApp, para ${ask.name}.${ask.messagedAt ? ` Esse aluno já recebeu uma em ${fmt(ask.messagedAt)}.` : ""}` : ""}
      </ConfirmationModal>
    </div>
    </>
  );
};

const Rematricula = ({ manager, onChanged }) => {
  const classes = useStyles();
  const { data: d, failed, load } = useLoad("/retention/rematricula");
  const pendingFilters = useStudentFilters(d && d.pendingStudents);
  const mark = async (s, undo) => { try { await api.post(`/retention/rematricula/${s.id}`, { undo }); await load(); onChanged(); } catch (e) { toastError(e); } };
  if (!d) return <Loading failed={failed} retry={load} />;
  const c = d.config;
  if (!c.term) {
    return (
      <>
      <TabAdjust manager={manager} Block={RematBlock} defaultOpen title="Definir o período da rematrícula" hint="Período, datas de abertura e fechamento e o aviso por WhatsApp" />
      <div className={classes.card}>
        <Typography style={{ fontWeight: 600 }}>Rematrícula ainda não configurada</Typography>
        <Typography className={classes.hint}>{manager ? "Informe o período e as datas no painel acima para acompanhar quem já renovou." : "A coordenação ainda não definiu o período de rematrícula."}</Typography>
      </div>
      </>
    );
  }
  const state = { off: "Sem período", before: `Abre em ${fmt(c.startsAt)}`, open: d.daysLeft === 0 ? "Termina hoje" : `Termina em ${plural(d.daysLeft, "dia", "dias")}`, closed: "Encerrada" }[d.window];
  const urgent = d.window === "open" && d.daysLeft !== null && d.daysLeft <= 7 && d.pending > 0;
  return (
    <div>
      <TabAdjust manager={manager} Block={RematBlock} title="Ajustar a rematrícula" hint="Período, datas e a mensagem de aviso" />
      <div className={classes.card}>
        <div className={classes.row}>
          <Typography style={{ fontWeight: 700, fontSize: 18 }}>Rematrícula {c.term}</Typography>
          <span className={classes.chip} style={{ background: urgent ? "rgba(220,38,38,.14)" : d.window === "open" ? "rgba(14,165,233,.15)" : "rgba(100,116,139,.18)", color: urgent ? RED : d.window === "open" ? "#0369a1" : "#475569" }}>{state}</span>
          <Typography className={classes.hint} style={{ flex: 1 }}>{fmt(c.startsAt)} a {fmt(c.endsAt)}</Typography>
          <Sheet path="/retention/rematricula.csv" name="rematricula.csv" />
        </div>
        <LinearProgress variant="determinate" value={d.rate || 0} style={{ height: 10, borderRadius: 8, margin: "12px 0 6px" }} />
        <Typography className={classes.hint}><b>{d.done}</b> de {d.total} alunos já renovaram{d.rate !== null ? ` (${d.rate}%)` : ""}.</Typography>
      </div>
      <div className={classes.card}>
        <Typography style={{ fontWeight: 600, marginBottom: 8 }}>Faltam renovar ({d.pending})</Typography>
        {d.pendingStudents.length > 0 && <Filters f={pendingFilters} showTutor={manager} />}
        {d.pending > d.pendingStudents.length && <Typography className={classes.hint} style={{ marginTop: 8 }}>Mostrando {d.pendingStudents.length} de {d.pending}. A planilha traz todos.</Typography>}
        {d.pendingStudents.length === 0 && <Typography className={classes.hint}>Todos renovaram. 🎓</Typography>}
        {pendingFilters.filtered.map((s) => (
          <div key={s.id} className={classes.item}>
            <div style={{ flex: 1, minWidth: 200 }}><div style={{ fontWeight: 600 }}>{s.name}</div><div className={classes.hint}>{[s.polo, s.tutor ? `tutor: ${s.tutor}` : null].filter(Boolean).join(" · ")}</div></div>
            <OpenLinks s={s} canLead={manager} />
            <Button size="small" variant="contained" color="primary" onClick={() => mark(s, false)}>Marcar como rematriculado</Button>
          </div>
        ))}
      </div>
      {d.doneStudents.length > 0 && (
        <div className={classes.card}>
          <Typography style={{ fontWeight: 600 }}>Já renovaram ({d.done})</Typography>
          {d.done > d.doneStudents.length && <Typography className={classes.hint}>Mostrando {d.doneStudents.length} de {d.done}.</Typography>}
          {d.doneStudents.map((s) => (
            <div key={s.id} className={classes.item}>
              <div style={{ flex: 1, minWidth: 200 }}><div>{s.name}</div><div className={classes.hint}>{fmt(s.at)}</div></div>
              <Button size="small" onClick={() => mark(s, true)}>Desfazer</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// "Configurar" keeps only what is not tied to one tab: the number the messages leave from, and running the routine by hand
const Config = () => {
  const { c, setC, save } = useRetentionConfig();
  if (!c) return null;
  return (
    <div>
      <RelationshipBlock c={c} setC={setC} save={save} />
      <RunNow />
    </div>
  );
};

// Retention: satisfaction of the students, who is at risk of dropping out and the re-enrollment of the next period.
// On top, the three numbers that ask for action; each one opens its tab.
const Retention = () => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);
  const manager = isManager(user);
  const [tab, setTab] = useState("hoje");
  const [summary, setSummary] = useState(null);
  const [compose, setCompose] = useState(false);
  const [serverOld, setServerOld] = useState(false);
  const loadSummary = useCallback(() => api.get("/retention/summary")
    .then(({ data }) => { setServerOld(false); setSummary(data); })
    .catch((err) => { if (err && err.response && err.response.status === 404) setServerOld(true); }), []);
  useEffect(() => { loadSummary(); }, [loadSummary]);
  // a student gave a low score: the team sees it at once
  useEffect(() => {
    const socket = openSocket();
    const mine = (d) => manager || !d.tutorId || d.tutorId === user.id;
    socket.on("npsAlert", (d) => {
      if (!mine(d)) return;
      toast.warn(`${d.leadName} deu nota ${d.score} na pesquisa de satisfação. Veja em Satisfação e fale com o aluno.`, { autoClose: 12000, toastId: `nps-${d.leadId}-${d.score}` });
      loadSummary();
    });
    return () => socket.disconnect();
  }, [loadSummary, manager, user.id]);

  const r = summary && summary.risk;
  const m = summary && summary.rematricula;
  const n = summary && summary.nps;
  const remState = !m ? "" : !m.term ? "Período não configurado" : m.window === "open" ? (m.daysLeft === 0 ? "Termina hoje" : `Termina em ${plural(m.daysLeft, "dia", "dias")}`) : m.window === "before" ? "Ainda não abriu" : m.window === "closed" ? "Encerrada" : "Sem período";
  const remTone = !m || !m.term ? "#64748b" : m.window === "open" && m.daysLeft <= 7 && m.pending > 0 ? RED : m.pending > 0 && m.window === "open" ? AMBER : GREEN;
  const open = n ? n.detractorsOpen || 0 : 0;
  const cards = !summary ? [] : [
    ["risk", "Em risco de evasão", r.total, r.total === 0 ? "Ninguém sem notícias agora" : `${r.high} em nível alto · sem notícias há ${r.days}+ dias`, r.high > 0 ? RED : r.total > 0 ? AMBER : GREEN],
    ["remat", m.term ? `Faltam renovar (${m.term})` : "Rematrícula", m.term ? m.pending : "—", remState, remTone],
    ["nps", "Satisfação (30 dias)", n.value === null ? "—" : n.value, open > 0 ? `${plural(open, "detrator", "detratores")} para atender` : n.answered === 0 ? "Sem respostas no período" : `${plural(n.answered, "resposta", "respostas")} · tudo atendido`, open > 0 || n.detractors > 0 ? RED : n.value !== null && n.value >= 50 ? GREEN : AMBER],
  ];

  return (
    <MainContainer>
      <Composer open={compose} onClose={() => setCompose(false)} onSent={() => { loadSummary(); }} manager={manager} />
      <MainHeader>
        <Title>Retenção</Title>
        <Button variant="contained" color="primary" startIcon={<Send size={16} />} disabled={serverOld} onClick={() => setCompose(true)}>Novo envio</Button>
      </MainHeader>
      <div className={classes.body}>
        <div className={classes.wrap}>
          {serverOld && (
            <div className={classes.card} style={{ borderLeft: "4px solid #d97706" }}>
              <Typography style={{ fontWeight: 600 }}>O servidor ainda não recebeu a atualização desta tela</Typography>
              <Typography className={classes.hint}>O resumo, os envios e os dados da operação aparecem assim que a atualização for instalada. As demais abas continuam funcionando.</Typography>
            </div>
          )}
          {summary && (
            <div className={classes.strip}>
              {cards.map(([target, label, value, sub, color]) => (
                <button key={label} type="button" className={classes.stripCard} style={{ borderLeftColor: color }} onClick={() => setTab(target)}>
                  <div className={classes.hint}>{label}</div>
                  <div className={classes.big} style={{ color }}>{value}</div>
                  <div className={classes.hint}>{sub}</div>
                </button>
              ))}
            </div>
          )}
          <Tabs value={tab} onChange={(e, v) => setTab(v)} indicatorColor="primary" textColor="primary" variant="scrollable" scrollButtons="auto" style={{ marginBottom: 16 }}>
            <Tab value="hoje" label={<span>Hoje{summary && (r.total + open) > 0 ? <span className={classes.badge}>{r.total + open}</span> : null}</span>} />
            <Tab value="nps" label={<span>Satisfação (NPS){open > 0 ? <span className={classes.badge}>{open}</span> : null}</span>} />
            <Tab value="risk" label={<span>Risco de evasão{r && r.total > 0 ? <span className={classes.badge}>{r.total}</span> : null}</span>} />
            <Tab value="remat" label={<span>Rematrícula{m && m.pending > 0 && m.window === "open" ? <span className={classes.badge}>{m.pending}</span> : null}</span>} />
            <Tab value="envios" label="Envios" />
            <Tab value="operacao" label="Operação" />
            {manager && <Tab value="config" label="Número de envio" />}
          </Tabs>
          {tab === "hoje" && <Today onChanged={loadSummary} />}
          {tab === "nps" && <Nps manager={manager} />}
          {tab === "risk" && <Risk manager={manager} onChanged={loadSummary} />}
          {tab === "remat" && <Rematricula manager={manager} onChanged={loadSummary} />}
          {tab === "envios" && <Envios manager={manager} canCompose />}
          {tab === "operacao" && <Operacao />}
          {tab === "config" && manager && <Config />}
        </div>
      </div>
    </MainContainer>
  );
};

export default Retention;
