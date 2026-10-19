import React, { useCallback, useEffect, useState } from "react";
import { useHistory, useParams } from "react-router-dom";
import { Button, CircularProgress, Tab, Tabs, Typography, makeStyles } from "@material-ui/core";
import { AlertTriangle, ArrowLeft, CheckCircle2, FileText, FileUp, Globe, HelpCircle, MessageSquare, Sparkles } from "lucide-react";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import KbTab from "./KbTab";
import LearningTab from "./LearningTab";
import TestTab from "./TestTab";

const useStyles = makeStyles((theme) => ({
  body: { flex: 1, overflowY: "auto", overflowX: "hidden", ...theme.scrollbarStyles, paddingBottom: theme.spacing(3) },
  grid: { display: "grid", gap: theme.spacing(1.5), gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", marginBottom: theme.spacing(2) },
  card: { borderRadius: 14, border: theme.border.divider, padding: theme.spacing(1.5), background: theme.palette.cards.background },
  big: { fontSize: 26, fontWeight: 700, lineHeight: 1.15, fontVariantNumeric: "tabular-nums" },
  small: { fontSize: 12.5, color: theme.palette.text.secondary },
  title: { fontSize: 15, fontWeight: 700, margin: theme.spacing(2.5, 0, 1) },
  row: { display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: theme.border.divider },
  ok: { color: "#15803d", display: "flex" },
  bad: { color: "#d97706", display: "flex" },
  quick: { display: "grid", gap: theme.spacing(1.25), gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", marginBottom: theme.spacing(1) },
  action: { display: "flex", gap: 12, alignItems: "flex-start", padding: theme.spacing(1.5), borderRadius: 14, border: theme.border.divider, background: theme.palette.cards.background, cursor: "pointer", textAlign: "left", fontFamily: "inherit", color: "inherit", "&:hover": { borderColor: theme.palette.primary.main } },
  next: { borderRadius: 14, border: "1px solid rgba(234,88,12,.45)", background: "rgba(234,88,12,.06)", padding: theme.spacing(1.5, 2), marginBottom: theme.spacing(2) },
}));

const TABS = ["Visão geral", "Perguntas sem resposta", "Enviar conteúdo", "Testar"];

// The place where the team makes the agent better: what it could not answer, which subjects have no text yet, and the fast ways to teach it
// (a text, a PDF, a web page). Everything here is the knowledge base of the agent, read by subject: nothing is sent to anybody.
const Improve = () => {
  const classes = useStyles();
  const history = useHistory();
  const { id } = useParams();
  const [d, setD] = useState(null);
  const [tab, setTab] = useState(0);
  const [kb, setKb] = useState({ mode: 0, topic: "", n: 0 });

  const load = useCallback(() => api.get(`/ai-agents/${id}/improve`).then(({ data }) => setD(data)).catch((e) => { toastError(e); history.replace("/ai-agents"); }), [id, history]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === 0) load(); }, [tab, load]);

  const teach = (mode, topic = "") => { setKb((k) => ({ mode, topic, n: k.n + 1 })); setTab(2); };

  if (!d) return <MainContainer><div style={{ padding: 24 }}><CircularProgress size={24} /></div></MainContainer>;
  const missing = d.topics.filter((t) => !t.ok);

  return (
    <MainContainer>
      <MainHeader>
        <Button size="small" startIcon={<ArrowLeft size={16} />} onClick={() => history.push("/ai-agents")}>Agentes</Button>
        <Title>Melhorar o agente · {d.agent.name}</Title>
      </MainHeader>
      <div className={classes.body}>
        <Tabs value={tab} onChange={(e, v) => setTab(v)} indicatorColor="primary" textColor="primary" variant="scrollable" scrollButtons="off" style={{ marginBottom: 16 }}>
          {TABS.map((t, i) => <Tab key={t} label={i === 1 && d.pending.waiting + d.pending.toReview > 0 ? `${t} (${d.pending.waiting + d.pending.toReview})` : t} />)}
        </Tabs>

        {tab === 0 && (
          <>
            {d.next.length > 0 ? (
              <div className={classes.next}>
                <b style={{ fontSize: 14 }}>O que fazer agora</b>
                {d.next.map((n) => <div key={n} style={{ fontSize: 13.5, marginTop: 4 }}>• {n}</div>)}
              </div>
            ) : (
              <div className={classes.next} style={{ borderColor: "rgba(21,128,61,.45)", background: "rgba(21,128,61,.06)" }}>
                <b style={{ fontSize: 14 }}>Tudo em dia.</b> <span style={{ fontSize: 13.5 }}>O agente tem texto para os assuntos principais e nenhuma pergunta esperando resposta.</span>
              </div>
            )}

            <div className={classes.quick}>
              <button type="button" className={classes.action} onClick={() => teach(2)}><FileUp size={22} /><span><b style={{ fontSize: 14 }}>Enviar um PDF</b><div className={classes.small}>Manual, regulamento, tabela de prazos, folder do curso.</div></span></button>
              <button type="button" className={classes.action} onClick={() => teach(0)}><FileText size={22} /><span><b style={{ fontSize: 14 }}>Escrever ou colar um texto</b><div className={classes.small}>Uma explicação aprovada, com as palavras da instituição.</div></span></button>
              <button type="button" className={classes.action} onClick={() => teach(3)}><Globe size={22} /><span><b style={{ fontSize: 14 }}>Usar uma página da web</b><div className={classes.small}>O texto da página vira conhecimento do agente.</div></span></button>
              <button type="button" className={classes.action} onClick={() => teach(1)}><MessageSquare size={22} /><span><b style={{ fontSize: 14 }}>Resposta pronta (FAQ)</b><div className={classes.small}>Pergunta frequente respondida na hora, sem gastar IA.</div></span></button>
            </div>

            <div className={classes.grid}>
              <div className={classes.card}><div className={classes.big}>{d.documents.total}</div><div className={classes.small}>textos na base ({d.documents.files} PDFs/arquivos, {d.documents.faq} respostas prontas)</div></div>
              <div className={classes.card}><div className={classes.big} style={d.pending.waiting ? { color: "#d97706" } : undefined}>{d.pending.waiting}</div><div className={classes.small}>perguntas esperando resposta da equipe</div></div>
              <div className={classes.card}><div className={classes.big}>{d.pending.toReview}</div><div className={classes.small}>respostas da equipe para revisar</div></div>
              <div className={classes.card}><div className={classes.big}>{d.last30days.unknown}</div><div className={classes.small}>perguntas sem resposta em 30 dias</div></div>
            </div>

            {d.questions.length > 0 && (
              <>
                <div className={classes.title}>Perguntas que o agente não soube responder</div>
                {d.questions.map((q) => (
                  <div key={q.question} className={classes.row}>
                    <HelpCircle size={18} style={{ flexShrink: 0, opacity: 0.7 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, overflowWrap: "anywhere" }}>{q.question}</div>
                      <div className={classes.small}>{q.count > 1 ? `perguntada ${q.count} vezes · ` : ""}{q.status === "para_revisar" ? "a equipe já respondeu: falta aprovar" : "aguardando resposta"}</div>
                    </div>
                    <Button size="small" variant="outlined" onClick={() => setTab(1)}>{q.status === "para_revisar" ? "Revisar" : "Responder"}</Button>
                  </div>
                ))}
              </>
            )}

            <div className={classes.title}>Assuntos que o agente conhece</div>
            <Typography variant="body2" color="textSecondary" gutterBottom>Sem texto sobre um assunto, o agente não inventa: diz que vai confirmar e chama a equipe.</Typography>
            {d.topics.map((t) => (
              <div key={t.topic} className={classes.row}>
                <span className={t.ok ? classes.ok : classes.bad}>{t.ok ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{t.label}{t.ok ? <span className={classes.small}> · {t.documents} texto(s)</span> : null}</div>
                  <div className={classes.small}>{t.hint}</div>
                </div>
                <Button size="small" variant={t.ok ? "text" : "outlined"} color="primary" startIcon={<Sparkles size={14} />} onClick={() => teach(0, t.topic)}>{t.ok ? "Acrescentar" : "Ensinar"}</Button>
              </div>
            ))}
            {missing.length === 0 && d.topics.length > 0 && <div className={classes.small} style={{ marginTop: 8 }}>Todos os assuntos principais têm texto.</div>}
            {d.regulations && (
              <div className={classes.row}>
                <span className={d.regulations.withRule >= d.regulations.courses ? classes.ok : classes.bad}>{d.regulations.withRule >= d.regulations.courses ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Regras do MEC por curso</div>
                  <div className={classes.small}>{d.regulations.withRule} de {d.regulations.courses} cursos têm regra cadastrada (em Agentes de IA → Regras do MEC).</div>
                </div>
              </div>
            )}
          </>
        )}

        {tab === 1 && <LearningTab agentId={Number(id)} onCount={() => undefined} />}
        {tab === 2 && <KbTab key={kb.n} agentId={Number(id)} initialMode={kb.mode} initialTopic={kb.topic} />}
        {tab === 3 && <TestTab agentId={Number(id)} />}
      </div>
    </MainContainer>
  );
};

export default Improve;
