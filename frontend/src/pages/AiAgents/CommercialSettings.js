import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Radio, RadioGroup, Switch, TextField, Typography, makeStyles } from "@material-ui/core";

import api from "../../services/api";
import toastError from "../../errors/toastError";

// The adjustments of the commercial attendance, in one place and in plain words. They are saved in the persona of the agent, so every change goes to
// the history of the agent ("Histórico de alterações") and can be restored.
const DEFAULTS = {
  greeting: "",
  ask: { name: true, course: true, city: true, entry: true, modality: true, mainQuestion: true },
  qualifyRequires: ["course", "city", "entry", "explained"],
  qualifyAfter: null,
  hotHandoff: "intent",
  maxClarifications: 3,
  keepOwner: true,
  messages: { queued: "", afterHours: "" },
};
const DEFAULT_HANDOFF = "Perfeito! Já organizei suas informações e vou encaminhar seu atendimento para um consultor do nosso polo, que vai continuar com você por aqui.";

const useStyles = makeStyles((theme) => ({
  section: { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: theme.palette.text.secondary, margin: theme.spacing(2.5, 0, 0.5) },
  hint: { fontSize: 12.5, color: theme.palette.text.secondary },
  grid: { display: "grid", gap: theme.spacing(0.5, 2), gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" },
  fixed: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 },
  pill: { fontSize: 12, padding: "3px 10px", borderRadius: 999, border: `1px solid ${theme.palette.divider}`, color: theme.palette.text.secondary },
}));

const ASK = [["name", "Nome"], ["course", "Curso"], ["city", "Cidade ou polo"], ["entry", "Primeira graduação ou formação anterior"], ["modality", "Modalidade"], ["mainQuestion", "Principal dúvida"]];
const REQUIRES = [["course", "Curso informado"], ["city", "Cidade ou polo conhecido"], ["entry", "Tipo de ingresso conhecido"], ["explained", "Curso apresentado"]];

const merge = (c) => ({ ...DEFAULTS, ...(c || {}), ask: { ...DEFAULTS.ask, ...((c && c.ask) || {}) }, messages: { ...DEFAULTS.messages, ...((c && c.messages) || {}) } });

