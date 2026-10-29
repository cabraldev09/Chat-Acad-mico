import React, { useState } from "react";
import { Chip, makeStyles } from "@material-ui/core";
import { AlertTriangle, CheckCircle2, ChevronDown, Flag, MessageSquare, Route, Sparkles, UserCheck, Wrench } from "lucide-react";

// What the agent decided at each message of the test: everything on this panel comes from the runtime of the simulator
// (the same engine that answers the leads), nothing here is written by hand. A thing that was not decided yet shows "ainda não".

const INTEREST = {
  graduacao: "Graduação", pos_graduacao: "Pós-graduação", tecnico: "Curso técnico", segunda_graduacao: "Segunda graduação", transferencia: "Transferência",
  matricula: "Informações sobre matrícula", aluno: "Aluno existente", administrativo: "Assunto administrativo", outros: "Outros",
};
const TEMP = { cold: ["Frio", "#64748b"], warm: ["Morno", "#d97706"], hot: ["Quente", "#dc2626"] };
const INTENT = {
  greeting: "Saudação", course_duration: "Duração do curso", course_modality: "Modalidade", mec: "Regras do MEC", curriculum: "Grade curricular", internship: "Estágio",
  paid_internship: "Estágio remunerado", tcc: "TCC", platform: "Plataforma", tutoring: "Tutoria", faculty: "Corpo docente", recognition: "Reconhecimento do curso",
  transfer: "Transferência", second_degree: "Segunda graduação", analysis: "Análise curricular", price: "Valores", enrollment: "Matrícula", proposal: "Proposta",
  human: "Pediu uma pessoa", follow_up: "Pediu um tempo", no_interest: "Sem interesse", objection: "Objeção", unknown: "Sem resposta confirmada",
  support_tutoring: "Aluno: tutoria", support_secretary: "Aluno: secretaria", other: "Outro assunto",
};
const NEXT = {
  identify_entry_type: "Descobrir o tipo de ingresso", identify_city: "Descobrir a cidade", present_course: "Apresentar o curso", explain_modality: "Explicar a modalidade",
  send_curriculum: "Enviar a grade", wait_transcript: "Aguardar o histórico", request_analysis: "Pedir a análise curricular", wait_analysis: "Aguardar a análise",
  explain_analysis: "Explicar a análise", answer_objection: "Responder a dúvida", generate_proposal: "Gerar a proposta", follow_up: "Retomar o contato", human_service: "Atendimento humano",
  close_lost: "Encerrar",
};
const SLOT_LABEL = {
  leadName: "Nome", city: "Cidade", courseName: "Curso", entryType: "Ingresso", courseModality: "Modalidade", courseDurationText: "Duração", poloName: "Polo", mainQuestion: "Dúvida principal",
  mainObjection: "Objeção", decisionTimeline: "Quando decide", shift: "Turno", motivation: "Motivação", financing: "Como pretende pagar", bestTime: "Melhor horário", fullName: "Nome completo",
  unofferedCourse: "Curso pedido que não oferecemos", previousCourse: "Formação anterior", email: "E-mail",
};
const ENTRY = { first_degree: "Primeira graduação", transfer: "Transferência", second_degree: "Segunda graduação" };
const SHOWN_SLOTS = ["leadName", "courseName", "city", "poloName", "entryType", "courseModality", "courseDurationText", "mainQuestion", "mainObjection", "decisionTimeline", "shift", "motivation", "financing", "bestTime", "unofferedCourse", "previousCourse"];

const useStyles = makeStyles((theme) => {
  const dark = theme.palette.type === "dark";
  const line = dark ? "rgba(255,255,255,.1)" : "#cfd9e8";
  return {
    root: { display: "grid", gap: theme.spacing(1.5), alignContent: "start", minWidth: 0 },
    card: { border: `1px solid ${line}`, borderRadius: 12, padding: theme.spacing(1.5, 1.75), background: theme.palette.cards.background, minWidth: 0 },
    h: { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: theme.palette.text.secondary, margin: 0, marginBottom: 8 },
    kv: { display: "grid", gridTemplateColumns: "118px 1fr", gap: "4px 10px", fontSize: 13.5, "& dt": { color: theme.palette.text.secondary, margin: 0 }, "& dd": { margin: 0, minWidth: 0, wordBreak: "break-word" } },
    why: { fontSize: 12.5, color: theme.palette.text.secondary, display: "block" },
    rail: { position: "relative", paddingLeft: 22, "&::before": { content: '""', position: "absolute", left: 7, top: 6, bottom: 6, width: 2, background: line, borderRadius: 2 } },
    item: { position: "relative", paddingBottom: theme.spacing(1.5), "&:last-child": { paddingBottom: 0 } },
    dot: { position: "absolute", left: -22, top: 1, width: 16, height: 16, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: theme.palette.background.paper, border: `2px solid ${line}`, color: theme.palette.text.secondary },
    head: { display: "flex", alignItems: "center", gap: 8, width: "100%", border: 0, background: "transparent", color: "inherit", font: "inherit", cursor: "pointer", padding: 0, textAlign: "left" },
    step: { fontSize: 13, display: "flex", gap: 8, alignItems: "flex-start", marginTop: 6, "& svg": { flex: "none", marginTop: 2, opacity: 0.75 } },
    chips: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 },
    empty: { fontSize: 13, color: theme.palette.text.secondary },
  };
});

