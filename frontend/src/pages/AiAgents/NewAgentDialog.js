import React, { useEffect, useState } from "react";
import { Button, CircularProgress, Dialog, DialogActions, DialogContent, Switch, TextField, makeStyles } from "@material-ui/core";
import { Check, ChevronDown, GraduationCap, Headphones, Info, Pencil, Bot, MessageSquare, Workflow, X } from "lucide-react";

import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => ({
  paper: { borderRadius: 22, overflow: "hidden" },
  head: { display: "flex", alignItems: "flex-start", gap: 14, padding: theme.spacing(2.5, 3, 1.5) },
  headIcon: { width: 44, height: 44, borderRadius: 14, display: "grid", placeItems: "center", flex: "none", color: "#fff", background: "linear-gradient(135deg, #0B4279 0%, #0693E3 100%)", boxShadow: "0 6px 16px rgba(6,147,227,.35)" },
  title: { fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.2 },
  sub: { fontSize: 13.5, color: theme.palette.text.secondary, marginTop: 2 },
  close: { marginLeft: "auto", border: 0, background: "transparent", cursor: "pointer", color: theme.palette.text.secondary, borderRadius: 10, padding: 6, display: "flex", "&:hover": { background: theme.palette.action.hover } },
  body: { padding: theme.spacing(1, 3, 2) },
  tabs: { display: "flex", gap: 4, padding: 4, borderRadius: 14, background: theme.palette.action.hover, marginBottom: theme.spacing(2) },
  tab: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: 0, borderRadius: 11, padding: "9px 10px", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 600, color: theme.palette.text.secondary, background: "transparent", transition: "background .15s, color .15s, box-shadow .15s", "&:hover": { color: theme.palette.text.primary }, "&[data-on=true]": { background: theme.palette.background.paper, color: theme.palette.primary.main, boxShadow: "0 1px 4px rgba(15,23,42,.12)" }, "&:focus-visible": { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 }, [theme.breakpoints.down("xs")]: { flexDirection: "column", gap: 3, fontSize: 12, padding: "8px 4px", lineHeight: 1.2 } },
  lead: { fontSize: 13.5, color: theme.palette.text.secondary, margin: theme.spacing(0, 0, 1.5) },
  grid: { display: "grid", gap: theme.spacing(1.5), gridTemplateColumns: "1fr 1fr", [theme.breakpoints.down("xs")]: { gridTemplateColumns: "1fr" } },
  card: { position: "relative", textAlign: "left", fontFamily: "inherit", color: "inherit", display: "flex", flexDirection: "column", gap: 6, padding: theme.spacing(2), borderRadius: 16, border: `1.5px solid ${theme.palette.divider}`, background: theme.palette.background.paper, cursor: "pointer", transition: "transform .15s, border-color .15s, box-shadow .15s", "&:hover": { transform: "translateY(-1px)", borderColor: theme.palette.primary.light, boxShadow: "0 8px 22px rgba(15,23,42,.08)" }, "&[data-on=true]": { borderColor: theme.palette.primary.main, boxShadow: "0 0 0 3px rgba(6,147,227,.16)" }, "&:focus-visible": { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 } },
  cardIcon: { width: 38, height: 38, borderRadius: 12, display: "grid", placeItems: "center", background: "rgba(6,147,227,.12)", color: theme.palette.primary.main },
  cardName: { fontSize: 15.5, fontWeight: 700 },
  cardText: { fontSize: 13, color: theme.palette.text.secondary, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" },
  meta: { fontSize: 12, color: theme.palette.text.secondary, marginTop: "auto", paddingTop: 4 },
  tick: { position: "absolute", top: 12, right: 12, width: 22, height: 22, borderRadius: "50%", display: "grid", placeItems: "center", color: "#fff", background: theme.palette.primary.main, transform: "scale(0)", transition: "transform .15s", "[data-on=true] > &": { transform: "scale(1)" } },
  row: { display: "flex", alignItems: "center", gap: 12, padding: theme.spacing(1.25, 1.5), borderRadius: 14, background: theme.palette.action.hover, marginTop: theme.spacing(1.5) },
  rowTitle: { fontSize: 14, fontWeight: 600 },
  rowSub: { fontSize: 12.5, color: theme.palette.text.secondary },
  more: { display: "inline-flex", alignItems: "center", gap: 4, border: 0, background: "none", padding: 0, margin: "8px 2px 0", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: theme.palette.primary.main },
  detail: { fontSize: 12.5, color: theme.palette.text.secondary, margin: "6px 2px 0", lineHeight: 1.55 },
  chips: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 },
  chip: { border: `1px solid ${theme.palette.divider}`, background: theme.palette.background.paper, borderRadius: 999, padding: "6px 12px", fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", color: theme.palette.text.primary, textAlign: "left", transition: "border-color .15s, background .15s", "&:hover": { borderColor: theme.palette.primary.main, background: "rgba(6,147,227,.06)" } },
  empty: { textAlign: "center", padding: theme.spacing(3, 2), borderRadius: 16, border: `1.5px dashed ${theme.palette.divider}`, color: theme.palette.text.secondary, fontSize: 13.5 },
  foot: { display: "flex", flexDirection: "column", gap: 10, width: "100%" },
  safe: { display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: theme.palette.text.secondary },
  actions: { display: "flex", justifyContent: "flex-end", gap: 8 },
}));