const CommercialSettings = ({ open, agent, onClose, onSaved, onOpenAssign }) => {
  const classes = useStyles();
  const [cfg, setCfg] = useState(merge(null));
  const [assistant, setAssistant] = useState("");
  const [handoff, setHandoff] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !agent) return;
    const p = agent.persona || {};
    setCfg(merge(p.commercial));
    setAssistant(p.assistantName || "");
    setHandoff(agent.handoffMessage || "");
  }, [open, agent]);

  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));
  const toggleReq = (k) => set("qualifyRequires", cfg.qualifyRequires.includes(k) ? cfg.qualifyRequires.filter((x) => x !== k) : [...cfg.qualifyRequires, k]);

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/ai-agents/${agent.id}`, {
        handoffMessage: handoff,
        persona: { ...(agent.persona || {}), assistantName: assistant.trim() || undefined, commercial: cfg },
      });
      toast.success("Configuração salva. A versão anterior continua no histórico.");
      if (onSaved) onSaved();
      onClose();
    } catch (err) { toastError(err); }
    setBusy(false);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper">
      <DialogTitle>Atendimento comercial</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="textSecondary">Ajuste como o agente recebe, qualifica e encaminha os leads. Tudo o que está em branco usa o jeito padrão.</Typography>

        <div className={classes.section}>Apresentação</div>
        <div className={classes.grid}>
          <TextField variant="outlined" margin="dense" label="Nome do assistente" placeholder="Estela" value={assistant} onChange={(e) => setAssistant(e.target.value)} helperText="Padrão: Estela. Ele sempre se apresenta como assistente virtual." />
        </div>
        <TextField fullWidth multiline rows={2} variant="outlined" margin="dense" label="Saudação (opcional)" value={cfg.greeting} onChange={(e) => set("greeting", e.target.value)}
          placeholder="Oi, {{nome}}! Que bom ter você por aqui."
          helperText="Use {{nome}} e {{assistente}}. Vazio: o agente adapta a abertura ao que a pessoa escreveu (se ela já disse o curso ou o que quer, ele reconhece na hora)." />

        <div className={classes.section}>O que ele pode perguntar</div>
        <div className={classes.hint}>O que já está no CRM ou que a pessoa já disse nunca é perguntado de novo. Desmarque o que não faz sentido perguntar.</div>
        <div className={classes.grid}>
          {ASK.map(([k, label]) => (
            <FormControlLabel key={k} control={<Switch color="primary" checked={cfg.ask[k] !== false} onChange={(e) => set("ask", { ...cfg.ask, [k]: e.target.checked })} />} label={label} />
          ))}
        </div>

        <div className={classes.section}>Quando o lead está qualificado</div>
        <div className={classes.grid}>
          {REQUIRES.map(([k, label]) => (
            <FormControlLabel key={k} control={<Checkbox color="primary" checked={cfg.qualifyRequires.includes(k)} onChange={() => toggleReq(k)} />} label={label} />
          ))}
        </div>
        <div className={classes.grid}>
          <TextField type="number" variant="outlined" margin="dense" label="Respostas depois de qualificado" inputProps={{ min: 0, max: 10 }} value={cfg.qualifyAfter === null ? "" : cfg.qualifyAfter}
            onChange={(e) => set("qualifyAfter", e.target.value === "" ? null : Number(e.target.value))} helperText="Vazio: usa a regra geral da empresa. 0: o agente nunca passa por esta regra." />
          <TextField type="number" variant="outlined" margin="dense" label="Tentativas de esclarecimento" inputProps={{ min: 1, max: 6 }} value={cfg.maxClarifications}
            onChange={(e) => set("maxClarifications", Number(e.target.value))} helperText="Mensagens seguidas que o agente não consegue responder antes de uma pessoa assumir." />
        </div>

        <div className={classes.section}>Transferência para o consultor</div>
        <div className={classes.hint}>Sempre acontece, mesmo com dados incompletos, quando a pessoa:</div>
        <div className={classes.fixed}>
          {["pede uma pessoa", "quer se matricular", "pede valores ou proposta", "pede link de inscrição", "quer negociar", "traz um problema que exige humano", "pergunta algo que não dá para confirmar"].map((t) => <span key={t} className={classes.pill}>{t}</span>)}
        </div>
        <RadioGroup value={cfg.hotHandoff} onChange={(e) => set("hotHandoff", e.target.value)} style={{ marginTop: 8 }}>
          <FormControlLabel value="intent" control={<Radio color="primary" />} label="Só nesses casos (padrão)" />
          <FormControlLabel value="hot" control={<Radio color="primary" />} label="Também assim que o lead ficar quente (ex.: disse que decide agora)" />
        </RadioGroup>

        <div className={classes.section}>Quem recebe</div>
        <FormControlLabel control={<Switch color="primary" checked={cfg.keepOwner} onChange={(e) => set("keepOwner", e.target.checked)} />} label="Manter o consultor que já atende o lead, quando ele faz parte da equipe do polo" />
        <div className={classes.hint}>
          O polo, o departamento, a fila de reserva, os horários e a distribuição entre consultores ficam em{" "}
          <Button size="small" color="primary" onClick={onOpenAssign} style={{ textTransform: "none", padding: 0, minWidth: 0 }}>Quem assume a conversa</Button>. Fora do expediente o lead entra na fila com prioridade registrada.
        </div>

        <div className={classes.section}>Mensagens da transferência</div>
        <TextField fullWidth multiline rows={2} variant="outlined" margin="dense" label="Quando o consultor vai assumir" value={handoff} onChange={(e) => setHandoff(e.target.value)} placeholder={DEFAULT_HANDOFF}
          helperText="Dita antes de a conversa passar para a equipe. Evite prometer atendimento imediato." />
        <TextField fullWidth multiline rows={2} variant="outlined" margin="dense" label="Quando o lead fica na fila" value={cfg.messages.queued} onChange={(e) => set("messages", { ...cfg.messages, queued: e.target.value })}
          placeholder="Seu atendimento já está na fila do polo. Assim que um consultor estiver disponível, ele continua com você por aqui." helperText="Use {{polo}}. Dita só depois que o sistema confirma que ninguém está livre." />
        <TextField fullWidth multiline rows={2} variant="outlined" margin="dense" label="Fora do expediente" value={cfg.messages.afterHours} onChange={(e) => set("messages", { ...cfg.messages, afterHours: e.target.value })}
          placeholder="Nossa equipe retorna {{quando}}. Pode deixar sua mensagem aqui que ela já fica para o consultor." helperText="Use {{quando}} e {{polo}}." />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" color="primary" disableElevation onClick={save} disabled={busy}>{busy ? "Salvando..." : "Salvar"}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default CommercialSettings;