const Row = ({ label, children, why }) => (
  <>
    <dt>{label}</dt>
    <dd>{children}{why ? <small style={{ display: "block", opacity: 0.72, fontSize: 12 }}>{why}</small> : null}</dd>
  </>
);

const slotsOf = (state) => (state && state.vars && state.vars.__commercial && state.vars.__commercial.state && state.vars.__commercial.state.slots) || {};

// the state of the conversation now (after the last message)
const Summary = ({ last, state, routeNow }) => {
  const classes = useStyles();
  const slots = slotsOf(state);
  const t = last && last.commercial;
  const temp = TEMP[(t && t.temperature) || slots.leadTemperature] || null;
  const known = SHOWN_SLOTS.filter((k) => slots[k]).map((k) => [SLOT_LABEL[k] || k, k === "entryType" ? ENTRY[slots[k]] || slots[k] : String(slots[k])]).filter(([, v]) => v && v !== "unknown");
  const route = routeNow;
  return (
    <>
      <div className={classes.card}>
        <p className={classes.h}>Onde a conversa está</p>
        <dl className={classes.kv}>
          <Row label="Etapa no CRM">{(t && t.stageName) || "Ainda não registrada"}</Row>
          <Row label="Interesse">{INTEREST[slots.interestKind] || "Ainda não identificado"}</Row>
          <Row label="Intenção">{(t && INTENT[t.intent]) || "—"}</Row>
          <Row label="Temperatura">{temp ? <Chip size="small" label={temp[0]} style={{ background: `${temp[1]}22`, color: temp[1], fontWeight: 700 }} /> : "—"}{t ? <span style={{ opacity: 0.7, marginLeft: 8, fontSize: 12.5 }}>nota {t.score}</span> : null}</Row>
          <Row label="Próxima ação">{(t && NEXT[t.nextAction]) || "—"}</Row>
        </dl>
      </div>
      <div className={classes.card}>
        <p className={classes.h}>Dados coletados</p>
        {known.length ? <dl className={classes.kv}>{known.map(([k, v]) => <Row key={k} label={k}>{v}</Row>)}</dl> : <div className={classes.empty}>Nada guardado ainda.</div>}
        {t && t.missing && t.missing.length > 0 && (
          <>
            <p className={classes.h} style={{ marginTop: 12 }}>Falta para qualificar</p>
            <div className={classes.chips}>{t.missing.map((m) => <Chip key={m} size="small" variant="outlined" label={m} />)}</div>
          </>
        )}
        {t && t.missing && t.missing.length === 0 && <div className={classes.why} style={{ marginTop: 10 }}>Tem tudo o que a configuração exige para qualificar.</div>}
      </div>
      <div className={classes.card}>
        <p className={classes.h}>Transferência</p>
        {last && last.exitWhy ? (
          <div style={{ fontSize: 13.5 }}><b>Passaria para a equipe.</b> {last.exitWhy}</div>
        ) : (
          <div className={classes.empty}>Ainda não: o agente segue conversando. {t && t.missing && t.missing.length ? `Faltam: ${t.missing.join(", ").toLowerCase()}.` : "Ele encaminha quando a pessoa pedir, quiser se matricular ou terminar a qualificação."}</div>
        )}
        {route ? (
          <dl className={classes.kv} style={{ marginTop: 10 }}>
            <Row label="Departamento">{route.team}</Row>
            <Row label="Polo" why={route.poloReason}>{route.polo || "Não definido"}</Row>
            <Row label="Fila" why={route.queueReason}>{route.queue || "Nenhuma"}</Row>
            <Row label="Consultor" why={route.consultantReason}>{route.consultant || "Ninguém escolhido"}</Row>
            <Row label="Horário">{route.within ? "Dentro do expediente" : `Fora do expediente${route.whenText ? `: a equipe retorna ${route.whenText}` : ""}`}</Row>
            {route.priority ? <Row label="Prioridade">{route.priority} (lead quente aguardando)</Row> : null}
            {route.notice ? <Row label="Aviso ao lead">{route.notice}</Row> : null}
          </dl>
        ) : null}
      </div>
    </>
  );
};

