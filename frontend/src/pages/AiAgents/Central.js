import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useHistory, useLocation, useParams } from "react-router-dom";
import { Button, Menu, MenuItem, Switch, makeStyles } from "@material-ui/core";
import {
  AlertTriangle, ArrowLeft, BarChart3, CheckCircle2, ChevronDown, ChevronRight, FileText, FileUp, Filter, Globe, HelpCircle, Key, MapPin, MessageSquare,
  Plus, Scale, ListChecks, Bot, UserCheck, Workflow, History,
} from "lucide-react";

import MainContainer from "../../components/MainContainer";
import { PageHeader, Section, Segmented, SkeletonCards, StatCard } from "../../components/ui";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import AgentEditor from "./AgentEditor";
import CommercialTab from "./CommercialTab";
import FunnelDialog from "./FunnelDialog";
import HandoffDialog from "./HandoffDialog";
import KbTab from "./KbTab";
import KeysDialog from "./KeysDialog";
import HistoryDialog from "./HistoryDialog";
import CommercialSettings from "./CommercialSettings";
import QualityPanel from "./QualityPanel";
import LearningTab from "./LearningTab";
import RegulationsDialog from "./RegulationsDialog";
import TestTab from "./TestTab";
import TrainTab from "./TrainTab";
import UsageTab from "./UsageTab";

const SECTIONS = ["inicio", "treinar", "conhecimento", "testar", "resultados", "ajustes"];
// the old addresses keep working
const ALIAS = { ensinar: "conhecimento" };

