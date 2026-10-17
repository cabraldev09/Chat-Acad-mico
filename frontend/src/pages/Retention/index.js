import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Button, Checkbox, FormControlLabel, LinearProgress, MenuItem, Switch, Tab, Tabs, TextField, Typography, makeStyles } from "@material-ui/core";
import { Play, Send } from "lucide-react";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import { AuthContext } from "../../context/Auth/AuthContext";
import { isManager } from "../../utils/access";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => {
  const line = theme.palette.type === "dark" ? "rgba(255,255,255,.09)" : "#e3e9f1";
  return {
    body: { flex: 1, overflowY: "auto", overflowX: "hidden", ...theme.scrollbarStyles, paddingBottom: theme.spacing(4) },
    wrap: { maxWidth: 980, margin: "0 auto" },
    card: { background: theme.palette.cards.background, border: `1px solid ${line}`, borderRadius: 16, padding: theme.spacing(2.25), marginBottom: theme.spacing(2) },
    hint: { fontSize: 13, color: theme.palette.text.secondary },
    row: { display: "flex", gap: theme.spacing(1.25), flexWrap: "wrap", alignItems: "center" },
    kpis: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: theme.spacing(1.5), marginBottom: theme.spacing(2) },
    kpi: { border: `1px solid ${line}`, borderRadius: 14, padding: theme.spacing(1.5, 2), background: theme.palette.cards.background },
    big: { fontSize: 30, fontWeight: 700, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" },
    item: { display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: `1px solid ${line}`, flexWrap: "wrap" },
    chip: { fontSize: 12, fontWeight: 700, padding: "2px 9px", borderRadius: 999 },
    bar: { display: "flex", height: 12, borderRadius: 8, overflow: "hidden", margin: "8px 0" },
  };
});

const KIND = { onboarding: "Após a ambientação", d30: "30 dias de matrícula", d90: "90 dias de matrícula" };
const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "");
const pctOf = (n, total) => (total > 0 ? (n / total) * 100 : 0);
const RANGES = [["30", "Últimos 30 dias"], ["90", "Últimos 90 dias"], ["365", "Último ano"]];