const EXAMPLES = [
  "Clínica odontológica: agenda avaliações e passa os orçamentos para a recepção",
  "Escola de idiomas: descobre o nível e agenda a aula experimental",
  "Loja de móveis planejados: entende o ambiente e passa para um projetista",
];

const TABS = [
  { key: "quick", label: "Agente comercial", icon: GraduationCap },
  { key: "template", label: "Outro modelo", icon: Workflow },
  { key: "ai", label: "Descrever para a IA", icon: MessageSquare },
  { key: "manual", label: "Do zero", icon: Pencil },
];

const TONES = [
  { key: "acolhedor", label: "Acolhedor", text: "Acolhedor e próximo, como um consultor que conhece quem estuda e trabalha ao mesmo tempo" },
  { key: "objetivo", label: "Objetivo", text: "Objetivo e direto, respostas curtas e claras, sem rodeios" },
  { key: "formal", label: "Formal", text: "Formal e cordial, linguagem profissional" },
];
const READY = [
  "Só fala dos cursos cadastrados no sistema (se pedirem outro, avisa que não oferece)",
  "Se apresenta na primeira mensagem de toda conversa",
  "Envia a grade curricular do curso do lead",
  "Passa para o consultor do polo quando o lead está pronto",
];
const introPreview = (who) => { const n = who.trim(); return n ? `Olá! Eu sou ${/^(a|o) /i.test(n) ? n : `a ${n}`}, assistente virtual da Cruzeiro do Sul Virtual.` : "Olá! Eu sou o assistente virtual da Cruzeiro do Sul Virtual."; };

const iconOf = (t) => (/comercial/i.test(t.key + t.name) ? GraduationCap : /atendimento|encaminh/i.test(t.key + t.name) ? Headphones : Workflow);

