import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Button, Paper, TextField, Typography, makeStyles } from "@material-ui/core";

import CrudPage from "../../components/CrudPage";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => ({
  wrap: { display: "flex", flexDirection: "column", flex: 1, overflowY: "auto", overflowX: "hidden", gap: theme.spacing(2) },
  paper: { padding: theme.spacing(2) },
  row: { display: "flex", gap: theme.spacing(1), flexWrap: "wrap", alignItems: "center" },
}));

const MODELS = {
  anthropic: "claude-sonnet-5-5",
  openai: "gpt-4o-mini",
};

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
  const [queues, setQueues] = useState([]);
  const [connections, setConnections] = useState([]);

  useEffect(() => {
    api.get("/queue").then(({ data }) => setQueues(data));
    api.get("/whatsapp").then(({ data }) => setConnections(data));
  }, []);

  return (
    <MainContainer>
      <MainHeader>
        <Title>Agentes de IA</Title>
      </MainHeader>
      <div className={classes.wrap}>
        <Keys />
        <div style={{ minHeight: 360, display: "flex", flexDirection: "column" }}>
          <CrudPage
            embedded
            title="Agentes"
            endpoint="/ai-agents"
            addLabel="Novo agente"
            dialogWidth="md"
            emptyText="Nenhum agente. Um agente responde automaticamente aos clientes e repassa para um humano quando necessário."
            fields={[
              { name: "name", label: "Nome", required: true },
              {
                name: "provider",
                label: "Provedor",
                type: "select",
                required: true,
                default: "anthropic",
                options: [
                  { value: "anthropic", label: "Anthropic (Claude)" },
                  { value: "openai", label: "OpenAI" },
                ],
              },
              {
                name: "model",
                label: "Modelo",
                required: true,
                default: MODELS.anthropic,
                helper: "Ex.: claude-sonnet-5-5, claude-haiku-5-5, gpt-4o-mini",
              },
              { name: "apiKey", label: "API key própria (opcional)", type: "password", helper: "Vazio = usa a chave padrão acima." },
              {
                name: "systemPrompt",
                label: "Instruções do agente (personalidade e regras)",
                type: "textarea",
                rows: 5,
                default:
                  "Você é o assistente virtual da empresa. Seja cordial, objetivo e responda no idioma do cliente.",
              },
              {
                name: "knowledgeBase",
                label: "Base de conhecimento (FAQ, preços, horários, políticas…)",
                type: "textarea",
                rows: 8,
              },
              {
                name: "handoffMessage",
                label: "Mensagem ao transferir para humano",
                default: "Vou transferir você para um de nossos atendentes. Um momento, por favor.",
              },
              { name: "maxHistory", label: "Mensagens de contexto", type: "number", default: 12 },
              {
                name: "queueId",
                label: "Atende somente a fila",
                type: "select",
                options: queues.map((q) => ({ value: q.id, label: q.name })),
              },
              {
                name: "whatsappId",
                label: "Atende somente a conexão",
                type: "select",
                helper: "Fila e conexão vazias = atende todos os atendimentos sem atendente.",
                options: connections.map((c) => ({ value: c.id, label: c.name })),
              },
              { name: "active", label: "Ativo", type: "switch", default: true },
            ]}
            columns={[
              { header: "Nome", field: "name" },
              { header: "Modelo", render: (r) => `${r.provider} · ${r.model}` },
              { header: "Escopo", render: (r) => (r.queueId ? `Fila #${r.queueId}` : r.whatsappId ? `Conexão #${r.whatsappId}` : "Todos") },
              { header: "Ativo", render: (r) => (r.active ? "Sim" : "Não") },
            ]}
          />
        </div>
      </div>
    </MainContainer>
  );
};

export default AiAgents;
