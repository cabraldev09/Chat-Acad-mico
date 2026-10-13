import React, { useEffect, useState, useCallback } from "react";
import { toast } from "react-toastify";
import {
  Button,
  Paper,
  Typography,
  makeStyles,
  IconButton,
  TextField,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
} from "@material-ui/core";
import { DeleteOutline, Edit } from "@material-ui/icons";
import AddCircleOutline from "@material-ui/icons/AddCircleOutline";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import ConfirmationModal from "../../components/ConfirmationModal";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => ({
  paper: { flex: 1, padding: theme.spacing(2), overflowY: "auto", ...theme.scrollbarStyles },
  node: {
    borderLeft: `3px solid ${theme.palette.primary.main}`,
    margin: theme.spacing(0.75, 0),
    padding: theme.spacing(0.5, 1),
    background: theme.palette.action.hover,
    borderRadius: 4,
  },
  children: { marginLeft: theme.spacing(3) },
  line: { display: "flex", alignItems: "center", gap: theme.spacing(1), flexWrap: "wrap" },
  hint: { opacity: 0.75, marginBottom: theme.spacing(2) },
}));

const ACTIONS = [
  { value: "menu", label: "Submenu (mostra opções filhas)" },
  { value: "message", label: "Responder com texto" },
  { value: "queue", label: "Encaminhar para fila" },
  { value: "user", label: "Encaminhar para atendente" },
  { value: "ai", label: "Passar para o agente de IA" },
  { value: "close", label: "Encerrar atendimento" },
];

const emptyNode = { title: "", action: "message", message: "", keywords: "", targetId: "", position: 0 };

