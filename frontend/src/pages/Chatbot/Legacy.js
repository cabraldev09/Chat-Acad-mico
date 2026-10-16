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
import { Play } from "lucide-react";
import Simulator from "./LegacySimulator";
import IconAction from "../../components/IconAction";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import ConfirmationModal from "../../components/ConfirmationModal";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { fetchAllUsersPage } from "../../utils/fetchAllUsers";

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
  { value: "ask", label: "Fazer uma pergunta e guardar a resposta" },
  { value: "polo", label: "Perguntar o polo e enviar à equipe dele" },
  { value: "stage", label: "Mover o lead de etapa no funil" },
  { value: "tag", label: "Marcar o lead com uma etiqueta" },
  { value: "webhook", label: "Avisar outro sistema (webhook)" },
];

// actions that do not end the flow: the first option below them runs next
const SEQUENCE = ["ask", "polo", "stage", "tag", "webhook"];
const FIELDS = [
  { value: "nome", label: "Nome" },
  { value: "email", label: "E-mail" },
  { value: "cidade", label: "Cidade" },
  { value: "curso", label: "Curso de interesse" },
  { value: "modalidade", label: "Modalidade" },
  { value: "forma_ingresso", label: "Forma de ingresso" },
  { value: "semestre_transferencia", label: "Semestre (transferência)" },
];

const emptyNode = { title: "", action: "message", message: "", keywords: "", targetId: "", field: "", position: 0 };

const Chatbot = () => {
  const classes = useStyles();
  const [scope, setScope] = useState("shared");
  const [connections, setConnections] = useState([]);
  const [queues, setQueues] = useState([]);
  const [users, setUsers] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [stages, setStages] = useState([]);
  const [tags, setTags] = useState([]);
  const [polos, setPolos] = useState([]);
  const [simulating, setSimulating] = useState(false);
  const [dialog, setDialog] = useState(null); // {node, parentId}
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    api.get("/whatsapp").then(({ data }) => setConnections(data));
    api.get("/queue").then(({ data }) => setQueues(data));
    fetchAllUsersPage().then(({ data }) => setUsers(data.users || []));
    api.get("/lead-stages").then(({ data }) => setStages(data)).catch(() => {});
    api.get("/tags").then(({ data }) => setTags(data)).catch(() => {});
    api.get("/polos").then(({ data }) => setPolos(data.filter((p) => p.active))).catch(() => {});
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
    if (["queue", "user", "stage", "tag"].includes(node.action) && !node.targetId) return toast.error("Escolha o destino");
    if (node.action === "webhook" && !/^https?:\/\//.test(node.field || "")) return toast.error("Informe o endereço (https://…) que receberá o aviso");
    if (node.action === "ask" && !node.field) return toast.error("Escolha onde guardar a resposta");
    const payload = {
      ...node,
      parentId: parentId || null,
      whatsappId: scope === "shared" ? null : Number(scope),
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
    if (n.action === "stage") return stages.find((s) => s.id === n.targetId)?.name;
    if (n.action === "tag") return tags.find((t) => t.id === n.targetId)?.name;
    if (n.action === "ask") return `guarda em: ${FIELDS.find((x) => x.value === n.field)?.label || "?"}`;
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
            {(n.action === "menu" || SEQUENCE.includes(n.action)) && (
              <IconAction title={n.action === "menu" ? "Adicionar opção filha" : "Adicionar o próximo passo"} onClick={() => setDialog({ node: { ...emptyNode, position: childrenOf(n.id).length + 1 }, parentId: n.id })}>
                <AddCircleOutline />
              </IconAction>
            )}
            <IconAction title="Editar" onClick={() => setDialog({ node: { ...emptyNode, ...n, targetId: n.targetId || "", keywords: n.keywords || "", message: n.message || "", field: n.field || "" }, parentId: n.parentId })}>
              <Edit />
            </IconAction>
            <IconAction title="Remover" onClick={() => setDeleting(n)}>
              <DeleteOutline />
            </IconAction>
          </div>
          {n.message && (
            <Typography variant="caption" color="textSecondary" display="block">
              “{n.message.length > 90 ? `${n.message.slice(0, 90)}…` : n.message}”
            </Typography>
          )}
        </div>
        {(n.action === "menu" || SEQUENCE.includes(n.action)) && <div className={classes.children}>{renderNodes(n.id, depth + 1)}</div>}
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
      <Simulator open={simulating} onClose={() => setSimulating(false)} nodes={nodes} queues={queues} polos={polos} greeting={null} />
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
            {f.action === "stage" && (
              <TextField fullWidth select variant="outlined" margin="dense" label="Etapa" value={f.targetId} onChange={(e) => setF({ targetId: e.target.value })}>
                {stages.map((s) => (<MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>))}
              </TextField>
            )}
            {f.action === "tag" && (
              <TextField fullWidth select variant="outlined" margin="dense" label="Etiqueta" value={f.targetId} onChange={(e) => setF({ targetId: e.target.value })}>
                {tags.map((t) => (<MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>))}
              </TextField>
            )}
            {f.action === "ask" && (
              <TextField fullWidth select variant="outlined" margin="dense" label="Guardar a resposta em" value={f.field} onChange={(e) => setF({ field: e.target.value })} helperText="A resposta vai para o cadastro do lead. O próximo passo é a primeira opção abaixo desta.">
                {FIELDS.map((x) => (<MenuItem key={x.value} value={x.value}>{x.label}</MenuItem>))}
              </TextField>
            )}
            {f.action === "webhook" && (
              <TextField fullWidth variant="outlined" margin="dense" label="Endereço que recebe o aviso (https://…)" value={f.field} onChange={(e) => setF({ field: e.target.value })} helperText="Recebe os dados coletados na conversa. Só endereços públicos." />
            )}
            {true ? (
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
            <MenuItem value="shared">Todas as conexões</MenuItem>
            {connections.map((c) => (<MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>))}
          </TextField>
          <Button variant="outlined" color="primary" startIcon={<Play size={15} />} onClick={() => setSimulating(true)}>Testar o fluxo</Button>
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
