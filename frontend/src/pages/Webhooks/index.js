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
  Checkbox,
  Chip,
  FormControlLabel,
  MenuItem,
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
import { publicApiBase } from "../../utils/publicApiBase";
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

// API v1 tokens (docs/API-V1.md): each one with the scopes it needs, optionally limited to some polos, with a validity. The token is shown
// what a token was used for (the routes it called, most used first): which integration depends on it, before replacing an old one
export const usageText = (usage) => {
  const routes = usage && usage.routes ? Object.entries(usage.routes) : [];
  return routes.sort((a, b) => b[1].count - a[1].count).slice(0, 4).map(([route, u]) => `${route} (${u.count}×)`).join(", ");
};

// once, when created; afterwards only its first characters. The ones made before the scopes existed keep full access and say "antigo".
const EXPIRY_OPTIONS = [30, 90, 180, 365];
const day = (d) => (d ? format(parseISO(d), "dd/MM/yy") : "—");

const ApiTokens = () => {
  const classes = useStyles();
  const [tokens, setTokens] = useState(null);
  const [failed, setFailed] = useState(false);
  const [scopes, setScopes] = useState([]);
  const [polos, setPolos] = useState([]);
  const [name, setName] = useState("");
  const [chosen, setChosen] = useState([]);
  const [poloIds, setPoloIds] = useState([]);
  const [days, setDays] = useState(90);
  const [created, setCreated] = useState(null);

  const load = async () => {
    setFailed(false);
    try {
      const { data } = await api.get("/api-tokens");
      setTokens(Array.isArray(data) ? data : []);
    } catch (err) {
      setFailed(true);
      toastError(err);
    }
  };
  useEffect(() => {
    load();
    api.get("/api-tokens/scopes").then(({ data }) => setScopes(Array.isArray(data) ? data : [])).catch(() => setScopes([]));
    api.get("/polos").then(({ data }) => setPolos(Array.isArray(data) ? data : [])).catch(() => setPolos([]));
  }, []);

  const toggle = (key) => setChosen((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]));
  const labelOf = (key) => (key === "*" ? "Acesso total" : (scopes.find((x) => x.key === key) || {}).label || key);
  const poloName = (id) => (polos.find((p) => p.id === id) || {}).name || `Polo ${id}`;

  const create = async () => {
    if (!name.trim()) return toast.error("Dê um nome ao token");
    if (!chosen.length) return toast.error("Escolha o que o token pode fazer");
    try {
      const { data } = await api.post("/api-tokens", { name, scopes: chosen, poloIds, expiresInDays: days });
      setCreated(data);
      setName("");
      setChosen([]);
      setPoloIds([]);
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

  // the public domain of the API, never the address of the server (utils/publicApiBase)
  const base = publicApiBase(getBackendUrl());

  return (
    <Paper className={classes.paper} variant="outlined">
      <Typography variant="h6">Tokens de API</Typography>
      <Typography variant="body2" color="textSecondary" gutterBottom>
        Use um token no cabeçalho <b>Authorization: Bearer &lt;token&gt;</b>. Dê a cada integração só o que ela precisa. O token completo só
        aparece uma vez, na criação; o sistema guarda apenas uma assinatura dele.
      </Typography>
      <div style={{ display: "flex", gap: 8, margin: "8px 0", flexWrap: "wrap", alignItems: "flex-start" }}>
        <TextField size="small" variant="outlined" label="Nome (ex: CRM)" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: "1 1 200px", maxWidth: 320 }} />
        <TextField size="small" variant="outlined" select label="Validade" value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 140 }}>
          {EXPIRY_OPTIONS.map((d) => <MenuItem key={d} value={d}>{d} dias</MenuItem>)}
        </TextField>
        <TextField size="small" variant="outlined" select label="Polos" value={poloIds} style={{ flex: "1 1 200px", maxWidth: 320 }}
          SelectProps={{ multiple: true, renderValue: (v) => (v.length ? v.map(poloName).join(", ") : "Todos os polos"), displayEmpty: true }}
          InputLabelProps={{ shrink: true }}
          onChange={(e) => { const v = e.target.value; setPoloIds(Array.isArray(v) ? v : []); }}>
          {polos.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
        </TextField>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0 16px" }}>
        {scopes.map((sc) => (
          <FormControlLabel key={sc.key} control={<Checkbox size="small" color="primary" checked={chosen.includes(sc.key)} onChange={() => toggle(sc.key)} />} label={sc.label} />
        ))}
      </div>
      <Button variant="contained" color="primary" onClick={create} style={{ marginTop: 4 }}>Gerar token</Button>
      {failed ? (
        <Typography variant="body2" color="error" style={{ marginTop: 12 }}>
          Não foi possível carregar os tokens. <Button size="small" onClick={load}>Tentar de novo</Button>
        </Typography>
      ) : tokens === null ? (
        <Typography variant="body2" color="textSecondary" style={{ marginTop: 12 }}>Carregando…</Typography>
      ) : !tokens.length ? (
        <Typography variant="body2" color="textSecondary" style={{ marginTop: 12 }}>Nenhum token criado.</Typography>
      ) : (
      <div style={{ overflowX: "auto" }}><Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Nome</TableCell>
            <TableCell>Token</TableCell>
            <TableCell>Pode</TableCell>
            <TableCell>Polos</TableCell>
            <TableCell>Validade</TableCell>
            <TableCell>Último uso</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {tokens.map((t) => (
            <TableRow key={t.id}>
              <TableCell>
                {t.name}
                {t.legacy && <Chip size="small" label="antigo" style={{ marginLeft: 6 }} title="Criado antes das permissões: tem acesso total. Recomendado trocar por um token com só o que a integração usa." />}
              </TableCell>
              <TableCell style={{ fontFamily: "monospace" }}>{t.tokenPrefix ? `${t.tokenPrefix}…` : "—"}</TableCell>
              <TableCell>{(t.scopes || []).map(labelOf).join(", ") || "—"}</TableCell>
              <TableCell>{Array.isArray(t.poloIds) ? t.poloIds.map(poloName).join(", ") : "Todos"}</TableCell>
              <TableCell>{t.expiresAt ? (t.expired ? <span style={{ color: "#b91c1c" }}>Venceu em {day(t.expiresAt)}</span> : day(t.expiresAt)) : "Sem validade"}</TableCell>
              <TableCell>
                {t.lastUsedAt ? format(parseISO(t.lastUsedAt), "dd/MM/yy HH:mm") : "—"}
                {usageText(t.usage) && <div style={{ fontSize: 12, opacity: 0.75, maxWidth: 260, overflowWrap: "anywhere" }} title="As rotas que este token chamou: mostram qual integração depende dele.">Usado em: {usageText(t.usage)}</div>}
              </TableCell>
              <TableCell align="right">
                <IconButton aria-label="Excluir" size="small" onClick={() => remove(t.id)}><DeleteOutline /></IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table></div>
      )}
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
          <Typography variant="body2" gutterBottom>Copie agora: ele não será mostrado de novo.</Typography>
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