// Three ways to make an agent, all ending on the same board: a ready model, described to the AI, or from scratch. Everything stays in one short
// screen: the long explanations are one click away instead of in the way.
const NewAgentDialog = ({ open, onClose, onCreated, onManual }) => {
  const classes = useStyles();
  const [mode, setMode] = useState("template");
  const [templates, setTemplates] = useState([]);
  const [template, setTemplate] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [funnel, setFunnel] = useState(true);
  const [funnelInfo, setFunnelInfo] = useState(false);
  const [assistantName, setAssistantName] = useState("");
  const [tone, setTone] = useState(TONES[0].text);
  const [others, setOthers] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode("quick"); setName(""); setDescription(""); setFunnel(true); setFunnelInfo(false); setAssistantName(""); setTone(TONES[0].text); setOthers(false);
    api.get("/ai-agent-templates").then(({ data }) => { setTemplates(data); const c = data.find((t) => t.commercial) || data[0]; setTemplate(c ? c.key : ""); }).catch(() => undefined);
  }, [open]);

  const chosen = templates.find((t) => t.key === template);
  const commercial = templates.find((t) => t.commercial) || null;

  const create = async () => {
    if (mode === "manual") { onManual(); return; }
    setBusy(true);
    try {
      const { data } = mode === "ai"
        ? await api.post("/ai-agents/generate", { description, name: name || undefined })
        : mode === "quick"
          ? await api.post("/ai-agents/from-template", { template: commercial ? commercial.key : template, name: name || undefined, assistantName: assistantName.trim() || undefined, tone, createFunnel: funnel })
          : await api.post("/ai-agents/from-template", { template, name: name || undefined, createFunnel: chosen && chosen.commercial ? funnel : undefined });
      onCreated(data);
    } catch (e) { toastError(e); }
    setBusy(false);
  };

  const label = busy ? (mode === "ai" ? "A IA está desenhando…" : "Criando…") : mode === "ai" ? "Criar com IA" : mode === "manual" ? "Continuar" : "Criar agente";
  const disabled = busy || (mode === "ai" && description.trim().length < 20) || (mode === "template" && !template) || (mode === "quick" && !commercial);
  const preview = introPreview(assistantName);

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth scroll="paper" PaperProps={{ className: classes.paper }}>
      <div className={classes.head}>
        <span className={classes.headIcon}><Bot size={22} /></span>
        <div>
          <div className={classes.title}>Novo agente de IA</div>
          <div className={classes.sub}>Escolha como começar. Você revisa tudo antes de ligar.</div>
        </div>
        <button type="button" className={classes.close} onClick={onClose} disabled={busy} aria-label="Fechar"><X size={20} /></button>
      </div>

      <DialogContent className={classes.body}>
        {mode === "quick" && (
          <>
            <p className={classes.lead}>Um agente comercial completo, pronto para atender quem chega. Você só escolhe como ele se apresenta.</p>
            <TextField fullWidth variant="outlined" size="small" label="Como ele se apresenta (opcional)" placeholder="Ex.: Bia" value={assistantName} onChange={(e) => setAssistantName(e.target.value)} InputLabelProps={{ shrink: true }} helperText={`Primeira mensagem: “${preview}”`} />
            <div className={classes.rowSub} style={{ margin: "14px 0 6px" }}>Tom de voz</div>
            <div className={classes.chips} style={{ marginTop: 0 }} role="group" aria-label="Tom de voz">
              {TONES.map((t) => <button key={t.key} type="button" className={classes.chip} style={tone === t.text ? { borderColor: "#0693E3", background: "rgba(6,147,227,.1)", fontWeight: 700 } : undefined} aria-pressed={tone === t.text} onClick={() => setTone(t.text)}>{t.label}</button>)}
            </div>
            <ul style={{ listStyle: "none", margin: "16px 0 0", padding: 0, display: "grid", gap: 6, fontSize: 13.5 }}>
              {READY.map((x) => <li key={x} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><Check size={15} style={{ color: "#16a34a", flex: "none", marginTop: 3 }} />{x}</li>)}
            </ul>
            <div className={classes.row}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className={classes.rowTitle}>Preparar as colunas do CRM</div>
                <div className={classes.rowSub}>O agente move o lead sozinho entre as etapas do funil; só cria as colunas que faltam.</div>
              </div>
              <Switch color="primary" checked={funnel} onChange={(e) => setFunnel(e.target.checked)} inputProps={{ "aria-label": "Preparar as colunas do CRM" }} />
            </div>
            <button type="button" className={classes.more} onClick={() => setOthers((v) => !v)} aria-expanded={others}>
              Outras formas de criar<ChevronDown size={14} style={{ transform: others ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
            </button>
            {others && (
              <div className={classes.chips}>
                <button type="button" className={classes.chip} onClick={() => setMode("ai")}>Descrever para a IA</button>
                <button type="button" className={classes.chip} onClick={() => setMode("template")}>Outro modelo pronto</button>
                <button type="button" className={classes.chip} onClick={() => setMode("manual")}>Do zero</button>
              </div>
            )}
          </>
        )}
        {mode !== "quick" && (
        <div className={classes.tabs} role="tablist">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.key} type="button" role="tab" aria-selected={mode === t.key} className={classes.tab} data-on={mode === t.key} onClick={() => setMode(t.key)}>
                <Icon size={16} />{t.label}
              </button>
            );
          })}
        </div>
        )}

        {mode === "template" && (
          <>
            <p className={classes.lead}>Um agente já montado: conversa, respostas e passagem para a equipe. Você ajusta o que quiser depois.</p>
            <div className={classes.grid}>
              {templates.map((t) => {
                const Icon = iconOf(t);
                return (
                  <button key={t.key} type="button" className={classes.card} data-on={template === t.key} onClick={() => setTemplate(t.key)} aria-pressed={template === t.key}>
                    <span className={classes.tick}><Check size={14} /></span>
                    <span className={classes.cardIcon}><Icon size={20} /></span>
                    <span className={classes.cardName}>{t.name}</span>
                    <span className={classes.cardText}>{t.description}</span>
                    <span className={classes.meta}>{t.stages} etapa{t.stages === 1 ? "" : "s"} com IA · {t.blocks} blocos</span>
                  </button>
                );
              })}
            </div>
            {chosen && chosen.commercial && (
              <>
                <div className={classes.row}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className={classes.rowTitle}>Preparar as colunas do CRM</div>
                    <div className={classes.rowSub}>O agente move o lead sozinho entre as etapas do funil.</div>
                  </div>
                  <Switch color="primary" checked={funnel} onChange={(e) => setFunnel(e.target.checked)} inputProps={{ "aria-label": "Preparar as colunas do CRM" }} />
                </div>
                <button type="button" className={classes.more} onClick={() => setFunnelInfo((v) => !v)} aria-expanded={funnelInfo}>
                  <Info size={14} />Como funciona<ChevronDown size={14} style={{ transform: funnelInfo ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
                </button>
                {funnelInfo && (
                  <div className={classes.detail}>
                    Ligado: o sistema reconhece as colunas que você já tem e cria só as que faltam (Contato iniciado, Em atendimento, Qualificado, Pronto para proposta, Follow-up, Atendimento humano…). Nada que existe é renomeado, movido ou apagado.
                    Desligado: nas colunas que não existirem, o lead fica onde está. Dá para ajustar depois em “Funil do CRM”.
                  </div>
                )}
              </>
            )}
          </>
        )}

        {mode === "ai" && (
          <>
            <p className={classes.lead}>Conte como é o negócio e como o atendimento deve ser. A IA escreve o jeito de falar e as respostas, e desenha a conversa; o sistema confere e corrige o desenho antes de mostrar.</p>
            <TextField fullWidth multiline minRows={4} variant="outlined" label="Descreva o negócio e o atendimento" value={description} onChange={(e) => setDescription(e.target.value)}
              InputLabelProps={{ shrink: true }} helperText={description.trim().length < 20 ? "Escreva pelo menos uma frase sobre o negócio." : " "} />
            <div className={classes.rowSub} style={{ marginTop: 4 }}>Precisa de ideias? Toque em um exemplo:</div>
            <div className={classes.chips}>
              {EXAMPLES.map((x) => <button key={x} type="button" className={classes.chip} onClick={() => setDescription(x)}>{x}</button>)}
            </div>
          </>
        )}

        {mode === "manual" && (
          <div className={classes.empty}>
            Você monta o agente pelo formulário, com um único roteiro de atendimento.
            <div style={{ marginTop: 6 }}>Depois dá para converter para o desenho em blocos com um clique.</div>
          </div>
        )}
      </DialogContent>

      <DialogActions style={{ padding: "8px 24px 20px" }}>
        <div className={classes.foot}>
          {mode !== "manual" && <TextField fullWidth variant="outlined" size="small" label={mode === "quick" ? "Nome do agente (opcional)" : "Nome do agente (opcional)"} value={name} onChange={(e) => setName(e.target.value)} InputLabelProps={{ shrink: true }} />}
          <div className={classes.safe}><Info size={15} style={{ flex: "none", marginTop: 1 }} />O agente nasce desligado e em edição: ninguém é atendido até você revisar, testar, publicar e ligar.</div>
          <div className={classes.actions}>
            <Button onClick={onClose} disabled={busy}>Cancelar</Button>
            <Button variant="contained" color="primary" onClick={create} disabled={disabled} disableElevation style={{ borderRadius: 12, paddingLeft: 20, paddingRight: 20 }}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : mode === "ai" ? <MessageSquare size={16} /> : undefined}>{label}</Button>
          </div>
        </div>
      </DialogActions>
    </Dialog>
  );
};

export default NewAgentDialog;
