import React, { useCallback, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { Button, Paper, TextField, Typography, Switch, Tooltip, makeStyles } from "@material-ui/core";
import { Bot, FileText, Filter, Plus, Scale, Settings2, Trash2, Workflow } from "lucide-react";

import IconAction from "../../components/IconAction";
import ConfirmationModal from "../../components/ConfirmationModal";
import AgentEditor from "./AgentEditor";
import FunnelDialog from "./FunnelDialog";
import NewAgentDialog from "./NewAgentDialog";
import RegulationsDialog from "./RegulationsDialog";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => ({
  wrap: { display: "flex", flexDirection: "column", flex: 1, overflowY: "auto", overflowX: "hidden", gap: theme.spacing(2) },
  paper: { padding: theme.spacing(2) },
  row: { display: "flex", gap: theme.spacing(1), flexWrap: "wrap", alignItems: "center" },
  cards: { display: "grid", gap: theme.spacing(2), gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" },
  agent: { padding: theme.spacing(2), borderRadius: 16, display: "flex", flexDirection: "column", gap: theme.spacing(0.5) },
  agentHead: { display: "flex", alignItems: "center", gap: theme.spacing(1) },
  agentName: { flex: 1, minWidth: 0, fontWeight: 700, fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  agentActions: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: theme.spacing(1), marginTop: theme.spacing(1), flexWrap: "wrap" },
  chip: { display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 999, padding: "2px 9px", fontSize: 12, fontWeight: 700 },
}));

const Keys = () => {
  const classes = useStyles();
  const [keys, setKeys] = useState({ anthropic: "", openai: "" });

  useEffect(() => {
    api.get("/ai-settings").then(({ data }) => setKeys(data)).catch(toastError);
  }, []);

  const save = async () => {
    try {
      await api.put("/ai-settings", keys);
      toast.success("Chaves salvas");
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <Paper className={classes.paper} variant="outlined">
      <Typography variant="h6">Chaves de API (padrão)</Typography>
      <Typography variant="body2" color="textSecondary" gutterBottom>
        Usadas pelos agentes que não tiverem uma chave própria. As chaves ficam salvas no servidor e nunca voltam inteiras para o navegador.
      </Typography>
      <div className={classes.row}>
        <TextField size="small" variant="outlined" label="Anthropic API key" type="password" value={keys.anthropic} onChange={(e) => setKeys({ ...keys, anthropic: e.target.value })} style={{ minWidth: 280 }} />
        <TextField size="small" variant="outlined" label="OpenAI API key" type="password" value={keys.openai} onChange={(e) => setKeys({ ...keys, openai: e.target.value })} style={{ minWidth: 280 }} />
        <Button variant="contained" color="primary" onClick={save}>Salvar chaves</Button>
      </div>
    </Paper>
  );
};

const AiAgents = () => {
  const classes = useStyles();
  const history = useHistory();
  const [agents, setAgents] = useState(null);
  const [flows, setFlows] = useState([]);
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new agent (form)
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [funnelOpen, setFunnelOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  const load = useCallback(() => {
    api.get("/ai-agents").then(({ data }) => setAgents(data)).catch((e) => { toastError(e); setAgents([]); });
    api.get("/flows", { params: { kind: "agent" } }).then(({ data }) => setFlows(Array.isArray(data) ? data : [])).catch(() => setFlows([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (a) => {
    try { await api.put(`/ai-agents/${a.id}`, { active: !a.active }); load(); } catch (err) { toastError(err); }
  };
  const convert = async (a) => {
    try { const { data } = await api.post(`/ai-agents/${a.id}/convert`, {}); toast.success("Pronto: o agente virou blocos, em rascunho. Confira antes de publicar."); history.push(`/ai-agents/blocos/${data.flowId}`); } catch (e) { toastError(e); }
  };
  const flowOf = (a) => flows.find((f) => f.agentId === a.id);

  return (
    <MainContainer>
      <AgentEditor open={editing !== undefined} agent={editing || null} onClose={() => { setEditing(undefined); load(); }} onSaved={load} />
      <NewAgentDialog open={creating} onClose={() => setCreating(false)} onManual={() => { setCreating(false); setEditing(null); }}
        onCreated={(made) => {
          setCreating(false);
          if (made.funnel && made.funnel.created && made.funnel.created.length) toast.success(`Colunas criadas no CRM: ${made.funnel.created.join(", ")}.`);
          else toast.success("Agente criado. Confira os blocos, teste e publique.");
          history.push(`/ai-agents/blocos/${made.flowId}`);
        }} />
      <FunnelDialog open={funnelOpen} onClose={() => setFunnelOpen(false)} />
      <RegulationsDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
      <ConfirmationModal title="Remover este agente?" open={!!removing} onClose={() => setRemoving(null)}
        onConfirm={async () => { try { await api.delete(`/ai-agents/${removing.id}`); load(); } catch (e) { toastError(e); } setRemoving(null); }}>
        A base de conhecimento e os blocos dele também serão apagados.
      </ConfirmationModal>
      <MainHeader>
        <Title>Agentes de IA</Title>
        <MainHeaderButtonsWrapper>
          <Button variant="outlined" startIcon={<Filter size={16} />} onClick={() => setFunnelOpen(true)}>Funil do CRM</Button>
          <Button variant="outlined" startIcon={<Scale size={16} />} onClick={() => setRulesOpen(true)}>Regras do MEC</Button>
          <Button variant="contained" color="primary" startIcon={<Plus size={16} />} onClick={() => setCreating(true)}>Novo agente</Button>
        </MainHeaderButtonsWrapper>
      </MainHeader>
      <div className={classes.wrap}>
        <Keys />
        {agents && agents.length === 0 && (
          <Paper variant="outlined" className={classes.paper}>
            <Typography variant="h6">Nenhum agente ainda</Typography>
            <Typography variant="body2" color="textSecondary">
              O agente responde os alunos sozinho, usa a base de conhecimento, descobre o que falta e passa a conversa para a equipe com um resumo. Ele é desenhado em blocos, como o chatbot: comece de um modelo por segmento ou descreva o negócio e a IA monta o desenho para você conferir.
            </Typography>
            <Button style={{ marginTop: 12 }} variant="contained" color="primary" startIcon={<Plus size={16} />} onClick={() => setCreating(true)}>Criar o primeiro agente</Button>
          </Paper>
        )}
        <div className={classes.cards}>
          {(agents || []).map((a) => {
            const f = flowOf(a);
            return (
              <Paper key={a.id} variant="outlined" className={classes.agent}>
                <div className={classes.agentHead}>
                  <Bot size={20} />
                  <span className={classes.agentName} title={a.name}>{a.name}</span>
                  <Tooltip title={a.active ? "Desligar o agente" : "Ligar o agente"}><span><Switch size="small" color="primary" checked={!!a.active} onChange={() => toggle(a)} /></span></Tooltip>
                </div>
                <Typography variant="body2" color="textSecondary">{a.provider === "openai" ? "OpenAI" : "Claude"} · {a.model}</Typography>
                <Typography variant="body2" color="textSecondary">Atende: {a.queueId ? "uma fila" : a.whatsappId ? "uma conexão" : "todos os atendimentos sem atendente"}</Typography>
                <div style={{ marginTop: 6 }}>
                  {f ? (
                    <span className={classes.chip} style={{ background: f.status === "published" ? "rgba(22,163,74,.16)" : "rgba(100,116,139,.18)", color: f.status === "published" ? "#15803d" : "#475569" }}>
                      <Workflow size={12} /> {f.status === "published" ? `Blocos publicados v${f.version}` : "Blocos em rascunho"}{f.status === "published" && f.changed ? " · com alterações" : ""}
                    </span>
                  ) : (
                    <span className={classes.chip} style={{ background: "rgba(100,116,139,.18)", color: "#475569" }}><FileText size={12} /> Prompt único</span>
                  )}
                </div>
                <div className={classes.agentActions}>
                  {f ? (
                    <Button size="small" variant="contained" color="primary" startIcon={<Workflow size={15} />} onClick={() => history.push(`/ai-agents/blocos/${f.id}`)}>Blocos</Button>
                  ) : (
                    <Tooltip title="Mostra este agente como blocos, em rascunho. Nada muda para as pessoas até você publicar."><Button size="small" variant="outlined" color="primary" startIcon={<Workflow size={15} />} onClick={() => convert(a)}>Converter em blocos</Button></Tooltip>
                  )}
                  <Button size="small" variant="outlined" color="primary" startIcon={<Settings2 size={15} />} onClick={() => setEditing(a)}>Configurar</Button>
                  <IconAction title="Remover agente" onClick={() => setRemoving(a)}><Trash2 size={16} /></IconAction>
                </div>
              </Paper>
            );
          })}
        </div>
      </div>
    </MainContainer>
  );
};

export default AiAgents;
