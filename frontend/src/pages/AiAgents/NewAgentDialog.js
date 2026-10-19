import React, { useEffect, useState } from "react";
import { Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, TextField, Typography, makeStyles } from "@material-ui/core";
import { Plus, Sparkles, Workflow } from "lucide-react";

import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => ({
  choice: { display: "flex", gap: 12, alignItems: "flex-start", padding: 12, borderRadius: 12, border: theme.border.divider, cursor: "pointer", marginBottom: 8, "&:hover": { borderColor: theme.palette.primary.main }, "&[data-on=true]": { borderColor: theme.palette.primary.main, background: "rgba(6,147,227,.08)" } },
  hint: { fontSize: 12.5, color: theme.palette.text.secondary },
  tpl: { padding: "9px 12px", borderRadius: 10, border: theme.border.divider, cursor: "pointer", marginBottom: 6, "&:hover": { borderColor: theme.palette.primary.main }, "&[data-on=true]": { borderColor: theme.palette.primary.main, background: "rgba(6,147,227,.08)" } },
  tag: { display: "inline-block", fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: "1px 8px", marginLeft: 6, background: "rgba(15,118,110,.14)", color: "#0f766e" },
}));

const EXAMPLES = [
  "Uma clínica odontológica que agenda avaliações pelo WhatsApp, explica os tratamentos e passa os orçamentos para a recepção.",
  "Uma escola de idiomas que qualifica quem quer fazer aula experimental, descobre o nível e agenda com a coordenação.",
  "Uma loja de móveis planejados que entende o ambiente, pede fotos e passa o cliente para um projetista.",
];

// Three ways to make an agent, all ending on the same board of blocks: from a ready model (by segment), described to the AI, or from scratch.
const NewAgentDialog = ({ open, onClose, onCreated, onManual }) => {
  const classes = useStyles();
  const [mode, setMode] = useState("template");
  const [templates, setTemplates] = useState([]);
  const [template, setTemplate] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [segment, setSegment] = useState("");
  const [funnel, setFunnel] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode("template"); setName(""); setDescription(""); setSegment(""); setFunnel(true);
    api.get("/ai-agent-templates").then(({ data }) => { setTemplates(data); setTemplate(data[0] ? data[0].key : ""); }).catch(() => undefined);
  }, [open]);

  const chosen = templates.find((t) => t.key === template);
  const choice = (key, icon, title, text) => (
    <div className={classes.choice} data-on={mode === key} onClick={() => setMode(key)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setMode(key); }}>
      <span style={{ marginTop: 2 }}>{icon}</span><span><b style={{ fontSize: 14 }}>{title}</b><div className={classes.hint}>{text}</div></span>
    </div>
  );

  const create = async () => {
    if (mode === "manual") { onManual(); return; }
    setBusy(true);
    try {
      const { data } = mode === "ai"
        ? await api.post("/ai-agents/generate", { description, segment: segment || undefined, name: name || undefined })
        : await api.post("/ai-agents/from-template", { template, name: name || undefined, createFunnel: chosen && chosen.commercial ? funnel : undefined });
      onCreated(data);
    } catch (e) { toastError(e); }
    setBusy(false);
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth scroll="paper">
      <DialogTitle>Novo agente de IA</DialogTitle>
      <DialogContent dividers>
        {choice("template", <Workflow size={20} color="#0693E3" />, "Modelo por segmento", "Um agente pronto, com a conversa desenhada em blocos, respostas na base de conhecimento e a transferência para a equipe. Você confere e ajusta tudo no quadro.")}
        {mode === "template" && (
          <div style={{ marginBottom: 12 }}>
            {templates.map((t) => (
              <div key={t.key} className={classes.tpl} data-on={template === t.key} role="button" tabIndex={0} onClick={() => setTemplate(t.key)} onKeyDown={(e) => { if (e.key === "Enter") setTemplate(t.key); }}>
                <b style={{ fontSize: 14 }}>{t.name}</b><span className={classes.tag} style={t.commercial ? undefined : { background: "rgba(100,116,139,.16)", color: "#475569" }}>{t.segment}</span>
                <div className={classes.hint}>{t.description}</div>
                <div className={classes.hint}>{t.stages} etapa(s) com IA · {t.blocks} blocos</div>
              </div>
            ))}
            {chosen && chosen.commercial && (
              <div style={{ border: "1px dashed rgba(15,118,110,.6)", borderRadius: 10, padding: "8px 12px", marginTop: 4 }}>
                <FormControlLabel control={<Checkbox color="primary" checked={funnel} onChange={(e) => setFunnel(e.target.checked)} />} label={<b style={{ fontSize: 13.5 }}>Preparar o funil do CRM para este agente</b>} />
                <div className={classes.hint}>
                  O agente move o lead sozinho entre as colunas (Contato iniciado, Em atendimento, Qualificado, Aguardando histórico, Análise curricular, Pronto para proposta, Follow-up, Atendimento humano…). Marcado, o sistema reconhece as colunas que você já tem e cria só as que faltam, sem mudar nem apagar as existentes. Desmarcado, o lead fica onde está nas colunas que não existirem. Você ajusta depois em “Funil do CRM”.
                </div>
              </div>
            )}
          </div>
        )}
        {choice("ai", <Sparkles size={20} color="#db2777" />, "Criar com IA", "Conte como é o negócio e o atendimento. A IA escreve a persona, as respostas e desenha os blocos; o sistema confere o desenho e corrige os erros antes de mostrar.")}
        {mode === "ai" && (
          <div style={{ marginBottom: 12 }}>
            <TextField fullWidth multiline rows={4} variant="outlined" size="small" label="Descreva o negócio e como deve ser o atendimento" value={description} onChange={(e) => setDescription(e.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField fullWidth variant="outlined" size="small" margin="dense" label="Segmento (opcional)" value={segment} onChange={(e) => setSegment(e.target.value)} InputLabelProps={{ shrink: true }} placeholder="Educação, saúde, varejo…" />
            <div className={classes.hint} style={{ margin: "6px 0 4px" }}>Exemplos (clique para usar):</div>
            {EXAMPLES.map((x) => <div key={x} role="button" tabIndex={0} onClick={() => setDescription(x)} style={{ fontSize: 12.5, padding: "5px 8px", borderRadius: 8, border: "1px solid rgba(127,140,160,.3)", marginBottom: 4, cursor: "pointer" }}>{x}</div>)}
          </div>
        )}
        {choice("manual", <Plus size={20} />, "Do zero, com o formulário", "Um agente de prompt único (o jeito antigo). Depois dá para converter em blocos com um clique.")}
        {mode !== "manual" && <TextField fullWidth variant="outlined" size="small" label="Nome do agente (opcional)" value={name} onChange={(e) => setName(e.target.value)} InputLabelProps={{ shrink: true }} style={{ marginTop: 8 }} />}
        <Typography variant="caption" color="textSecondary" display="block" style={{ marginTop: 10 }}>
          O agente nasce desligado e o desenho como rascunho: ninguém é atendido até você revisar, testar, publicar e ligar.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="secondary" onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button variant="contained" color="primary" onClick={create} disabled={busy || (mode === "ai" && description.trim().length < 20) || (mode === "template" && !template)}
          startIcon={busy ? <CircularProgress size={16} /> : mode === "ai" ? <Sparkles size={16} /> : undefined}>
          {busy ? (mode === "ai" ? "A IA está desenhando…" : "Criando…") : mode === "ai" ? "Criar com IA" : mode === "manual" ? "Continuar" : "Criar agente"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default NewAgentDialog;