const useStyles = makeStyles((theme) => ({
  page: { flex: 1, overflowY: "auto", overflowX: "hidden", ...theme.scrollbarStyles, padding: theme.spacing(0.5, 0.5, 4) },
  back: { display: "inline-flex", alignItems: "center", gap: 6, border: 0, background: "none", cursor: "pointer", color: theme.palette.text.secondary, fontFamily: "inherit", fontSize: 13.5, padding: "4px 2px", marginBottom: theme.spacing(1), "&:hover": { color: theme.palette.primary.main } },
  pill: { display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999, padding: "5px 12px", fontSize: 12.5, fontWeight: 600, background: "var(--ui-surface)", border: "1px solid var(--ui-border)" },
  cols: { display: "grid", gap: theme.spacing(2), gridTemplateColumns: "minmax(0, 1.25fr) minmax(0, 1fr)", alignItems: "start", [theme.breakpoints.down("sm")]: { gridTemplateColumns: "1fr" } },
  stats: { display: "grid", gap: theme.spacing(1.5), gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", marginBottom: theme.spacing(2) },
  hint: { fontSize: 13, color: theme.palette.text.secondary },
  todo: { display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", border: "1px solid var(--ui-border)", borderRadius: 14, padding: theme.spacing(1.25, 1.5), marginBottom: theme.spacing(1), background: "transparent", cursor: "pointer", fontFamily: "inherit", color: "inherit", transition: "border-color .18s, background .18s, transform .18s, box-shadow .18s", "&:hover": { borderColor: theme.palette.primary.main, background: theme.palette.action.hover, transform: "translateY(-1px)", boxShadow: "var(--ui-shadow-2)" }, "&:focus-visible": { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 } },
  todoIcon: { width: 34, height: 34, borderRadius: 11, display: "grid", placeItems: "center", flex: "none", background: "rgba(217,119,6,.14)", color: "#d97706" },
  allGood: { display: "flex", alignItems: "center", gap: 12, padding: theme.spacing(1.75), borderRadius: 14, background: "rgba(22,163,74,.1)", color: "#15803d", fontWeight: 600 },
  check: { display: "flex", alignItems: "center", gap: 10, padding: theme.spacing(1, 0), borderBottom: "1px solid var(--ui-border)", "&:last-child": { borderBottom: 0 } },
  ok: { color: "#16a34a", flex: "none" },
  warn: { color: "#d97706", flex: "none" },
  link: { border: 0, background: "none", color: theme.palette.primary.main, fontFamily: "inherit", fontWeight: 600, fontSize: 12.5, cursor: "pointer", padding: 0 },
  question: { display: "flex", alignItems: "center", gap: 10, padding: theme.spacing(1, 0), borderBottom: "1px solid var(--ui-border)", "&:last-child": { borderBottom: 0 } },
  topics: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: theme.spacing(2) },
  topic: { display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999, padding: "5px 12px", fontSize: 12.5, fontWeight: 600, border: "1px solid var(--ui-border)", background: "var(--ui-surface)", cursor: "pointer", fontFamily: "inherit", color: theme.palette.text.primary, transition: "border-color .18s", "&:hover": { borderColor: theme.palette.primary.main } },
  arow: { display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", border: "1px solid var(--ui-border)", borderRadius: 14, padding: theme.spacing(1.25, 1.5), marginBottom: 8, background: "var(--ui-surface)", fontFamily: "inherit", color: "inherit", cursor: "pointer" },
  introBox: { padding: theme.spacing(1.5, 2), borderRadius: 14, background: "rgba(6,147,227,.08)", border: "1px solid rgba(6,147,227,.25)", fontSize: 14.5, fontWeight: 600 },
  settings: { display: "grid", gap: theme.spacing(1.5), gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" },
  setting: { display: "flex", flexDirection: "column", gap: 6, textAlign: "left", padding: theme.spacing(2), fontFamily: "inherit", color: "inherit", cursor: "pointer" },
  settingIcon: { width: 38, height: 38, borderRadius: 11, display: "grid", placeItems: "center", marginBottom: 2, background: "rgba(6,147,227,.12)", color: theme.palette.primary.main },
  settingName: { fontSize: 15.5, fontWeight: 700 },
  more: { display: "flex", alignItems: "center", gap: 8, width: "100%", border: "1px solid var(--ui-border)", borderRadius: 14, padding: theme.spacing(1.25, 1.75), background: "var(--ui-surface)", fontFamily: "inherit", fontSize: 14, fontWeight: 600, color: "inherit", cursor: "pointer", marginTop: theme.spacing(2) },
}));

// THE CENTRAL OF THE AGENT. One place, five short sections: what to do now (Início), what it knows and cannot answer (Ensinar), a test conversation
// (Testar), the numbers (Resultados) and the settings (Ajustes). Everything the old "Melhorar" board and the eight tabs of the editor used to do.
const Central = () => {
  const classes = useStyles();
  const history = useHistory();
  const location = useLocation();
  const { id } = useParams();
  const agentId = Number(id);
  const [d, setD] = useState(null);
  const [agent, setAgent] = useState(null);
  const [kb, setKb] = useState({ mode: 0, topic: "", n: 0 });
  const [teach, setTeach] = useState("perguntas");
  const [addMenu, setAddMenu] = useState(null);
  const [costs, setCosts] = useState(false);
  const [adv, setAdv] = useState(false);
  const [dialog, setDialog] = useState({ name: null, tab: 0 });

  const section = useMemo(() => {
    const raw = new URLSearchParams(location.search).get("secao");
    const s = ALIAS[raw] || raw;
    return SECTIONS.includes(s) ? s : "inicio";
  }, [location.search]);
  const go = useCallback((key, extra = {}) => {
    history.replace(`/ai-agents/${agentId}/central?secao=${ALIAS[key] || key}`);
    if (extra.teach) setTeach(extra.teach);
  }, [history, agentId]);

  const load = useCallback(() => {
    api.get(`/ai-agents/${agentId}/central`).then(({ data }) => setD(data)).catch((e) => { toastError(e); history.replace("/ai-agents"); });
    api.get("/ai-agents").then(({ data }) => setAgent((data || []).find((a) => a.id === agentId) || null)).catch(() => undefined);
  }, [agentId, history]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (section === "inicio") load(); }, [section, load]);

  const toggle = async () => {
    try { await api.put(`/ai-agents/${agentId}`, { active: !d.agent.active }); load(); } catch (e) { toastError(e); }
  };
  const teachAbout = (mode, topic = "") => { setKb((k) => ({ mode, topic, n: k.n + 1 })); go("conhecimento", { teach: "conteudo" }); setAddMenu(null); };
  const closeDialog = () => { setDialog({ name: null, tab: 0 }); load(); };

  // each check of the health says where it is fixed
  const fix = (how) => {
    if (how === "ligar") return toggle();
    if (how === "roteiro") return d.flow ? history.push(`/ai-agents/blocos/${d.flow.id}`) : go("ajustes");
    if (how === "polos") return history.push("/polos");
    if (how === "conexoes") return history.push("/connections");
    if (how === "grades") return history.push("/grades");
    const [, item] = how.split(":");
    return setDialog({ name: item || "ajustes", tab: 0 });
  };

  if (!d) return <MainContainer><div className={classes.page}><div className="ui-skeleton" style={{ height: 84, borderRadius: 16, marginBottom: 16 }} /><SkeletonCards n={4} height={96} /></div></MainContainer>;

  const commercial = d.agent.kind === "commercial";
  const failing = d.health.filter((h) => !h.ok);
  const todo = [
    ...failing.map((h) => ({ key: `h-${h.key}`, title: h.label, text: h.detail, run: () => fix(h.fix) })),
    ...(d.pending.waiting ? [{ key: "waiting", title: `${d.pending.waiting} pergunta${d.pending.waiting === 1 ? "" : "s"} sem resposta`, text: "O agente não soube responder. A sua resposta vira conhecimento dele.", run: () => go("conhecimento", { teach: "perguntas" }) }] : []),
    ...(d.pending.toReview ? [{ key: "review", title: `${d.pending.toReview} resposta${d.pending.toReview === 1 ? "" : "s"} da equipe para aprovar`, text: "A equipe já respondeu. Aprove para o agente aprender.", run: () => go("conhecimento", { teach: "perguntas" }) }] : []),
    ...d.topics.filter((t) => !t.ok).slice(0, 3).map((t) => ({ key: `t-${t.topic}`, title: `Ensinar sobre ${t.label}`, text: "Hoje o agente diz que vai confirmar. Envie um texto ou PDF.", run: () => teachAbout(0, t.topic) })),
  ];
  const waiting = d.questions.filter((q) => q.status !== "para_revisar").slice(0, 4);

  const settings = [
    { key: "jeito", icon: MessageSquare, name: "Jeito de atender", text: "Tom de voz, regras, o que dizer quando não souber, limites de gasto e quando o agente atende.", run: () => setDialog({ name: "editor", tab: 0 }) },
    { key: "descobrir", icon: ListChecks, name: "O que descobrir do cliente", text: "Os dados que o agente pergunta para qualificar quem chega.", run: () => setDialog({ name: "editor", tab: 1 }) },
    { key: "acoes", icon: Workflow, name: "Ações automáticas", text: "Fluxos que o agente pode iniciar sozinho durante a conversa.", run: () => setDialog({ name: "editor", tab: 2 }) },
    ...(d.flow ? [{ key: "roteiro", icon: Workflow, name: "Roteiro da conversa", text: `O desenho em blocos (${d.flow.status === "published" ? `publicado, versão ${d.flow.version}` : "em edição"}).`, run: () => history.push(`/ai-agents/blocos/${d.flow.id}`) }] : []),
    { key: "assume", icon: UserCheck, name: "Quem assume a conversa", text: "Consultor de cada polo, fila central, prazos de resposta e áudios.", run: () => setDialog({ name: "assume" }) },
    ...(commercial ? [
      { key: "polos", icon: MapPin, name: "Cidades de cada polo", text: "Em quais cidades cada polo atende. O agente usa isso para achar o polo do lead.", run: () => history.push("/polos") },
      { key: "funil", icon: Filter, name: "Etapas do CRM", text: "Qual coluna do CRM cada etapa do agente usa.", run: () => setDialog({ name: "funil" }) },
      { key: "mec", icon: Scale, name: "Regras do MEC", text: "Como cada curso é oferecido, pela Portaria 378/2025, com ajuste por área ou curso.", run: () => setDialog({ name: "mec" }) },
    ] : []),
    { key: "historico", icon: History, name: "Histórico de alterações", text: "O que mudou no agente, quem mudou e quando. Dá para voltar a uma versão anterior.", run: () => setDialog({ name: "history" }) },
    { key: "chave", icon: Key, name: "Chave de IA", text: "A chave usada pelo agente para responder (Claude ou GPT).", run: () => setDialog({ name: "chave" }) },
  ];

  const tabLabels = { inicio: "Início", treinar: "Treinar", conhecimento: "Conhecimento", testar: "Testar", resultados: "Resultados", ajustes: "Ajustes" };
  const tabs = SECTIONS.map((k) => [k, tabLabels[k], k === "conhecimento" ? d.pending.waiting + d.pending.toReview : 0]);
  const readyPct = d.health.length ? Math.round(((d.health.length - failing.length) / d.health.length) * 100) : 100;

  return (
    <MainContainer>
      <AgentEditor open={dialog.name === "editor"} agent={agent} initialTab={dialog.tab} onClose={closeDialog} onSaved={load} />
      <HandoffDialog open={dialog.name === "assume"} onClose={closeDialog} />
      <FunnelDialog open={dialog.name === "funil"} onClose={closeDialog} />
      <RegulationsDialog open={dialog.name === "mec"} onClose={closeDialog} />
      <KeysDialog open={dialog.name === "chave"} onClose={closeDialog} onSaved={load} />
      <CommercialSettings open={dialog.name === "atendimento"} agent={agent} onClose={closeDialog} onSaved={load} onOpenAssign={() => setDialog({ name: "assume" })} />
      <HistoryDialog open={dialog.name === "history"} agentId={agent && agent.id} onClose={closeDialog} onRestored={load} />

      <div className={classes.page}>
        <button type="button" className={classes.back} onClick={() => history.push("/ai-agents")}><ArrowLeft size={16} />Agentes de IA</button>

        <PageHeader
          title={<span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}><span style={{ width: 44, height: 44, borderRadius: 14, display: "grid", placeItems: "center", background: "rgba(6,147,227,.14)", color: "#0693e3" }}><Bot size={24} /></span>{d.agent.name}</span>}
          subtitle={`${commercial ? "Agente comercial" : "Agente de atendimento"} · ${d.agent.provider === "openai" ? "GPT" : "Claude"}`}
          actions={(
            <>
              <span className={classes.pill}>
                {failing.length === 0 && d.agent.active ? <CheckCircle2 size={15} className={classes.ok} /> : <AlertTriangle size={15} className={classes.warn} />}
                {failing.length === 0 ? "Tudo certo" : `${failing.length} ponto${failing.length === 1 ? "" : "s"} de atenção`}
              </span>
              <label className={classes.pill} style={{ cursor: "pointer", paddingRight: 8 }}>
                {d.agent.active ? "Ligado" : "Desligado"}
                <Switch size="small" checked={!!d.agent.active} onChange={toggle} color="primary" inputProps={{ "aria-label": "Ligar ou desligar o agente" }} />
              </label>
              {d.flow && <Button variant="outlined" startIcon={<Workflow size={16} />} onClick={() => history.push(`/ai-agents/blocos/${d.flow.id}`)} style={{ borderRadius: 12, textTransform: "none", fontWeight: 600 }}>Roteiro</Button>}
            </>
          )}
        />

        <div style={{ marginBottom: 20, overflowX: "auto" }}><Segmented items={tabs} value={section} onChange={(k) => go(k)} label="Seções do agente" /></div>

        {section === "inicio" && (
          <>
            <div className={`${classes.stats} ui-stagger`}>
              <StatCard label="conversas nos últimos 7 dias" value={d.week.conversations} />
              <StatCard label="chegaram a qualificados" value={d.week.qualifiedRate === null ? "—" : `${d.week.qualifiedRate}%`} />
              <StatCard label="passaram para a equipe" value={d.week.handedOver} />
              <StatCard label="perguntas sem resposta" value={d.week.unanswered} tone={d.week.unanswered ? "#d97706" : undefined} onClick={d.week.unanswered ? () => go("conhecimento", { teach: "perguntas" }) : undefined} />
              <StatCard label="pronto para atender" value={`${readyPct}%`} hint={failing.length ? `${failing.length} a resolver` : "tudo em dia"} tone={readyPct === 100 ? "#16a34a" : undefined} />
            </div>
            <div className={classes.cols}>
              <div style={{ display: "grid", gap: 16 }}>
                <Section title="O que fazer agora" hint="O mais importante primeiro.">
                  {todo.length === 0 ? (
                    <div className={classes.allGood}><CheckCircle2 size={20} />Tudo em dia. O agente tem o que precisa para atender.</div>
                  ) : todo.map((t) => (
                    <button key={t.key} type="button" className={classes.todo} onClick={t.run}>
                      <span className={classes.todoIcon}><AlertTriangle size={17} /></span>
                      <span style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 14 }}>{t.title}</b><div className={classes.hint}>{t.text}</div></span>
                      <ChevronRight size={18} style={{ opacity: 0.5, flex: "none" }} />
                    </button>
                  ))}
                </Section>
                <Section title="Treine o agente" hint="O jeito mais rápido de deixar ele igual ao seu melhor atendente.">
                  <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                    <button type="button" className="ui-card ui-lift ui-press" onClick={() => go("treinar")} style={{ padding: 14, textAlign: "left", font: "inherit", color: "inherit", display: "grid", gap: 4 }}>
                      <MessageSquare size={20} style={{ color: "#0693e3" }} /><b>Conversar e ensinar</b><span className={classes.hint}>Dê ordens e veja ele responder.</span>
                    </button>
                    <button type="button" className="ui-card ui-lift ui-press" onClick={() => go("treinar")} style={{ padding: 14, textAlign: "left", font: "inherit", color: "inherit", display: "grid", gap: 4 }}>
                      <FileUp size={20} style={{ color: "#7c3aed" }} /><b>Enviar PDF ou conversa</b><span className={classes.hint}>Aprende o estilo e o passo a passo.</span>
                    </button>
                  </div>
                </Section>
                {waiting.length > 0 && (
                  <Section title="Perguntas que o agente não soube responder">
                    {waiting.map((q) => (
                      <div key={q.question} className={classes.question}>
                        <HelpCircle size={18} style={{ opacity: 0.6, flex: "none" }} />
                        <div style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere", fontSize: 14 }}>{q.question}{q.count > 1 && <div className={classes.hint}>perguntada {q.count} vezes</div>}</div>
                        <Button size="small" variant="outlined" onClick={() => go("conhecimento", { teach: "perguntas" })} style={{ borderRadius: 10 }}>Responder</Button>
                      </div>
                    ))}
                  </Section>
                )}
              </div>
              <Section title="Saúde do agente" hint="Tudo o que precisa estar certo para ele atender sozinho.">
                {d.health.map((h) => (
                  <div key={h.key} className={classes.check}>
                    {h.ok ? <CheckCircle2 size={18} className={classes.ok} /> : <AlertTriangle size={18} className={classes.warn} />}
                    <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600 }}>{h.label}</div>
                    {h.ok ? <span className={classes.hint}>Ok</span> : <button type="button" className={classes.link} onClick={() => fix(h.fix)}>Resolver</button>}
                  </div>
                ))}
              </Section>
            </div>
          </>
        )}

        {section === "treinar" && <TrainTab agentId={agentId} flowId={d.flow ? d.flow.id : null} commercial={commercial} goRoteiro={(flowId) => history.push(`/ai-agents/blocos/${flowId}`)} />}

        {section === "conhecimento" && (
          <>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
              <Segmented items={[["perguntas", "Perguntas sem resposta", d.pending.waiting + d.pending.toReview], ["conteudo", "O que o agente sabe"]]} value={teach} onChange={setTeach} label="Conhecimento" />
              <span style={{ flex: 1 }} />
              <Button variant="contained" color="primary" disableElevation startIcon={<Plus size={16} />} endIcon={<ChevronDown size={16} />} onClick={(e) => setAddMenu(e.currentTarget)} style={{ borderRadius: 12 }}>Adicionar conhecimento</Button>
              <Menu anchorEl={addMenu} open={!!addMenu} onClose={() => setAddMenu(null)} getContentAnchorEl={null} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
                <MenuItem onClick={() => teachAbout(2)}><FileUp size={16} style={{ marginRight: 10 }} />Enviar um PDF</MenuItem>
                <MenuItem onClick={() => teachAbout(0)}><FileText size={16} style={{ marginRight: 10 }} />Escrever ou colar um texto</MenuItem>
                <MenuItem onClick={() => teachAbout(3)}><Globe size={16} style={{ marginRight: 10 }} />Usar uma página da web</MenuItem>
                <MenuItem onClick={() => teachAbout(1)}><MessageSquare size={16} style={{ marginRight: 10 }} />Resposta pronta (pergunta frequente)</MenuItem>
              </Menu>
            </div>
            {teach === "perguntas" && <LearningTab agentId={agentId} onCount={() => undefined} initialFilter={d.pending.waiting && !d.pending.toReview ? "aguardando_equipe" : "para_revisar"} />}
            {teach === "conteudo" && (
              <>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Assuntos que o agente conhece</div>
                <div className={classes.topics}>
                  {d.topics.map((t) => (
                    <button key={t.topic} type="button" className={classes.topic} onClick={() => teachAbout(0, t.topic)} title={t.hint}>
                      {t.ok ? <CheckCircle2 size={14} className={classes.ok} /> : <AlertTriangle size={14} className={classes.warn} />}{t.label}
                    </button>
                  ))}
                </div>
                <KbTab key={kb.n} agentId={agentId} initialMode={kb.mode} initialTopic={kb.topic} />
              </>
            )}
          </>
        )}

        {section === "testar" && (
          <Section title="Testar o agente" hint="Converse como se fosse um lead. Nada é enviado a ninguém e nenhum lead é criado. Gostou da conversa? Salve como treino.">
            <TestTab agentId={agentId} flowId={d.flow ? d.flow.id : null} commercial={commercial} />
          </Section>
        )}

        {section === "resultados" && (
          <>
            {commercial && <QualityPanel agentId={agentId} />}
            {commercial ? <CommercialTab agentId={agentId} /> : <p className={classes.hint}>Os números de funil são do agente comercial. Veja abaixo o uso da IA por este agente.</p>}
            <button type="button" className={classes.more} onClick={() => setCosts((v) => !v)} aria-expanded={costs}>
              <BarChart3 size={18} />Custos e uso da IA<span style={{ flex: 1 }} /><ChevronDown size={18} style={{ transform: costs ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
            </button>
            {costs && <div style={{ marginTop: 16 }}><UsageTab agentId={agentId} model={d.agent.model} /></div>}
          </>
        )}

        {section === "ajustes" && (() => {
          const persona = (agent && agent.persona) || {};
          const who = String(persona.assistantName || "").trim();
          const name = who || "Estela";
          const intro = (persona.commercial && persona.commercial.greeting) ? persona.commercial.greeting.replace(/\{\{\s*nome\s*\}\}/gi, "Maria").replace(/\{\{\s*assistente\s*\}\}/gi, name) : `Olá! Eu sou ${/^(a|o) /i.test(name) ? name : `a ${name}`}, assistente virtual da Cruzeiro do Sul Virtual.`;
          const courses = d.courses || { total: 0, names: [], withoutGrade: [] };
          const row = (key, Icon, name, text, run) => (
            <button key={key} type="button" className={classes.arow} onClick={run}>
              <span className={classes.settingIcon} style={{ margin: 0 }}><Icon size={18} /></span>
              <span style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 14.5 }}>{name}</b><div className={classes.hint}>{text}</div></span>
              <ChevronRight size={18} style={{ opacity: 0.5, flex: "none" }} />
            </button>
          );
          const advanced = settings.filter((x) => ["descobrir", "acoes", "roteiro", "historico", "chave"].includes(x.key));
          return (
            <div style={{ display: "grid", gap: 16 }}>
              <Section title="Como o agente fala" hint="É a primeira coisa que o lead vê.">
                <div className={classes.introBox}>“{intro}”</div>
                <div className={classes.hint} style={{ margin: "8px 0 12px" }}>{persona.tone ? `Tom: ${persona.tone}` : "Defina o tom de voz, as regras e o que dizer quando o agente não souber."}</div>
                <Button variant="outlined" onClick={() => setDialog({ name: "editor", tab: 0 })} style={{ borderRadius: 12, textTransform: "none", fontWeight: 600 }}>Editar o jeito de atender</Button>
                {commercial && <div style={{ marginTop: 12 }}>{row("atendimento", Bot, "Atendimento comercial", "Saudação, o que perguntar, quando o lead está qualificado, quando transferir e as mensagens da transferência.", () => setDialog({ name: "atendimento" }))}</div>}
              </Section>

              {commercial && (
                <Section title="O que ele oferece" hint="Vem do cadastro de cursos do sistema: o agente só fala destes e envia a grade de cada um.">
                  <div className={classes.stats} style={{ marginBottom: 12 }}>
                    <StatCard label="cursos oferecidos" value={courses.total} />
                    <StatCard label="com grade para enviar" value={courses.total - courses.withoutGrade.length} tone={courses.withoutGrade.length ? "#d97706" : "#16a34a"} />
                  </div>
                  {courses.names.length > 0 && <div className={classes.topics}>{courses.names.slice(0, 10).map((n) => <span key={n} className={classes.topic}>{n}</span>)}{courses.names.length > 10 && <span className={classes.hint}>e mais {courses.names.length - 10}</span>}</div>}
                  {courses.withoutGrade.length > 0 && <div className={classes.hint} style={{ color: "#b45309", marginBottom: 8 }}>Sem grade cadastrada: {courses.withoutGrade.slice(0, 6).join(", ")}{courses.withoutGrade.length > 6 ? "…" : ""}. O agente não consegue enviar a grade desses cursos.</div>}
                  {row("grades", FileText, "Cursos e grades", "Cadastre ou atualize os cursos oferecidos e as grades curriculares.", () => history.push("/grades"))}
                  {row("mec", Scale, "Regras do MEC", "Como cada curso é oferecido, pela Portaria 378/2025.", () => setDialog({ name: "mec" }))}
                </Section>
              )}

              <Section title="Quando passa para a equipe" hint="Quem continua a conversa e onde o lead aparece no CRM.">
                {row("assume", UserCheck, "Quem assume a conversa", "Consultor de cada polo, fila central, prazos de resposta e áudios.", () => setDialog({ name: "assume" }))}
                {commercial && row("polos", MapPin, "Cidades de cada polo", "O agente usa as cidades para achar o polo do lead.", () => history.push("/polos"))}
                {commercial && row("funil", Filter, "Etapas do CRM", "Qual coluna do CRM cada etapa do agente usa.", () => setDialog({ name: "funil" }))}
              </Section>

              <button type="button" className={classes.more} onClick={() => setAdv((v) => !v)} aria-expanded={adv}>
                <Key size={18} />Avançado: chave de IA, o que descobrir, ações e roteiro<span style={{ flex: 1 }} /><ChevronDown size={18} style={{ transform: adv ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
              </button>
              {adv && <div style={{ display: "grid", gap: 4 }}>{advanced.map((x) => row(x.key, x.icon, x.name, x.text, x.run))}</div>}
            </div>
          );
        })()}
      </div>
    </MainContainer>
  );
};

export default Central;
