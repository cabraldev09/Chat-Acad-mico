import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import {
  Button,
  Paper,
  Typography,
  makeStyles,
  IconButton,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Divider,
} from "@material-ui/core";
import { DeleteOutline } from "@material-ui/icons";
import PlayArrow from "@material-ui/icons/PlayArrow";
import { format, parseISO } from "date-fns";

import CrudPage from "../../components/CrudPage";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import api from "../../services/api";
import { getBackendUrl } from "../../config";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => ({
  wrap: { display: "flex", flexDirection: "column", flex: 1, overflowY: "auto", overflowX: "hidden", gap: theme.spacing(2) },
  paper: { padding: theme.spacing(2) },
  code: {
    fontFamily: "monospace",
    fontSize: 12,
    background: theme.palette.action.hover,
    padding: theme.spacing(1),
    borderRadius: 6,
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
  },
}));

const ApiTokens = () => {
  const classes = useStyles();
  const [tokens, setTokens] = useState([]);
  const [name, setName] = useState("");
  const [created, setCreated] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get("/api-tokens");
      setTokens(data);
    } catch (err) {
      toastError(err);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    if (!name.trim()) return toast.error("Dê um nome ao token");
    try {
      const { data } = await api.post("/api-tokens", { name });
      setCreated(data);
      setName("");
      load();
    } catch (err) {
      toastError(err);
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/api-tokens/${id}`);
      load();
    } catch (err) {
      toastError(err);
    }
  };

  const base = getBackendUrl().replace(/\/$/, "");

  return (
    <Paper className={classes.paper} variant="outlined">
      <Typography variant="h6">Tokens de API</Typography>
      <Typography variant="body2" color="textSecondary" gutterBottom>
        Use um token no cabeçalho <b>Authorization: Bearer &lt;token&gt;</b>. O token completo só aparece uma vez, na criação.
      </Typography>
      <div style={{ display: "flex", gap: 8, margin: "8px 0" }}>
        <TextField size="small" variant="outlined" label="Nome (ex: CRM)" value={name} onChange={(e) => setName(e.target.value)} />
        <Button variant="contained" color="primary" onClick={create}>Gerar token</Button>
      </div>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Nome</TableCell>
            <TableCell>Token</TableCell>
            <TableCell>Último uso</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {tokens.map((t) => (
            <TableRow key={t.id}>
              <TableCell>{t.name}</TableCell>
              <TableCell>{t.token}</TableCell>
              <TableCell>{t.lastUsedAt ? format(parseISO(t.lastUsedAt), "dd/MM/yy HH:mm") : "—"}</TableCell>
              <TableCell align="right">
                <IconButton size="small" onClick={() => remove(t.id)}><DeleteOutline /></IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Divider style={{ margin: "16px 0" }} />
      <Typography variant="subtitle2">Endpoints</Typography>
      <div className={classes.code}>
{`POST ${base}/api/v1/messages/send   {"number":"5511999999999","body":"Olá {{name}}","whatsappId":1}
GET  ${base}/api/v1/tickets?status=open
GET  ${base}/api/v1/contacts?search=maria
POST ${base}/api/v1/contacts          {"name":"Maria","number":"5511999999999","email":"m@x.com"}
GET  ${base}/api/v1/connections`}
      </div>
      <Dialog open={!!created} onClose={() => setCreated(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Token criado</DialogTitle>
        <DialogContent>
          <Typography variant="body2" gutterBottom>Copie agora — não será mostrado novamente.</Typography>
          <div className={classes.code}>{created?.token}</div>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              navigator.clipboard?.writeText(created.token);
              toast.success("Copiado");
            }}
          >
            Copiar
          </Button>
          <Button color="primary" variant="contained" onClick={() => setCreated(null)}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

const Webhooks = () => {
  const classes = useStyles();
  const [events, setEvents] = useState([]);

  useEffect(() => {
    api.get("/webhooks-config/events").then(({ data }) => setEvents(data));
  }, []);

  return (
    <MainContainer>
      <MainHeader>
        <Title>API & Webhooks</Title>
      </MainHeader>
      <div className={classes.wrap}>
        <ApiTokens />
        <div style={{ minHeight: 360, display: "flex", flexDirection: "column" }}>
          <CrudPage
            embedded
            title="Webhooks de saída"
            endpoint="/webhooks-config"
            addLabel="Novo webhook"
            emptyText="Nenhum webhook. Cadastre uma URL para receber eventos em tempo real (integração com CRM, n8n, Zapier…)."
            mapIn={(r) => { let events = []; try { events = JSON.parse(r.events || "[]"); } catch (e) { /* a value saved in another shape */ } return { ...r, events: Array.isArray(events) ? events : [] }; }}
            fields={[
              { name: "name", label: "Nome", required: true },
              { name: "url", label: "URL (https://…)", required: true },
              { name: "secret", label: "Segredo (assina o payload com HMAC SHA-256)", type: "password" },
              {
                name: "events",
                label: "Eventos",
                type: "multiselect",
                default: ["*"],
                options: [{ value: "*", label: "Todos os eventos" }, ...events.map((e) => ({ value: e, label: e }))],
              },
              { name: "active", label: "Ativo", type: "switch", default: true },
            ]}
            columns={[
              { header: "Nome", field: "name" },
              { header: "URL", render: (r) => <span style={{ wordBreak: "break-all" }}>{r.url}</span> },
              {
                header: "Último envio",
                render: (r) =>
                  r.lastAt
                    ? `${format(parseISO(r.lastAt), "dd/MM HH:mm")} · ${r.lastError ? `erro (${r.lastError})` : `HTTP ${r.lastStatus}`}`
                    : "—",
              },
              { header: "Ativo", render: (r) => (r.active ? "Sim" : "Não") },
            ]}
            rowActions={(r, reload) => (
              <IconButton
                size="small"
                title="Enviar evento de teste"
                onClick={async () => {
                  try {
                    const { data } = await api.post(`/webhooks-config/${r.id}/test`);
                    toast.success(`Resposta HTTP ${data.status}`);
                  } catch (err) {
                    toastError(err);
                  }
                  reload();
                }}
              >
                <PlayArrow />
              </IconButton>
            )}
          />
        </div>
      </div>
    </MainContainer>
  );
};

export default Webhooks;