// one message of the test and everything the system did with it
const Turn = ({ step, n, open, onToggle }) => {
  const classes = useStyles();
  const t = step.commercial;
  const changed = t ? Object.entries(t.changed || {}).filter(([k]) => !["commercialScore", "readyForProposal"].includes(k)) : [];
  const error = step.error;
  return (
    <div className={classes.item}>
      <span className={classes.dot} style={error ? { borderColor: "#dc2626", color: "#dc2626" } : step.exitWhy ? { borderColor: "#16a34a", color: "#16a34a" } : undefined}>
        {error ? <AlertTriangle size={9} /> : step.exitWhy ? <Flag size={9} /> : <span style={{ fontSize: 9, fontWeight: 700 }}>{n}</span>}
      </span>
      <button type="button" className={classes.head} onClick={onToggle} aria-expanded={open}>
        <span style={{ fontWeight: 600, fontSize: 13.5, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>“{step.input}”</span>
        <ChevronDown size={15} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s", opacity: 0.6, flex: "none" }} />
      </button>
      {open && (
        <div>
          {error && <div className={classes.step} style={{ color: "#dc2626" }}><AlertTriangle size={15} /><span><b>Erro:</b> {error}</span></div>}
          {(t && t.reasons ? t.reasons : []).map((r, i) => (
            <div key={i} className={classes.step}><Sparkles size={15} /><span>{r}</span></div>
          ))}
          {step.tools && step.tools.length > 0 && (
            <div className={classes.step}><Wrench size={15} /><span><b>Ferramentas:</b> {step.tools.join(", ")}</span></div>
          )}
          {changed.map(([k, [from, to]]) => (
            <div key={k} className={classes.step}><CheckCircle2 size={15} /><span><b>{SLOT_LABEL[k] || k}:</b> {from === null || from === undefined || from === "" ? "—" : String(from)} → {to === null || to === undefined || to === "" ? "—" : String(to)}</span></div>
          ))}
          {(step.actions || []).map((a, i) => (
            <div key={`a${i}`} className={classes.step}><Route size={15} /><span>{a}</span></div>
          ))}
          <div className={classes.step}>
            <MessageSquare size={15} />
            <span>{step.replies ? `${step.replies} mensagem(ns) ao aluno` : "Nenhuma mensagem ao aluno"} · {step.tokens ? `${step.tokens} tokens` : "sem chamar o modelo de IA"}{step.status === "handoff" ? " · a conversa passaria para a equipe" : ""}</span>
          </div>
          {step.exitWhy && <div className={classes.step} style={{ fontWeight: 600 }}><UserCheck size={15} /><span>{step.exitWhy}</span></div>}
        </div>
      )}
    </div>
  );
};

const RunInspector = ({ steps, state }) => {
  const classes = useStyles();
  const [openIdx, setOpenIdx] = useState(null);
  if (!steps.length) {
    return (
      <div className={classes.root}>
        <div className={classes.card}>
          <p className={classes.h}>O que o agente está decidindo</p>
          <div className={classes.empty}>Escreva uma mensagem do aluno. Aqui aparecem a etapa, a intenção, os dados coletados, o que falta, a temperatura, a condição de transferência, quem receberia a conversa e o motivo de cada decisão.</div>
        </div>
      </div>
    );
  }
  const last = steps[steps.length - 1];
  const current = openIdx === null ? steps.length - 1 : openIdx;
  return (
    <div className={classes.root}>
      <Summary last={last} state={state} routeNow={[...steps].reverse().map((x) => x.route).find(Boolean) || null} />
      <div className={classes.card}>
        <p className={classes.h}>Linha do tempo</p>
        <div className={classes.rail}>
          {steps.map((s, i) => <Turn key={i} step={s} n={i + 1} open={current === i} onToggle={() => setOpenIdx(current === i ? -1 : i)} />)}
        </div>
      </div>
    </div>
  );
};

export default RunInspector;