const Nps = () => {
  const classes = useStyles();
  const [range, setRange] = useState("90");
  const [d, setD] = useState(null);
  const period = useMemo(() => {
    const day = (t) => t.toLocaleDateString("en-CA", { timeZone: "America/Porto_Velho" });
    const to = new Date();
    return { from: day(new Date(to.getTime() - (Number(range) - 1) * 86400000)), to: day(to) };
  }, [range]);
  useEffect(() => { api.get("/retention/nps", { params: period }).then(({ data }) => setD(data)).catch(toastError); }, [period]);
  if (!d) return null;
  const total = d.answered;
  return (
    <div>
      <div className={classes.row} style={{ marginBottom: 14 }}>
        <TextField select size="small" variant="outlined" label="Período" value={range} onChange={(e) => setRange(e.target.value)} style={{ width: 200 }}>
          {RANGES.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
        </TextField>
        <Typography className={classes.hint}>Pesquisas enviadas pelo WhatsApp: o aluno responde com um número de 0 a 10.</Typography>
      </div>
      <div className={classes.kpis}>
        <div className={classes.kpi}><div className={classes.hint}>NPS</div><div className={classes.big} style={{ color: d.nps === null ? undefined : d.nps >= 50 ? "#15803d" : d.nps >= 0 ? "#b45309" : "#dc2626" }}>{d.nps === null ? "—" : d.nps}</div></div>
        <div className={classes.kpi}><div className={classes.hint}>Respostas</div><div className={classes.big}>{d.answered}</div></div>
        <div className={classes.kpi}><div className={classes.hint}>Enviadas</div><div className={classes.big}>{d.sent}</div></div>
        <div className={classes.kpi}><div className={classes.hint}>Taxa de resposta</div><div className={classes.big}>{d.responseRate === null ? "—" : `${d.responseRate}%`}</div></div>
      </div>
      <div className={classes.card}>
        <Typography style={{ fontWeight: 600 }}>Quem respondeu</Typography>
        {total === 0 ? <Typography className={classes.hint} style={{ marginTop: 6 }}>Ainda sem respostas neste período. Ligue a pesquisa na aba Configurar.</Typography> : (
          <>
            <div className={classes.bar}>
              <span style={{ width: `${pctOf(d.promoters, total)}%`, background: "#16a34a" }} />
              <span style={{ width: `${pctOf(d.neutrals, total)}%`, background: "#f59e0b" }} />
              <span style={{ width: `${pctOf(d.detractors, total)}%`, background: "#dc2626" }} />
            </div>
            <div className={classes.row}>
              <span className={classes.hint}><b style={{ color: "#16a34a" }}>{d.promoters}</b> promotores (9 e 10)</span>
              <span className={classes.hint}><b style={{ color: "#b45309" }}>{d.neutrals}</b> neutros (7 e 8)</span>
              <span className={classes.hint}><b style={{ color: "#dc2626" }}>{d.detractors}</b> detratores (0 a 6)</span>
            </div>
          </>
        )}
        <div style={{ marginTop: 12 }}>
          {d.byKind.map((k) => <div key={k.kind} className={classes.item}><span style={{ flex: 1 }}>{KIND[k.kind]}</span><span className={classes.hint}>{k.answered} resposta{k.answered === 1 ? "" : "s"}</span><b>{k.avg === null ? "—" : String(k.avg).replace(".", ",")}</b></div>)}
        </div>
      </div>
      {d.comments.length > 0 && (
        <div className={classes.card}>
          <Typography style={{ fontWeight: 600 }}>O que os alunos disseram</Typography>
          {d.comments.map((c) => (
            <div key={c.id} className={classes.item}>
              <span className={classes.chip} style={{ background: c.score >= 9 ? "rgba(22,163,74,.15)" : c.score >= 7 ? "rgba(245,158,11,.18)" : "rgba(220,38,38,.14)", color: c.score >= 9 ? "#15803d" : c.score >= 7 ? "#b45309" : "#dc2626" }}>{c.score}</span>
              <div style={{ flex: 1, minWidth: 200 }}><div>{c.comment}</div><div className={classes.hint}>{c.lead} · {fmt(c.at)}</div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Risk = () => {
  const classes = useStyles();
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(0);
  const load = useCallback(() => api.get("/retention/risk").then(({ data }) => setD(data)).catch(toastError), []);
  useEffect(() => { load(); }, [load]);
  const message = async (s) => {
    setBusy(s.id);
    try { await api.post(`/retention/risk/${s.id}/message`); toast.success(`Mensagem enviada para ${s.name}.`); } catch (e) { toastError(e); }
    setBusy(0);
  };
  if (!d) return null;
  return (
    <div className={classes.card}>
      <Typography style={{ fontWeight: 600 }}>Alunos sem notícias há {d.riskDays} dias ou mais</Typography>
      <Typography className={classes.hint}>Alunos matriculados que não escrevem há tempo. Eles recebem a etiqueta “Risco de evasão” e uma tarefa para o tutor, e a etiqueta sai quando voltam a escrever.</Typography>
      {d.students.length === 0 && <Typography className={classes.hint} style={{ marginTop: 10 }}>Ninguém em risco agora.</Typography>}
      {d.students.map((s) => (
        <div key={s.id} className={classes.item}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 600 }}>{s.name}</div>
            <div className={classes.hint}>{[s.polo, s.tutor ? `tutor: ${s.tutor}` : null].filter(Boolean).join(" · ") || "Sem polo"}</div>
          </div>
          <span className={classes.chip} style={s.level === "high" ? { background: "rgba(220,38,38,.14)", color: "#dc2626" } : { background: "rgba(234,88,12,.15)", color: "#c2410c" }}>{s.days} dias</span>
          <Button size="small" variant="outlined" startIcon={<Send size={14} />} disabled={busy === s.id} onClick={() => message(s)}>Enviar mensagem</Button>
        </div>
      ))}
    </div>
  );
};

const Rematricula = () => {
  const classes = useStyles();
  const [d, setD] = useState(null);
  const load = useCallback(() => api.get("/retention/rematricula").then(({ data }) => setD(data)).catch(toastError), []);
  useEffect(() => { load(); }, [load]);
  const mark = async (s, undo) => { try { await api.post(`/retention/rematricula/${s.id}`, { undo }); await load(); } catch (e) { toastError(e); } };
  if (!d) return null;
  const c = d.config;
  if (!c.term) return <div className={classes.card}><Typography style={{ fontWeight: 600 }}>Rematrícula ainda não configurada</Typography><Typography className={classes.hint}>Informe o período e as datas na aba Configurar para acompanhar quem já renovou.</Typography></div>;
  const state = { off: "Sem período", before: `Abre em ${fmt(c.startsAt)}`, open: d.daysLeft === 0 ? "Termina hoje" : `Termina em ${d.daysLeft} dia${d.daysLeft === 1 ? "" : "s"}`, closed: "Encerrada" }[d.window];
  return (
    <div>
      <div className={classes.card}>
        <div className={classes.row}>
          <Typography style={{ fontWeight: 700, fontSize: 18 }}>Rematrícula {c.term}</Typography>
          <span className={classes.chip} style={{ background: d.window === "open" ? "rgba(14,165,233,.15)" : "rgba(100,116,139,.18)", color: d.window === "open" ? "#0369a1" : "#475569" }}>{state}</span>
          <Typography className={classes.hint}>{fmt(c.startsAt)} a {fmt(c.endsAt)}</Typography>
        </div>
        <LinearProgress variant="determinate" value={d.rate || 0} style={{ height: 10, borderRadius: 8, margin: "12px 0 6px" }} />
        <Typography className={classes.hint}><b>{d.done}</b> de {d.total} alunos já renovaram{d.rate !== null ? ` (${d.rate}%)` : ""}.</Typography>
      </div>
      <div className={classes.card}>
        <Typography style={{ fontWeight: 600 }}>Faltam renovar ({d.pending})</Typography>
        {d.pendingStudents.length === 0 && <Typography className={classes.hint}>Todos renovaram. 🎓</Typography>}
        {d.pendingStudents.map((s) => (
          <div key={s.id} className={classes.item}>
            <div style={{ flex: 1, minWidth: 200 }}><div style={{ fontWeight: 600 }}>{s.name}</div><div className={classes.hint}>{[s.polo, s.tutor ? `tutor: ${s.tutor}` : null].filter(Boolean).join(" · ")}</div></div>
            <Button size="small" variant="contained" color="primary" onClick={() => mark(s, false)}>Marcar como rematriculado</Button>
          </div>
        ))}
      </div>
      {d.doneStudents.length > 0 && (
        <div className={classes.card}>
          <Typography style={{ fontWeight: 600 }}>Já renovaram ({d.done})</Typography>
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

const Config = () => {
  const classes = useStyles();
  const [c, setC] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/retention/config").then(({ data }) => setC(data)).catch(toastError); }, []);
  if (!c) return null;
  const save = async (patch, ok = "Salvo.") => { try { const { data } = await api.put("/retention/config", patch); setC(data); toast.success(ok); } catch (e) { toastError(e); } };
  const run = async () => {
    setBusy(true);
    try { const { data } = await api.post("/retention/run"); toast.success(`Rodado: ${data.nps} pesquisa(s), ${data.risk} aluno(s) em risco novo(s), ${data.rematricula} lembrete(s) de rematrícula.`); } catch (e) { toastError(e); }
    setBusy(false);
  };
  const r = c.rematricula;
  return (
    <div>
      <div className={classes.card}>
        <Typography style={{ fontWeight: 600 }}>Pesquisa de satisfação (NPS)</Typography>
        <Typography className={classes.hint} gutterBottom>Começa desligada. Ligada, o sistema pergunta pelo WhatsApp, de 0 a 10, o quanto o aluno recomendaria a instituição, e guarda a nota e o motivo. Nota de 0 a 6 vira tarefa para o tutor.</Typography>
        <FormControlLabel control={<Switch color="primary" checked={!!c.nps.enabled} onChange={(e) => save({ nps: { enabled: e.target.checked } })} />} label={c.nps.enabled ? "Pesquisa ligada" : "Pesquisa desligada"} />
        <div className={classes.row}>
          {c.npsKinds.map((k) => (
            <FormControlLabel key={k} control={<Checkbox color="primary" checked={c.nps.moments.includes(k)} onChange={(e) => save({ nps: { moments: e.target.checked ? [...c.nps.moments, k] : c.nps.moments.filter((m) => m !== k) } })} />} label={KIND[k]} />
          ))}
        </div>
        <TextField fullWidth multiline rows={2} size="small" variant="outlined" label="Pergunta (use {{nome}})" value={c.nps.question} onChange={(e) => setC({ ...c, nps: { ...c.nps, question: e.target.value } })} onBlur={() => save({ nps: { question: c.nps.question } })} style={{ marginTop: 8 }} />
      </div>

      <div className={classes.card}>
        <Typography style={{ fontWeight: 600 }}>Risco de evasão</Typography>
        <Typography className={classes.hint} gutterBottom>Aluno matriculado que não escreve há esse tempo entra em risco.</Typography>
        <div className={classes.row}>
          <TextField size="small" variant="outlined" type="number" label="Dias sem notícias" value={c.risk.days} onChange={(e) => setC({ ...c, risk: { ...c.risk, days: e.target.value } })} onBlur={() => save({ risk: { days: c.risk.days } })} style={{ width: 170 }} />
        </div>
        <TextField fullWidth multiline rows={2} size="small" variant="outlined" label="Mensagem de retenção (use {{nome}})" value={c.risk.message} onChange={(e) => setC({ ...c, risk: { ...c.risk, message: e.target.value } })} onBlur={() => save({ risk: { message: c.risk.message } })} style={{ marginTop: 8 }} />
      </div>

      <div className={classes.card}>
        <Typography style={{ fontWeight: 600 }}>Rematrícula</Typography>
        <Typography className={classes.hint} gutterBottom>O período a renovar e a janela em que os alunos podem fazer isso. Durante a janela, quem ainda não renovou fica com a etiqueta “Rematrícula pendente” e o tutor recebe uma tarefa.</Typography>
        <div className={classes.row}>
          <TextField size="small" variant="outlined" label="Período (ex.: 2026/2)" value={r.term} onChange={(e) => setC({ ...c, rematricula: { ...r, term: e.target.value } })} onBlur={() => save({ rematricula: { term: r.term } })} style={{ width: 170 }} />
          <TextField size="small" variant="outlined" type="date" label="Abre em" InputLabelProps={{ shrink: true }} value={r.startsAt} onChange={(e) => setC({ ...c, rematricula: { ...r, startsAt: e.target.value } })} onBlur={() => save({ rematricula: { startsAt: r.startsAt } })} style={{ width: 170 }} />
          <TextField size="small" variant="outlined" type="date" label="Fecha em" InputLabelProps={{ shrink: true }} value={r.endsAt} onChange={(e) => setC({ ...c, rematricula: { ...r, endsAt: e.target.value } })} onBlur={() => save({ rematricula: { endsAt: r.endsAt } })} style={{ width: 170 }} />
        </div>
        <FormControlLabel control={<Switch color="primary" checked={!!r.auto} onChange={(e) => save({ rematricula: { auto: e.target.checked } })} />} label="Avisar os alunos por WhatsApp (na abertura, 7 dias antes e na véspera do fim)" />
        {r.auto && <TextField fullWidth multiline rows={2} size="small" variant="outlined" label="Mensagem (use {{nome}} e {{periodo}})" value={r.message} onChange={(e) => setC({ ...c, rematricula: { ...r, message: e.target.value } })} onBlur={() => save({ rematricula: { message: r.message } })} />}
      </div>

      <Button variant="outlined" startIcon={<Play size={15} />} disabled={busy} onClick={run}>Rodar agora</Button>
      <Typography className={classes.hint} style={{ marginTop: 6 }}>O sistema roda sozinho a cada 10 minutos; este botão serve para ver o resultado na hora.</Typography>
    </div>
  );
};

// Retention: satisfaction of the students, who is at risk of dropping out and the re-enrollment of the next period.
const Retention = () => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);
  const manager = isManager(user);
  const [tab, setTab] = useState(0);
  return (
    <MainContainer>
      <MainHeader><Title>Retenção</Title></MainHeader>
      <div className={classes.body}>
        <div className={classes.wrap}>
          <Tabs value={tab} onChange={(e, v) => setTab(v)} indicatorColor="primary" textColor="primary" variant="scrollable" scrollButtons="auto" style={{ marginBottom: 16 }}>
            <Tab label="Satisfação (NPS)" />
            <Tab label="Risco de evasão" />
            <Tab label="Rematrícula" />
            {manager && <Tab label="Configurar" />}
          </Tabs>
          {tab === 0 && <Nps />}
          {tab === 1 && <Risk />}
          {tab === 2 && <Rematricula />}
          {tab === 3 && manager && <Config />}
        </div>
      </div>
    </MainContainer>
  );
};

export default Retention;
