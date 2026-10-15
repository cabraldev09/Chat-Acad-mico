import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Tabs, Tab, TextField, MenuItem, FormControlLabel, Switch,
  Typography, Checkbox, makeStyles, CircularProgress, Chip, Badge,
} from "@material-ui/core";
import { Plus, Trash2, RotateCcw, Bot } from "lucide-react";

import IconAction from "../../components/IconAction";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import KbTab from "./KbTab";
import UsageTab from "./UsageTab";
import TestTab from "./TestTab";
import LearningTab from "./LearningTab";
import FunctionsTab from "./FunctionsTab";

const MODELS = { anthropic: "claude-haiku-5-5", openai: "gpt-4o-mini" };

const DEFAULT_SLOTS = [
  { key: "nome", label: "Nome", required: true },
  { key: "cidade", label: "Cidade", required: true },
  { key: "curso", label: "Curso de interesse", required: true },
  { key: "modalidade", label: "Modalidade (EAD, semipresencial)", required: false },
  { key: "forma_ingresso", label: "Forma de ingresso (vestibular, ENEM, transferência, segunda graduação)", required: false },
  { key: "semestre_transferencia", label: "Semestre em que está (se for transferência)", required: false },
];

const useStyles = makeStyles((theme) => ({
  content: { minHeight: 440, paddingTop: theme.spacing(1) },
  section: { fontSize: 13, fontWeight: 700, color: theme.palette.text.secondary, margin: theme.spacing(2, 0, 0.5) },
  grid: { display: "grid", gap: theme.spacing(1.5), gridTemplateColumns: "1fr 1fr", [theme.breakpoints.down("xs")]: { gridTemplateColumns: "1fr" } },
  slot: { display: "flex", alignItems: "center", gap: theme.spacing(0.5), padding: theme.spacing(0.25, 1), borderRadius: 12, border: `1px solid ${theme.palette.divider}`, marginBottom: theme.spacing(0.75) },
  slotLabel: { flex: 1, minWidth: 0 },
  header: { display: "flex", alignItems: "center", gap: theme.spacing(1.5), padding: theme.spacing(2, 3, 1.25) },
  headBadge: { width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", background: theme.palette.primary.main, flex: "none" },
  headTitle: { fontSize: 18, fontWeight: 700, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  headSub: { fontSize: 13, color: theme.palette.text.secondary },
  tabsWrap: { padding: theme.spacing(0, 3, 1.5) },
  locked: { color: theme.palette.text.secondary, fontSize: 14, padding: theme.spacing(4, 2), textAlign: "center" },
}));

const blank = () => ({
  name: "", provider: "anthropic", model: MODELS.anthropic, apiKey: "", systemPrompt: "Você é a assistente virtual de matrículas da instituição. Seja acolhedora, objetiva e responda em português.",
  persona: { tone: "Acolhedor, direto e respeitoso. Trate o aluno pelo primeiro nome.", rules: "Faça uma pergunta por vez.\nSempre convide o aluno a falar com um consultor para a proposta.", forbidden: "Prometer mensalidade fixa até o fim do curso.\nPrometer desconto ou bolsa sem a proposta oficial.\nPedir CPF ou dados de pagamento." },
  handoffMessage: "Vou chamar um consultor da nossa equipe para continuar com você. Um momento, por favor.",
  maxTokens: 350, dailyTokenCap: 300000, handoffAfterTurns: 14, waitSeconds: 4, slots: null, active: true, queueId: "", whatsappId: "",
});

const AgentEditor = ({ open, agent, onClose, onSaved }) => {
  const classes = useStyles();
  const [tab, setTab] = useState(0);
  const [v, setV] = useState(blank());
  const [id, setId] = useState(null);
  const [queues, setQueues] = useState([]);
  const [connections, setConnections] = useState([]);
  const [saving, setSaving] = useState(false);
  const [toReview, setToReview] = useState(0);

  useEffect(() => {
    if (!open) return;
    setTab(0);
    setId(agent ? agent.id : null);
    setV(agent ? { ...blank(), ...agent, persona: { ...blank().persona, ...(agent.persona || {}) }, queueId: agent.queueId || "", whatsappId: agent.whatsappId || "" } : blank());
    api.get("/queue").then(({ data }) => setQueues(data)).catch(() => {});
    api.get("/whatsapp").then(({ data }) => setConnections(data)).catch(() => {});
  }, [open, agent]);

  const set = (k, val) => setV((cur) => ({ ...cur, [k]: val }));
  const setPersona = (k, val) => setV((cur) => ({ ...cur, persona: { ...cur.persona, [k]: val } }));
  const slots = Array.isArray(v.slots) && v.slots.length ? v.slots : DEFAULT_SLOTS;

  // returns the agent id (creating the agent first when it is new); used by the tabs that need an id
  const save = async (stay) => {
    if (!v.model.trim()) { toast.warn("Informe o modelo do agente."); setTab(0); return null; }
    // a new agent without a name gets a provisional one, so the tabs can be used right away
    const name = v.name.trim() || "Agente de matrículas";
    if (!v.name.trim()) set("name", name);
    setSaving(true);
    let savedId = id;
    try {
      const payload = { ...v, name, queueId: v.queueId || null, whatsappId: v.whatsappId || null, slots: v.slots };
      const { data } = id ? await api.put(`/ai-agents/${id}`, payload) : await api.post("/ai-agents", payload);
      savedId = data.id;
      if (!id) setId(data.id);
      if (!stay) toast.success(id ? "Agente salvo." : "Agente criado. Agora adicione a base de conhecimento.");
      onSaved && onSaved();
      if (!id && !stay) setTab(1);
    } catch (err) {
      toastError(err);
      savedId = null;
    }
    setSaving(false);
    return savedId;
  };

  // new agents are created the first time someone opens a tab that needs one
  const goTo = async (t) => {
    if (t > 0 && !id) {
      const created = await save(true);
      if (!created) return;
      toast.success("Agente criado.");
    }
    setTab(t);
  };

  const updateSlot = (i, patch) => set("slots", slots.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const addSlot = () => set("slots", [...slots, { key: `campo_${slots.length + 1}`, label: "", required: false }]);

  const locked = (children) => (id ? children : <div className={classes.locked}><CircularProgress size={22} /></div>);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper">
      <div className={classes.header}>
        <span className={classes.headBadge}><Bot size={22} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={classes.headTitle}>{v.name.trim() || "Novo agente de IA"}</div>
          <div className={classes.headSub}>{v.provider === "openai" ? "OpenAI" : "Claude"} · {v.model || "sem modelo"}</div>
        </div>
        <Chip size="small" label={v.active ? "Ativo" : "Desligado"} color={v.active ? "primary" : "default"} />
      </div>
      <div className={classes.tabsWrap}>
        <Tabs value={tab} onChange={(e, t) => goTo(t)} variant="scrollable" scrollButtons="auto">
          <Tab style={{ minWidth: 0 }} label="Persona e limites" />
          <Tab style={{ minWidth: 0 }} label="Base de conhecimento" />
          <Tab style={{ minWidth: 0 }} label={<Badge color="secondary" badgeContent={toReview} invisible={!toReview} style={{ paddingRight: toReview ? 14 : 0 }}>Aprendizado</Badge>} />
          <Tab style={{ minWidth: 0 }} label="Qualificação" />
          <Tab style={{ minWidth: 0 }} label="Funções" />
          <Tab style={{ minWidth: 0 }} label="Consumo" />
          <Tab style={{ minWidth: 0 }} label="Testar agente" />
        </Tabs>
      </div>
      <DialogContent dividers className={classes.content}>
        {tab === 0 && (
          <>
            <div className={classes.grid}>
              <TextField variant="outlined" margin="dense" label="Nome do agente" required value={v.name} onChange={(e) => set("name", e.target.value)} />
              <FormControlLabel style={{ marginTop: 8 }} control={<Switch color="primary" checked={!!v.active} onChange={(e) => set("active", e.target.checked)} />} label={v.active ? "Ativo: responde os alunos" : "Desligado"} />
              <TextField select variant="outlined" margin="dense" label="Provedor" value={v.provider} onChange={(e) => setV({ ...v, provider: e.target.value, model: MODELS[e.target.value] })}>
                <MenuItem value="anthropic">Anthropic (Claude)</MenuItem>
                <MenuItem value="openai">OpenAI (sem ferramentas)</MenuItem>
              </TextField>
              <TextField variant="outlined" margin="dense" label="Modelo" required value={v.model} onChange={(e) => set("model", e.target.value)} helperText="Modelo pequeno gasta menos. Sugestão: claude-haiku-5-5." />
              <TextField variant="outlined" margin="dense" type="password" label="Chave de API própria (opcional)" value={v.apiKey || ""} onChange={(e) => set("apiKey", e.target.value)} helperText="Se ficar vazio, usa a chave padrão da página." />
              <span />
            </div>

            <div className={classes.section}>Como o agente fala</div>
            <TextField fullWidth multiline rows={3} variant="outlined" margin="dense" label="Quem é o agente" value={v.systemPrompt || ""} onChange={(e) => set("systemPrompt", e.target.value)} />
            <TextField fullWidth variant="outlined" margin="dense" label="Tom de voz" value={v.persona.tone || ""} onChange={(e) => setPersona("tone", e.target.value)} />
            <div className={classes.grid}>
              <TextField multiline rows={4} variant="outlined" margin="dense" label="Regras do atendimento (uma por linha)" value={v.persona.rules || ""} onChange={(e) => setPersona("rules", e.target.value)} />
              <TextField multiline rows={4} variant="outlined" margin="dense" label="Nunca fazer (uma por linha)" value={v.persona.forbidden || ""} onChange={(e) => setPersona("forbidden", e.target.value)} />
            </div>
            <TextField fullWidth variant="outlined" margin="dense" label="Mensagem ao passar para a equipe" value={v.handoffMessage || ""} onChange={(e) => set("handoffMessage", e.target.value)} />

            <div className={classes.section}>Aprender e avisar você</div>
            <FormControlLabel control={<Switch color="primary" checked={v.learnFromTeam !== false} onChange={(e) => set("learnFromTeam", e.target.checked)} />}
              label={v.learnFromTeam !== false ? "Aprender com as respostas da equipe: ligado" : "Aprender com as respostas da equipe: desligado"} />
            <div className={classes.grid}>
              <TextField variant="outlined" margin="dense" label="WhatsApp para receber os avisos" placeholder="(69) 99999-0000" value={v.reviewNumber || ""} onChange={(e) => set("reviewNumber", e.target.value)}
                helperText="Quando o agente não souber algo, e quando a equipe responder, você recebe uma mensagem para revisar. Deixe vazio para não receber." />
              <TextField select variant="outlined" margin="dense" label="Enviar os avisos pela conexão" value={v.reviewWhatsappId || ""} onChange={(e) => set("reviewWhatsappId", e.target.value)} InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }}>
                <MenuItem value="">Conexão padrão</MenuItem>
                {connections.map((c) => (<MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>))}
              </TextField>
            </div>
            <TextField fullWidth variant="outlined" margin="dense" label="O que dizer ao aluno quando o agente não souber" value={v.persona.unknownMessage || ""} onChange={(e) => setPersona("unknownMessage", e.target.value)} placeholder="Ótima pergunta! Vou confirmar essa informação com a nossa equipe e já te respondo." />

            <div className={classes.section}>Quando atende</div>
            <div className={classes.grid}>
              <TextField select variant="outlined" margin="dense" label="Fila" value={v.queueId} onChange={(e) => set("queueId", e.target.value)} InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }}>
                <MenuItem value="">Todas as filas</MenuItem>
                {queues.map((q) => (<MenuItem key={q.id} value={q.id}>{q.name}</MenuItem>))}
              </TextField>
              <TextField select variant="outlined" margin="dense" label="Conexão" value={v.whatsappId} onChange={(e) => set("whatsappId", e.target.value)} InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }}>
                <MenuItem value="">Todas as conexões</MenuItem>
                {connections.map((c) => (<MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>))}
              </TextField>
            </div>

            <div className={classes.section}>Limites (para gastar pouco)</div>
            <div className={classes.grid}>
              <TextField type="number" variant="outlined" margin="dense" label="Esperar o aluno terminar de escrever (segundos)" value={v.waitSeconds} onChange={(e) => set("waitSeconds", Number(e.target.value))} helperText="Várias mensagens seguidas viram uma resposta só." />
              <TextField type="number" variant="outlined" margin="dense" label="Tamanho máximo de cada resposta (tokens)" value={v.maxTokens} onChange={(e) => set("maxTokens", Number(e.target.value))} helperText="350 equivale a umas 3 frases curtas." />
              <TextField type="number" variant="outlined" margin="dense" label="Passar para a equipe após quantas respostas" value={v.handoffAfterTurns} onChange={(e) => set("handoffAfterTurns", Number(e.target.value))} />
              <TextField type="number" variant="outlined" margin="dense" label="Limite diário de tokens (0 = sem limite)" value={v.dailyTokenCap} onChange={(e) => set("dailyTokenCap", Number(e.target.value))} helperText="Ao atingir, o agente passa as conversas para a equipe." />
            </div>
          </>
        )}
        {tab === 1 && locked(<KbTab agentId={id} />)}
        {tab === 2 && locked(<LearningTab agentId={id} onCount={setToReview} />)}
        {tab === 3 && (
          <>
            <Typography variant="body2" color="textSecondary" gutterBottom>
              O agente conversa até descobrir os campos obrigatórios. Quando todos estiverem preenchidos, o lead é atualizado, a conversa vai para a equipe comercial do polo do aluno com um resumo, e um consultor recebe uma tarefa.
            </Typography>
            {slots.map((s, i) => (
              <div key={s.key + i} className={classes.slot}>
                <TextField className={classes.slotLabel} margin="dense" label="O que descobrir" value={s.label} onChange={(e) => updateSlot(i, { label: e.target.value })} />
                <FormControlLabel control={<Checkbox color="primary" checked={!!s.required} onChange={(e) => updateSlot(i, { required: e.target.checked })} />} label="Obrigatório" />
                <IconAction title="Remover este campo" disabled={slots.length <= 1} onClick={() => set("slots", slots.filter((_, k) => k !== i))}><Trash2 size={16} /></IconAction>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <Button size="small" variant="outlined" startIcon={<Plus size={15} />} onClick={addSlot} disabled={slots.length >= 10}>Adicionar campo</Button>
              <Button size="small" variant="outlined" startIcon={<RotateCcw size={15} />} onClick={() => set("slots", null)}>Voltar ao padrão</Button>
            </div>
            <Typography variant="caption" color="textSecondary" display="block" style={{ marginTop: 12 }}>Lembre de salvar na aba Persona e limites depois de mudar os campos.</Typography>
          </>
        )}
        {tab === 4 && <FunctionsTab value={v.functions} onChange={(list) => set("functions", list)} />}
        {tab === 5 && locked(<UsageTab agentId={id} model={v.model} />)}
        {tab === 6 && locked(<TestTab agentId={id} />)}
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="secondary" onClick={onClose}>Fechar</Button>
        <Button variant="contained" color="primary" onClick={() => save(false)} disabled={saving}>{saving ? <CircularProgress size={18} /> : "Salvar agente"}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default AgentEditor;
