import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useHistory, useLocation, useParams } from "react-router-dom";
import { Button, CircularProgress, Menu, MenuItem, Switch, makeStyles } from "@material-ui/core";
import {
  AlertTriangle, ArrowLeft, BarChart3, BookOpen, CheckCircle2, ChevronDown, ChevronRight, FileText, FileUp, Filter, Globe, HelpCircle, Home, Key, MapPin, MessageSquare,
  PlayCircle, Plus, Scale, Settings2, Sparkles, UserCheck, Workflow,
} from "lucide-react";

import MainContainer from "../../components/MainContainer";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import AgentEditor from "./AgentEditor";
import CommercialTab from "./CommercialTab";
import FunnelDialog from "./FunnelDialog";
import HandoffDialog from "./HandoffDialog";
import KbTab from "./KbTab";
import KeysDialog from "./KeysDialog";
import LearningTab from "./LearningTab";
import RegulationsDialog from "./RegulationsDialog";
import TestTab from "./TestTab";
import UsageTab from "./UsageTab";

const SECTIONS = [
  { key: "inicio", label: "Início", icon: Home },
  { key: "ensinar", label: "Ensinar", icon: BookOpen },
  { key: "testar", label: "Testar", icon: PlayCircle },
  { key: "resultados", label: "Resultados", icon: BarChart3 },
  { key: "ajustes", label: "Ajustes", icon: Settings2 },
];

