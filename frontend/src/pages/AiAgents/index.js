import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Button, Paper, TextField, Typography, Switch, Tooltip, makeStyles } from "@material-ui/core";
import { Bot, Plus, Settings2, Trash2 } from "lucide-react";

import IconAction from "../../components/IconAction";
import ConfirmationModal from "../../components/ConfirmationModal";
import AgentEditor from "./AgentEditor";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
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
  agentActions: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: theme.spacing(1) },
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
        <TextField
          size="small"
          variant="outlined"
          label="Anthropic API key"
          type="password"
          value={keys.anthropic}
          onChange={(e) => setKeys({ ...keys, anthropic: e.target.value })}
          style={{ minWidth: 280 }}
        />
        <TextField
          size="small"
          variant="outlined"
          label="OpenAI API key"
          type="password"
          value={keys.openai}
          onChange={(e) => setKeys({ ...keys, openai: e.target.value })}
          style={{ minWidth: 280 }}
        />
        <Button variant="contained" color="primary" onClick={save}>Salvar chaves</Button>
      </div>
    </Paper>
  );
};

const AiAgents = () => {
  const classes = useStyles();
  const [agents, setAgents] = useState(null);
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new agent
  const [removing, setRemoving] = useState(null);

  const load = useCallback(() => api.get("/ai-agents").then(({ data }) => setAgents(data)).catch((e) => { toastError(e); setAgents([]); }), []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (a) => {
    try { await api.put(`/ai-agents/${a.id}`, { active: !a.active }); load(); } catch (err) { toastError(err); }
  };

  return (
    <MainContainer>
      <AgentEditor open={editing !== undefined} agent={editing || null} onClose={() => { setEditing(undefined); load(); }} onSaved={load} />
      <ConfirmationModal title="Remover este agente?" open={!!removing} onClose={() => setRemoving(null)}
        onConfirm={async () => { try { await api.delete(`/ai-agents/${removing.id}`); load(); } catch (e) { toastError(e); } setRemoving(null); }}>
        A base de conhecimento dele também será apagada.
      </ConfirmationModal>
      <MainHeader>
        <Title>Agentes de IA</Title>
        <Button variant="contained" color="primary" startIcon={<Plus size={16} />} onClick={() => setEditing(null)}>Novo agente</Button>
      </MainHeader>
      <div className={classes.wrap}>
        <Keys />
        {agents && agents.length === 0 && (
          <Paper variant="outlined" className={classes.paper}>
            <Typography variant="h6">Nenhum agente ainda</Typography>
            <Typography variant="body2" color="textSecondary">
              O agente responde os alunos sozinho, usa a base de conhecimento, descobre cidade e curso e passa a conversa para a equipe do polo com um resumo. Clique em Novo agente para começar.
            </Typography>
          </Paper>
        )}
        <div className={classes.cards}>
          {(agents || []).map((a) => (
            <Paper key={a.id} variant="outlined" className={classes.agent}>
              <div className={classes.agentHead}>
                <Bot size={20} />
                <span className={classes.agentName} title={a.name}>{a.name}</span>
                <Tooltip title={a.active ? "Desligar o agente" : "Ligar o agente"}><span><Switch size="small" color="primary" checked={!!a.active} onChange={() => toggle(a)} /></span></Tooltip>
              </div>
              <Typography variant="body2" color="textSecondary">{a.provider === "openai" ? "OpenAI" : "Claude"} · {a.model}</Typography>
              <Typography variant="body2" color="textSecondary">Atende: {a.queueId ? "uma fila" : a.whatsappId ? "uma conexão" : "todos os atendimentos sem atendente"}</Typography>
              <div className={classes.agentActions}>
                <Button size="small" variant="outlined" color="primary" startIcon={<Settings2 size={15} />} onClick={() => setEditing(a)}>Configurar</Button>
                <IconAction title="Remover agente" onClick={() => setRemoving(a)}><Trash2 size={16} /></IconAction>
              </div>
            </Paper>
          ))}
        </div>
      </div>
    </MainContainer>
  );
};

export default AiAgents;