const Chatbot = () => {
  const classes = useStyles();
  const [scope, setScope] = useState("global");
  const [connections, setConnections] = useState([]);
  const [queues, setQueues] = useState([]);
  const [users, setUsers] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [dialog, setDialog] = useState(null); // {node, parentId}
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    api.get("/whatsapp").then(({ data }) => setConnections(data));
    api.get("/queue").then(({ data }) => setQueues(data));
    api.get("/users", { params: { pageNumber: 1 } }).then(({ data }) => setUsers(data.users || []));
  }, []);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/chatbot-nodes", { params: { whatsappId: scope } });
      setNodes(data);
    } catch (err) {
      toastError(err);
    }
  }, [scope]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    const { node, parentId } = dialog;
    if (!node.title.trim()) return toast.error("Informe o texto da opção");
    if (["queue", "user"].includes(node.action) && !node.targetId) return toast.error("Escolha o destino");
    const payload = {
      ...node,
      parentId: parentId || null,
      whatsappId: scope === "global" ? null : Number(scope),
      targetId: node.targetId || null,
    };
    try {
      if (node.id) await api.put(`/chatbot-nodes/${node.id}`, payload);
      else await api.post("/chatbot-nodes", payload);
      setDialog(null);
      load();
    } catch (err) {
      toastError(err);
    }
  };

  const remove = async () => {
    try {
      await api.delete(`/chatbot-nodes/${deleting.id}`);
      load();
    } catch (err) {
      toastError(err);
    }
    setDeleting(null);
  };

  const childrenOf = (parentId) =>
    nodes.filter((n) => (n.parentId || null) === (parentId || null));

  const targetLabel = (n) => {
    if (n.action === "queue") return queues.find((q) => q.id === n.targetId)?.name;
    if (n.action === "user") return users.find((u) => u.id === n.targetId)?.name;
    return null;
  };

  const renderNodes = (parentId, depth = 0) =>
    childrenOf(parentId).map((n, i) => (
      <div key={n.id} className={depth ? undefined : undefined}>
        <div className={classes.node}>
          <div className={classes.line}>
            <b>{i + 1}.</b>
            <span>{n.title}</span>
            <Chip size="small" label={ACTIONS.find((a) => a.value === n.action)?.label.split(" (")[0]} />
            {targetLabel(n) && <Chip size="small" color="primary" variant="outlined" label={targetLabel(n)} />}
            <span style={{ flex: 1 }} />
            {n.action === "menu" && (
              <IconButton size="small" title="Adicionar opção filha" onClick={() => setDialog({ node: { ...emptyNode, position: childrenOf(n.id).length + 1 }, parentId: n.id })}>
                <AddCircleOutline />
              </IconButton>
            )}
            <IconButton size="small" onClick={() => setDialog({ node: { ...emptyNode, ...n, targetId: n.targetId || "", keywords: n.keywords || "", message: n.message || "" }, parentId: n.parentId })}>
              <Edit />
            </IconButton>
            <IconButton size="small" onClick={() => setDeleting(n)}>
              <DeleteOutline />
            </IconButton>
          </div>
          {n.message && (
            <Typography variant="caption" color="textSecondary" display="block">
              “{n.message.length > 90 ? `${n.message.slice(0, 90)}…` : n.message}”
            </Typography>
          )}
        </div>
        {n.action === "menu" && <div className={classes.children}>{renderNodes(n.id, depth + 1)}</div>}
      </div>
    ));

  const f = dialog?.node;
  const setF = (patch) => setDialog({ ...dialog, node: { ...dialog.node, ...patch } });

  return (
    <MainContainer>
      <ConfirmationModal
        title={deleting ? `Remover "${deleting.title}"?` : ""}
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
      >
        As opções filhas também serão removidas.
      </ConfirmationModal>
      <Dialog open={!!dialog} onClose={() => setDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{f?.id ? "Editar opção" : "Nova opção"}</DialogTitle>
        {f && (
          <DialogContent dividers>
            <TextField fullWidth variant="outlined" margin="dense" label="Texto da opção (aparece no menu)" value={f.title} onChange={(e) => setF({ title: e.target.value })} />
            <TextField fullWidth select variant="outlined" margin="dense" label="O que fazer ao escolher" value={f.action} onChange={(e) => setF({ action: e.target.value, targetId: "" })}>
              {ACTIONS.map((a) => (
                <MenuItem key={a.value} value={a.value}>{a.label}</MenuItem>
              ))}
            </TextField>
            {f.action === "queue" && (
              <TextField fullWidth select variant="outlined" margin="dense" label="Fila" value={f.targetId} onChange={(e) => setF({ targetId: e.target.value })}>
                {queues.map((q) => (<MenuItem key={q.id} value={q.id}>{q.name}</MenuItem>))}
              </TextField>
            )}
            {f.action === "user" && (
              <TextField fullWidth select variant="outlined" margin="dense" label="Atendente" value={f.targetId} onChange={(e) => setF({ targetId: e.target.value })}>
                {users.map((u) => (<MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>))}
              </TextField>
            )}
            {f.action !== "close" || true ? (
              <TextField
                fullWidth
                multiline
                rows={4}
                variant="outlined"
                margin="dense"
                label={f.action === "menu" ? "Texto acima das opções do submenu" : "Mensagem enviada ao cliente"}
                helperText="Use {{name}} para o nome do cliente."
                value={f.message}
                onChange={(e) => setF({ message: e.target.value })}
              />
            ) : null}
            <TextField fullWidth variant="outlined" margin="dense" label="Palavras-chave (separadas por vírgula, opcional)" helperText="Além do número, o cliente também pode digitar uma dessas palavras." value={f.keywords} onChange={(e) => setF({ keywords: e.target.value })} />
            <TextField fullWidth type="number" variant="outlined" margin="dense" label="Ordem" value={f.position} onChange={(e) => setF({ position: Number(e.target.value) })} />
          </DialogContent>
        )}
        <DialogActions>
          <Button onClick={() => setDialog(null)} color="secondary" variant="outlined">Cancelar</Button>
          <Button onClick={save} color="primary" variant="contained">Salvar</Button>
        </DialogActions>
      </Dialog>

      <MainHeader>
        <Title>Chatbot (fluxo de atendimento)</Title>
        <MainHeaderButtonsWrapper>
          <TextField select size="small" variant="outlined" label="Fluxo de" value={scope} onChange={(e) => setScope(e.target.value)} style={{ minWidth: 200 }}>
            <MenuItem value="global">Todas as conexões</MenuItem>
            {connections.map((c) => (<MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>))}
          </TextField>
          <Button variant="contained" color="primary" onClick={() => setDialog({ node: { ...emptyNode, position: childrenOf(null).length + 1 }, parentId: null })}>
            Nova opção no menu
          </Button>
        </MainHeaderButtonsWrapper>
      </MainHeader>
      <Paper className={classes.paper} variant="outlined">
        <Typography variant="body2" className={classes.hint}>
          Quando o cliente escreve pela primeira vez, o bot envia a mensagem de saudação da conexão seguida deste menu.
          O cliente responde com o número da opção (ou uma palavra-chave) e o bot executa a ação. Digite <b>0</b> para voltar nos submenus.
          Um fluxo específico de uma conexão vale junto com o fluxo geral.
        </Typography>
        {nodes.length === 0 ? (
          <Typography align="center" color="textSecondary" style={{ padding: 32 }}>
            Nenhuma opção ainda. Clique em “Nova opção no menu”.
          </Typography>
        ) : (
          renderNodes(null)
        )}
      </Paper>
    </MainContainer>
  );
};

export default Chatbot;