const useStyles = makeStyles((theme) => ({
  page: { flex: 1, overflowY: "auto", overflowX: "hidden", ...theme.scrollbarStyles, paddingBottom: theme.spacing(4) },
  back: { display: "inline-flex", alignItems: "center", gap: 6, border: 0, background: "none", cursor: "pointer", color: theme.palette.text.secondary, fontFamily: "inherit", fontSize: 13.5, padding: "4px 2px", marginBottom: theme.spacing(1), "&:hover": { color: theme.palette.primary.main } },
  hero: { display: "flex", alignItems: "center", gap: theme.spacing(2), flexWrap: "wrap", padding: theme.spacing(2.5), borderRadius: 22, color: "#fff", background: "linear-gradient(120deg, #0B4279 0%, #0a63b3 55%, #0693E3 100%)", boxShadow: "0 14px 34px rgba(11,66,121,.28)", marginBottom: theme.spacing(2) },
  heroIcon: { width: 52, height: 52, borderRadius: 16, display: "grid", placeItems: "center", background: "rgba(255,255,255,.16)", flex: "none" },
  heroName: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.2 },
  heroSub: { fontSize: 13.5, opacity: 0.85, marginTop: 2 },
  heroRight: { marginLeft: "auto", display: "flex", alignItems: "center", gap: theme.spacing(1.5), flexWrap: "wrap" },
  pill: { display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999, padding: "4px 12px", fontSize: 12.5, fontWeight: 700, background: "rgba(255,255,255,.18)" },
  heroBtn: { color: "#fff", borderColor: "rgba(255,255,255,.55)", borderRadius: 12, textTransform: "none", fontWeight: 600, "&:hover": { background: "rgba(255,255,255,.12)", borderColor: "#fff" } },
  nav: { display: "flex", gap: 4, padding: 4, borderRadius: 16, background: theme.palette.action.hover, marginBottom: theme.spacing(2.5), overflowX: "auto" },
  navBtn: { flex: 1, minWidth: 108, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: 0, borderRadius: 12, padding: "10px 12px", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 600, color: theme.palette.text.secondary, background: "transparent", whiteSpace: "nowrap", transition: "background .15s, color .15s, box-shadow .15s", "&:hover": { color: theme.palette.text.primary }, "&[data-on=true]": { background: theme.palette.background.paper, color: theme.palette.primary.main, boxShadow: "0 1px 5px rgba(15,23,42,.14)" }, "&:focus-visible": { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 } },
  badge: { minWidth: 20, height: 20, borderRadius: 10, padding: "0 6px", display: "inline-grid", placeItems: "center", fontSize: 11.5, fontWeight: 700, color: "#fff", background: "#ea580c" },
  stats: { display: "grid", gap: theme.spacing(1.5), gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", marginBottom: theme.spacing(2.5) },
  stat: { padding: theme.spacing(2), borderRadius: 18, border: `1px solid ${theme.palette.divider}`, background: theme.palette.background.paper },
  statNum: { fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1, fontVariantNumeric: "tabular-nums" },
  statLabel: { fontSize: 13, color: theme.palette.text.secondary, marginTop: 4 },
  cols: { display: "grid", gap: theme.spacing(2), gridTemplateColumns: "minmax(0, 1.25fr) minmax(0, 1fr)", alignItems: "start", [theme.breakpoints.down("sm")]: { gridTemplateColumns: "1fr" } },
  panel: { padding: theme.spacing(2.25), borderRadius: 20, border: `1px solid ${theme.palette.divider}`, background: theme.palette.background.paper, marginBottom: theme.spacing(2) },
  panelTitle: { fontSize: 16, fontWeight: 700, marginBottom: theme.spacing(1.25) },
  hint: { fontSize: 13, color: theme.palette.text.secondary },
  todo: { display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", border: `1px solid ${theme.palette.divider}`, borderRadius: 14, padding: theme.spacing(1.25, 1.5), marginBottom: theme.spacing(1), background: "transparent", cursor: "pointer", fontFamily: "inherit", color: "inherit", transition: "border-color .15s, background .15s, transform .15s", "&:hover": { borderColor: theme.palette.primary.main, background: "rgba(6,147,227,.05)", transform: "translateX(2px)" }, "&:focus-visible": { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 } },
  todoIcon: { width: 34, height: 34, borderRadius: 11, display: "grid", placeItems: "center", flex: "none", background: "rgba(217,119,6,.14)", color: "#d97706" },
  allGood: { display: "flex", alignItems: "center", gap: 12, padding: theme.spacing(1.75), borderRadius: 14, background: "rgba(22,163,74,.1)", color: "#15803d", fontWeight: 600 },
  check: { display: "flex", alignItems: "flex-start", gap: 10, padding: theme.spacing(1, 0), borderBottom: `1px solid ${theme.palette.divider}`, "&:last-child": { borderBottom: 0 } },
  ok: { color: "#16a34a", flex: "none", marginTop: 1 },
  warn: { color: "#d97706", flex: "none", marginTop: 1 },
  link: { border: 0, background: "none", color: theme.palette.primary.main, fontFamily: "inherit", fontWeight: 600, fontSize: 12.5, cursor: "pointer", padding: 0, marginTop: 2 },
  question: { display: "flex", alignItems: "center", gap: 10, padding: theme.spacing(1, 0), borderBottom: `1px solid ${theme.palette.divider}`, "&:last-child": { borderBottom: 0 } },
  sub: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: theme.spacing(2) },
  subBtn: { display: "inline-flex", alignItems: "center", gap: 8, border: `1px solid ${theme.palette.divider}`, borderRadius: 999, padding: "7px 14px", background: "transparent", fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, color: theme.palette.text.secondary, cursor: "pointer", "&[data-on=true]": { background: theme.palette.primary.main, borderColor: theme.palette.primary.main, color: "#fff" } },
  topics: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: theme.spacing(2) },
  topic: { display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999, padding: "5px 12px", fontSize: 12.5, fontWeight: 600, border: `1px solid ${theme.palette.divider}`, background: "transparent", cursor: "pointer", fontFamily: "inherit", color: theme.palette.text.primary, "&:hover": { borderColor: theme.palette.primary.main } },
  settings: { display: "grid", gap: theme.spacing(1.5), gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" },
  setting: { display: "flex", flexDirection: "column", gap: 6, textAlign: "left", padding: theme.spacing(2), borderRadius: 18, border: `1px solid ${theme.palette.divider}`, background: theme.palette.background.paper, cursor: "pointer", fontFamily: "inherit", color: "inherit", transition: "transform .15s, border-color .15s, box-shadow .15s", "&:hover": { transform: "translateY(-2px)", borderColor: theme.palette.primary.light, boxShadow: "0 10px 24px rgba(15,23,42,.08)" }, "&:focus-visible": { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 } },
  settingIcon: { width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", background: "rgba(6,147,227,.12)", color: theme.palette.primary.main, marginBottom: 2 },
  settingName: { fontSize: 15.5, fontWeight: 700 },
  more: { display: "flex", alignItems: "center", gap: 8, width: "100%", border: `1px solid ${theme.palette.divider}`, borderRadius: 14, padding: theme.spacing(1.25, 1.75), background: "transparent", fontFamily: "inherit", fontSize: 14, fontWeight: 600, color: "inherit", cursor: "pointer", marginTop: theme.spacing(2) },
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
  const [dialog, setDialog] = useState({ name: null, tab: 0 });

  const section = useMemo(() => {
    const s = new URLSearchParams(location.search).get("secao");
    return SECTIONS.some((x) => x.key === s) ? s : "inicio";
  }, [location.search]);
  const go = useCallback((key, extra = {}) => {
    history.replace(`/ai-agents/${agentId}/central?secao=${key}`);
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
  const teachAbout = (mode, topic = "") => { setKb((k) => ({ mode, topic, n: k.n + 1 })); go("ensinar", { teach: "conteudo" }); setAddMenu(null); };
  const closeDialog = () => { setDialog({ name: null, tab: 0 }); load(); };

  // each check of the health says where it is fixed
  const fix = (how) => {
    if (how === "ligar") return toggle();
    if (how === "roteiro") return d.flow ? history.push(`/ai-agents/blocos/${d.flow.id}`) : go("ajustes");
    if (how === "polos") return history.push("/polos");
    const [, item] = how.split(":");
    return setDialog({ name: item || "ajustes", tab: 0 });
  };

  if (!d) return <MainContainer><div style={{ padding: 32 }}><CircularProgress size={26} /></div></MainContainer>;

  const commercial = d.agent.kind === "commercial";
  const failing = d.health.filter((h) => !h.ok);
  const todo = [
    ...failing.map((h) => ({ key: `h-${h.key}`, title: h.label, text: h.detail, run: () => fix(h.fix) })),
    ...(d.pending.waiting ? [{ key: "waiting", title: `${d.pending.waiting} pergunta${d.pending.waiting === 1 ? "" : "s"} sem resposta`, text: "O agente não soube responder. A sua resposta vira conhecimento dele.", run: () => go("ensinar", { teach: "perguntas" }) }] : []),
    ...(d.pending.toReview ? [{ key: "review", title: `${d.pending.toReview} resposta${d.pending.toReview === 1 ? "" : "s"} da equipe para aprovar`, text: "A equipe já respondeu. Aprove para o agente aprender.", run: () => go("ensinar", { teach: "perguntas" }) }] : []),
    ...d.topics.filter((t) => !t.ok).slice(0, 3).map((t) => ({ key: `t-${t.topic}`, title: `Ensinar sobre ${t.label}`, text: "Hoje o agente diz que vai confirmar. Envie um texto ou PDF.", run: () => teachAbout(0, t.topic) })),
  ];
  const waiting = d.questions.filter((q) => q.status !== "para_revisar").slice(0, 4);

  const stat = (num, label, color) => (<div className={classes.stat}><div className={classes.statNum} style={color ? { color } : undefined}>{num}</div><div className={classes.statLabel}>{label}</div></div>);

  const settings = [
    { key: "jeito", icon: MessageSquare, name: "Jeito de atender", text: "Tom de voz, regras, o que dizer quando não souber, limites de gasto e quando o agente atende.", run: () => setDialog({ name: "editor", tab: 0 }) },
    { key: "descobrir", icon: Sparkles, name: "O que descobrir do cliente", text: "Os dados que o agente pergunta para qualificar quem chega.", run: () => setDialog({ name: "editor", tab: 1 }) },
    { key: "acoes", icon: Workflow, name: "Ações automáticas", text: "Fluxos que o agente pode iniciar sozinho durante a conversa.", run: () => setDialog({ name: "editor", tab: 2 }) },
    ...(d.flow ? [{ key: "roteiro", icon: Workflow, name: "Roteiro da conversa", text: `O desenho em blocos (${d.flow.status === "published" ? `publicado, versão ${d.flow.version}` : "em edição"}).`, run: () => history.push(`/ai-agents/blocos/${d.flow.id}`) }] : []),
    { key: "assume", icon: UserCheck, name: "Quem assume a conversa", text: "Consultor de cada polo, fila central, prazos de resposta e áudios.", run: () => setDialog({ name: "assume" }) },
    ...(commercial ? [
      { key: "polos", icon: MapPin, name: "Cidades de cada polo", text: "Em quais cidades cada polo atende. O agente usa isso para achar o polo do lead.", run: () => history.push("/polos") },
      { key: "funil", icon: Filter, name: "Etapas do CRM", text: "Qual coluna do CRM cada etapa do agente usa.", run: () => setDialog({ name: "funil" }) },
      { key: "mec", icon: Scale, name: "Regras do MEC", text: "Como cada curso é oferecido, pela Portaria 378/2025, com ajuste por área ou curso.", run: () => setDialog({ name: "mec" }) },
    ] : []),
    { key: "chave", icon: Key, name: "Chave de IA", text: "A chave usada pelo agente para responder (Claude ou GPT).", run: () => setDialog({ name: "chave" }) },
  ];

  return (
    <MainContainer>
      <AgentEditor open={dialog.name === "editor"} agent={agent} initialTab={dialog.tab} onClose={closeDialog} onSaved={load} />
      <HandoffDialog open={dialog.name === "assume"} onClose={closeDialog} />
      <FunnelDialog open={dialog.name === "funil"} onClose={closeDialog} />
      <RegulationsDialog open={dialog.name === "mec"} onClose={closeDialog} />
      <KeysDialog open={dialog.name === "chave"} onClose={closeDialog} onSaved={load} />

      <div className={classes.page}>
        <button type="button" className={classes.back} onClick={() => history.push("/ai-agents")}><ArrowLeft size={16} />Agentes de IA</button>

        <div className={classes.hero}>
          <span className={classes.heroIcon}><Sparkles size={26} /></span>
          <div>
            <div className={classes.heroName}>{d.agent.name}</div>
            <div className={classes.heroSub}>{commercial ? "Agente comercial" : "Agente de atendimento"} · {d.agent.provider === "openai" ? "GPT" : "Claude"}</div>
          </div>
          <div className={classes.heroRight}>
            <span className={classes.pill}>
              {failing.length === 0 && d.agent.active ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
              {failing.length === 0 ? "Tudo certo" : `${failing.length} ponto${failing.length === 1 ? "" : "s"} de atenção`}
            </span>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13.5, fontWeight: 600 }}>
              <Switch checked={!!d.agent.active} onChange={toggle} color="default" inputProps={{ "aria-label": "Ligar ou desligar o agente" }} />{d.agent.active ? "Ligado" : "Desligado"}
            </label>
            {d.flow && <Button variant="outlined" className={classes.heroBtn} style={{ color: "#fff", background: "rgba(255,255,255,.14)", borderColor: "rgba(255,255,255,.6)" }} startIcon={<Workflow size={16} />} onClick={() => history.push(`/ai-agents/blocos/${d.flow.id}`)}>Roteiro</Button>}
          </div>
        </div>

        <div className={classes.nav} role="tablist">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const count = s.key === "ensinar" ? d.pending.waiting + d.pending.toReview : 0;
            return (
              <button key={s.key} type="button" role="tab" aria-selected={section === s.key} className={classes.navBtn} data-on={section === s.key} onClick={() => go(s.key)}>
                <Icon size={17} />{s.label}{count > 0 && <span className={classes.badge}>{count}</span>}
              </button>
            );
          })}
        </div>

        {section === "inicio" && (
          <>
            <div className={classes.stats}>
              {stat(d.week.conversations, "conversas nos últimos 7 dias")}
              {stat(d.week.qualifiedRate === null ? "—" : `${d.week.qualifiedRate}%`, "chegaram a qualificados")}
              {stat(d.week.handedOver, "passaram para a equipe")}
              {stat(d.week.unanswered, "perguntas sem resposta", d.week.unanswered ? "#d97706" : undefined)}
            </div>
            <div className={classes.cols}>
              <div>
                <div className={classes.panel}>
                  <div className={classes.panelTitle}>O que fazer agora</div>
                  {todo.length === 0 ? (
                    <div className={classes.allGood}><CheckCircle2 size={20} />Tudo em dia. O agente tem o que precisa para atender.</div>
                  ) : todo.map((t) => (
                    <button key={t.key} type="button" className={classes.todo} onClick={t.run}>
                      <span className={classes.todoIcon}><AlertTriangle size={17} /></span>
                      <span style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 14 }}>{t.title}</b><div className={classes.hint}>{t.text}</div></span>
                      <ChevronRight size={18} style={{ opacity: 0.5, flex: "none" }} />
                    </button>
                  ))}
                </div>
                {waiting.length > 0 && (
                  <div className={classes.panel}>
                    <div className={classes.panelTitle}>Perguntas que o agente não soube responder</div>
                    {waiting.map((q) => (
                      <div key={q.question} className={classes.question}>
                        <HelpCircle size={18} style={{ opacity: 0.6, flex: "none" }} />
                        <div style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere", fontSize: 14 }}>{q.question}{q.count > 1 && <div className={classes.hint}>perguntada {q.count} vezes</div>}</div>
                        <Button size="small" variant="outlined" onClick={() => go("ensinar", { teach: "perguntas" })} style={{ borderRadius: 10 }}>Responder</Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className={classes.panel}>
                <div className={classes.panelTitle}>Saúde do agente</div>
                {d.health.map((h) => (
                  <div key={h.key} className={classes.check} style={{ alignItems: "center" }}>
                    {h.ok ? <CheckCircle2 size={18} className={classes.ok} /> : <AlertTriangle size={18} className={classes.warn} />}
                    <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600 }}>{h.label}</div>
                    {h.ok ? <span className={classes.hint}>Ok</span> : <button type="button" className={classes.link} style={{ marginTop: 0 }} onClick={() => fix(h.fix)}>Resolver</button>}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {section === "ensinar" && (
          <>
            <div className={classes.sub}>
              <button type="button" className={classes.subBtn} data-on={teach === "perguntas"} onClick={() => setTeach("perguntas")}>Perguntas sem resposta{d.pending.waiting + d.pending.toReview > 0 && <span className={classes.badge}>{d.pending.waiting + d.pending.toReview}</span>}</button>
              <button type="button" className={classes.subBtn} data-on={teach === "conteudo"} onClick={() => setTeach("conteudo")}>O que o agente sabe</button>
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
                <div className={classes.panelTitle}>Assuntos que o agente conhece</div>
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
          <>
            <p className={classes.hint} style={{ marginTop: 0 }}>Converse como se fosse um lead. Nada é enviado a ninguém e nenhum lead é criado.</p>
            <TestTab agentId={agentId} />
          </>
        )}

        {section === "resultados" && (
          <>
            {commercial ? <CommercialTab agentId={agentId} /> : <p className={classes.hint}>Os números de funil são do agente comercial. Veja abaixo o uso da IA por este agente.</p>}
            <button type="button" className={classes.more} onClick={() => setCosts((v) => !v)} aria-expanded={costs}>
              <BarChart3 size={18} />Custos e uso da IA<span style={{ flex: 1 }} /><ChevronDown size={18} style={{ transform: costs ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
            </button>
            {costs && <div style={{ marginTop: 16 }}><UsageTab agentId={agentId} model={d.agent.model} /></div>}
          </>
        )}

        {section === "ajustes" && (
          <div className={classes.settings}>
            {settings.map((s) => {
              const Icon = s.icon;
              return (
                <button key={s.key} type="button" className={classes.setting} onClick={s.run}>
                  <span className={classes.settingIcon}><Icon size={20} /></span>
                  <span className={classes.settingName}>{s.name}</span>
                  <span className={classes.hint}>{s.text}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </MainContainer>
  );
};

export default Central;
