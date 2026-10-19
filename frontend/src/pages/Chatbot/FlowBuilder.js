import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useHistory, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import ReactFlow, { Background, Controls, MiniMap, ReactFlowProvider, MarkerType } from "react-flow-renderer";
import "react-flow-renderer/dist/style.css";
import "react-flow-renderer/dist/theme-default.css";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Menu, MenuItem, Tab, Tabs, TextField, Tooltip, makeStyles, useMediaQuery, useTheme } from "@material-ui/core";
import { AlertTriangle, ArrowLeft, BarChart3, Bot, CheckCircle2, History, LayoutTemplate, PanelRight, Play, Plus, Rocket, Save, Settings2, Wand2 } from "lucide-react";

import { AuthContext } from "../../context/Auth/AuthContext";
import { WhatsAppsContext } from "../../context/WhatsApp/WhatsAppsContext";
import { isManager } from "../../utils/access";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import Inspector from "./Inspector";
import Simulator from "./Simulator";
import { BLOCKS, defaultData, newId, nodeTypes, paletteFor } from "./nodes";
import { fetchAllUsersPage } from "../../utils/fetchAllUsers";

const useStyles = makeStyles((theme) => ({
  // fills what is left of the screen under the top bar (the layout makes the page a column, see .page-fill)
  page: { display: "flex", flexDirection: "column", minHeight: 440, minWidth: 0, background: theme.palette.background.default },
  bar: { display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", flexWrap: "wrap", flex: "none", borderBottom: theme.border.divider, background: theme.palette.cards.background },
  body: { flex: 1, display: "flex", minHeight: 0, minWidth: 0, position: "relative", overflow: "hidden" },
  palette: { width: "clamp(150px, 14vw, 190px)", flexShrink: 0, overflowY: "auto", padding: 12, borderRight: theme.border.divider, background: theme.palette.cards.background, [theme.breakpoints.down("sm")]: { display: "none" } },
  onlyNarrow: { display: "none", [theme.breakpoints.down("sm")]: { display: "inline-flex" } },
  tab: { minWidth: 0, padding: "6px 6px", fontSize: 13 },
  group: { fontSize: 11.5, fontWeight: 700, color: theme.palette.text.secondary, margin: "12px 0 6px", textTransform: "uppercase", letterSpacing: ".04em", "&:first-child": { marginTop: 0 } },
  item: { display: "flex", alignItems: "center", gap: 8, padding: "7px 9px", borderRadius: 10, marginBottom: 5, cursor: "grab", border: theme.border.divider, background: theme.palette.background.default, fontSize: 13, fontWeight: 600, "&:hover": { borderColor: theme.palette.primary.main } },
  icon: { width: 24, height: 24, borderRadius: 7, display: "grid", placeItems: "center", color: "#fff", flexShrink: 0 },
  canvas: { flex: 1, minWidth: 0, position: "relative", overflow: "hidden" },
  side: {
    width: "clamp(300px, 26vw, 400px)", flexShrink: 0, display: "flex", flexDirection: "column", borderLeft: theme.border.divider, background: theme.palette.cards.background, minHeight: 0, minWidth: 0,
    // on a narrow window the panel slides over the drawing instead of squeezing it
    [theme.breakpoints.down("sm")]: { position: "absolute", top: 0, right: 0, bottom: 0, width: "min(340px, 92vw)", zIndex: 5, boxShadow: "-10px 0 28px rgba(0,0,0,.22)" },
  },
  sideBody: { flex: 1, overflowY: "auto", minHeight: 0 },
  chip: { display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 999, padding: "3px 10px", fontSize: 12.5, fontWeight: 700 },
  issue: { display: "flex", gap: 8, padding: "9px 14px", borderBottom: theme.border.divider, fontSize: 13.5, lineHeight: 1.4, cursor: "pointer", "&:hover": { background: theme.palette.action.hover } },
}));

const ENTRY_LABEL = { first_message: "Primeira mensagem", keyword: "Palavra-chave", any: "Qualquer primeira mensagem", manual: "Só por gatilho" };

const toFlowNodes = (graph) => graph.nodes.map((n) => ({ id: n.id, type: n.type, position: { x: n.x || 0, y: n.y || 0 }, data: n.data || {}, deletable: n.type !== "start" }));
const toFlowEdges = (graph) => graph.edges.map((e) => ({ id: e.id || newId("e"), source: e.source, target: e.target, sourceHandle: e.sourceHandle || null, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed } }));
const clean = (data) => Object.keys(data).filter((k) => !k.startsWith("__")).reduce((o, k) => ({ ...o, [k]: data[k] }), {});
const toApi = (nodes, edges) => ({
  nodes: nodes.map((n) => ({ id: n.id, type: n.type, x: Math.round(n.position.x), y: Math.round(n.position.y), data: clean(n.data) })),
  edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle || null })),
});

// puts the blocks in columns by distance from the start
const arrange = (nodes, edges) => {
  const depth = new Map();
  const start = nodes.find((n) => n.type === "start") || nodes[0];
  if (start) {
    const queue = [start.id];
    depth.set(start.id, 0);
    while (queue.length) {
      const id = queue.shift();
      edges.filter((e) => e.source === id).forEach((e) => { if (!depth.has(e.target)) { depth.set(e.target, depth.get(id) + 1); queue.push(e.target); } });
    }
  }
  const rows = {};
  return nodes.map((n) => {
    const col = depth.has(n.id) ? depth.get(n.id) : Math.max(0, ...depth.values()) + 1;
    rows[col] = (rows[col] || 0) + 1;
    return { ...n, position: { x: 60 + col * 340, y: 60 + (rows[col] - 1) * 240 } };
  });
};

const EntryDialog = ({ open, onClose, flow, onSave, connections }) => {
  const [e, setE] = useState({ type: "first_message", keywords: "" });
  const [whatsappId, setWhatsappId] = useState("");
  useEffect(() => {
    if (open && flow) { setE({ type: flow.entry.type, keywords: (flow.entry.keywords || []).join(", ") }); setWhatsappId(flow.whatsappId || ""); }
  }, [open, flow]);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Quando este fluxo começa</DialogTitle>
      <DialogContent>
        <TextField select fullWidth size="small" variant="outlined" margin="dense" label="Começa" value={e.type} onChange={(ev) => setE({ ...e, type: ev.target.value })}>
          <MenuItem value="first_message">Na primeira mensagem da conversa</MenuItem>
          <MenuItem value="keyword">Quando a pessoa escreve uma palavra-chave</MenuItem>
          <MenuItem value="manual">Só quando um gatilho chamar</MenuItem>
        </TextField>
        {e.type === "keyword" && (
          <TextField fullWidth size="small" variant="outlined" margin="dense" label="Palavras-chave" value={e.keywords} onChange={(ev) => setE({ ...e, keywords: ev.target.value })} placeholder="bolsa, desconto, valor" helperText="Separe por vírgula. Vale quando a mensagem contém uma delas." />
        )}
        <TextField select fullWidth size="small" variant="outlined" margin="dense" label="Conexão" value={whatsappId} onChange={(ev) => setWhatsappId(ev.target.value)}>
          <MenuItem value="">Todas as conexões</MenuItem>
          {connections.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
        </TextField>
        <div style={{ fontSize: 12.5, opacity: 0.75, marginTop: 8 }}>Só um fluxo publicado atende cada conversa. Uma palavra-chave tem prioridade sobre a primeira mensagem. Quando nenhum fluxo vale, o menu antigo e o agente de IA continuam como antes.</div>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="contained" color="primary" onClick={() => onSave({ entry: { type: e.type, keywords: e.keywords.split(",").map((k) => k.trim()).filter(Boolean) }, whatsappId: whatsappId || null })}>Salvar</Button>
      </DialogActions>
    </Dialog>
  );
};

// the versions that were published: look at any of them and bring it back as the draft
const VersionsDialog = ({ open, onClose, flowId, onRestored }) => {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!open) return;
    setRows(null);
    api.get(`/flows/${flowId}/versions`).then(({ data }) => setRows(data)).catch((e) => { toastError(e); setRows([]); });
  }, [open, flowId]);
  const restore = async (v) => {
    if (!window.confirm(`Trazer a versão ${v.version} de volta como rascunho? O rascunho atual será substituído; nada muda para as pessoas até você publicar.`)) return;
    try { const { data } = await api.post(`/flows/${flowId}/versions/${v.id}/restore`, {}); toast.success(`Versão ${v.version} restaurada como rascunho.`); onRestored(data); } catch (e) { toastError(e); }
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Versões publicadas</DialogTitle>
      <DialogContent>
        {!rows && <div style={{ padding: 8 }}>Carregando...</div>}
        {rows && rows.length === 0 && <div style={{ opacity: 0.75, fontSize: 14 }}>Ainda não há versões. Cada vez que você publica, a versão fica guardada aqui e dá para voltar a ela.</div>}
        {(rows || []).map((v) => (
          <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid rgba(127,140,160,.25)" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>Versão {v.version}{v.current ? " · em uso" : ""}</div>
              <div style={{ fontSize: 12.5, opacity: 0.75 }}>{new Date(v.createdAt).toLocaleString("pt-BR")}{v.note ? ` · ${v.note}` : ""}{v.blocks ? ` · ${v.blocks} blocos` : ""}</div>
            </div>
            {!v.current && <Button size="small" variant="outlined" onClick={() => restore(v)}>Restaurar</Button>}
          </div>
        ))}
      </DialogContent>
      <DialogActions><Button variant="outlined" color="secondary" onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
};

const Builder = () => {
  const classes = useStyles();
  const { id } = useParams();
  const history = useHistory();
  const { user } = useContext(AuthContext);
  const { whatsApps } = useContext(WhatsAppsContext);
  const [flow, setFlow] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selected, setSelected] = useState(null);
  const [issues, setIssues] = useState([]);
  const [tab, setTab] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState(null);
  const [showStats, setShowStats] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const [path, setPath] = useState([]);
  const [lists, setLists] = useState({ stages: [], tags: [], queues: [], users: [], polos: [], agents: [], flows: [], funnel: {} });
  const [versionsOpen, setVersionsOpen] = useState(false);
  const wrapper = useRef(null);
  const [rf, setRf] = useState(null);
  const manager = isManager(user);
  // narrow window: no palette column, blocks come from a menu, and the panel slides over the drawing
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down("sm"));
  const [sideOpen, setSideOpen] = useState(false);
  const [blockMenu, setBlockMenu] = useState(null);

  const apply = useCallback((f) => {
    setFlow(f);
    setNodes(toFlowNodes(f.graph));
    setEdges(toFlowEdges(f.graph));
    setIssues(f.issues || []);
    setDirty(false);
  }, []);

  useEffect(() => {
    api.get(`/flows/${id}`).then(({ data }) => apply(data)).catch((e) => { toastError(e); history.replace(history.location.pathname.startsWith("/ai-agents") ? "/ai-agents" : "/chatbot"); });
    api.get("/ai-agents").then(({ data }) => setLists((l) => ({ ...l, agents: Array.isArray(data) ? data : [] }))).catch(() => undefined);
    api.get("/flows").then(({ data }) => setLists((l) => ({ ...l, flows: Array.isArray(data) ? data : [] }))).catch(() => undefined);
    api.get("/crm-funnel").then(({ data }) => setLists((l) => ({ ...l, funnel: data.keys.reduce((o, k) => ({ ...o, [k.key]: (data.stages.find((s) => s.id === k.stageId) || {}).name || "" }), {}) }))).catch(() => undefined);
    api.get("/lead-stages").then(({ data }) => setLists((l) => ({ ...l, stages: data }))).catch(() => undefined);
    api.get("/tags").then(({ data }) => setLists((l) => ({ ...l, tags: Array.isArray(data) ? data : data.tags || [] }))).catch(() => undefined);
    api.get("/queue").then(({ data }) => setLists((l) => ({ ...l, queues: data }))).catch(() => undefined);
    fetchAllUsersPage().then(({ data }) => setLists((l) => ({ ...l, users: data.users || [] }))).catch(() => undefined);
    api.get("/polos").then(({ data }) => setLists((l) => ({ ...l, polos: Array.isArray(data) ? data : data.polos || [] }))).catch(() => undefined);
  }, [id, apply, history]);

  const graphNow = useCallback(() => toApi(nodes, edges), [nodes, edges]);

  // problems are re-checked a moment after every change
  useEffect(() => {
    if (!flow || !dirty) return undefined;
    const t = setTimeout(() => { api.post(`/flows/${id}/validate`, { graph: graphNow() }).then(({ data }) => setIssues(data.issues)).catch(() => undefined); }, 700);
    return () => clearTimeout(t);
  }, [nodes, edges, dirty, flow, id, graphNow]);

  useEffect(() => {
    if (!showStats) return;
    api.get(`/flows/${id}/stats`).then(({ data }) => setStats(data)).catch(() => undefined);
  }, [showStats, id]);

  const issueOf = useMemo(() => {
    const m = {};
    issues.forEach((i) => { if (i.nodeId) m[i.nodeId] = i.level === "error" || m[i.nodeId] === "error" ? "error" : "warning"; });
    return m;
  }, [issues]);
  const shownNodes = useMemo(() => nodes.map((n) => ({
    ...n,
    data: { ...n.data, __issue: issueOf[n.id], __active: path.includes(n.id), __stat: showStats && stats ? stats.nodes[n.id] : undefined },
  })), [nodes, issueOf, path, showStats, stats]);

  const change = (fn) => { fn(); setDirty(true); };
  const onNodesChange = useCallback((changes) => {
    setNodes((ns) => {
      let next = ns;
      changes.forEach((c) => {
        if (c.type === "position" && c.position) next = next.map((n) => (n.id === c.id ? { ...n, position: c.position } : n));
        if (c.type === "remove") next = next.filter((n) => n.id !== c.id);
        if (c.type === "select") { if (c.selected) { setSelected(c.id); setSideOpen(true); } else setSelected((cur) => (cur === c.id ? null : cur)); }
      });
      return next;
    });
    if (changes.some((c) => c.type === "position" && c.dragging === false) || changes.some((c) => c.type === "remove")) setDirty(true);
  }, []);
  const onEdgesChange = useCallback((changes) => {
    if (changes.some((c) => c.type === "remove")) {
      setEdges((es) => es.filter((e) => !changes.some((c) => c.type === "remove" && c.id === e.id)));
      setDirty(true);
    }
  }, []);
  const onConnect = useCallback((c) => {
    setEdges((es) => [
      // one way out per exit: connecting it again replaces the old link
      ...es.filter((e) => !(e.source === c.source && (e.sourceHandle || null) === (c.sourceHandle || null))),
      { id: newId("e"), source: c.source, target: c.target, sourceHandle: c.sourceHandle || null, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed } },
    ]);
    setDirty(true);
  }, []);

  const addBlock = (type, position) => {
    const at = position || (rf ? rf.project({ x: (wrapper.current ? wrapper.current.clientWidth : 600) / 2, y: 200 }) : { x: 200, y: 200 });
    const nid = newId("n");
    change(() => setNodes((ns) => [...ns, { id: nid, type, position: at, data: defaultData(type) }]));
    setSelected(nid);
    setTab(0);
    setSideOpen(true);
  };
  const onDrop = (e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("application/flowblock");
    if (!type || !rf || !wrapper.current) return;
    const rect = wrapper.current.getBoundingClientRect();
    addBlock(type, rf.project({ x: e.clientX - rect.left - 120, y: e.clientY - rect.top - 20 }));
  };

  const updateNode = (nid, patch) => change(() => setNodes((ns) => ns.map((n) => (n.id === nid ? { ...n, data: { ...n.data, ...patch } } : n))));
  const removeNode = (nid) => change(() => {
    setNodes((ns) => ns.filter((n) => n.id !== nid));
    setEdges((es) => es.filter((e) => e.source !== nid && e.target !== nid));
    setSelected(null);
  });

  const save = async (quiet) => {
    setBusy(true);
    try {
      const { data } = await api.put(`/flows/${id}`, { graph: graphNow(), name: flow.name });
      setFlow((f) => ({ ...f, ...data, graph: undefined }));
      setIssues(data.issues);
      setDirty(false);
      if (!quiet) toast.success("Rascunho salvo.");
      return data;
    } catch (e) { toastError(e); return null; } finally { setBusy(false); }
  };
  const publish = async () => {
    const saved = await save(true);
    if (!saved) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/flows/${id}/publish`, {});
      setFlow((f) => ({ ...f, ...data, graph: undefined }));
      setIssues(data.issues);
      toast.success("Publicado! Os próximos atendimentos já usam este fluxo.");
    } catch (e) {
      if (e.response && e.response.data && e.response.data.issues) { setIssues(e.response.data.issues); setTab(1); toast.error("O fluxo tem erros. Veja a aba Problemas."); } else toastError(e);
    } finally { setBusy(false); }
  };
  const saveEntry = async (patch) => {
    try {
      const { data } = await api.put(`/flows/${id}`, patch);
      setFlow((f) => ({ ...f, ...data, graph: undefined }));
      setEntryOpen(false);
      toast.success("Salvo.");
    } catch (e) { toastError(e); }
  };
  const kind = flow ? flow.kind || "flow" : "flow";
  const palette = paletteFor(kind);
  const agentOf = flow && flow.agentId ? lists.agents.find((a) => a.id === flow.agentId) : null;
  const back = () => { if (dirty && !window.confirm("Há alterações que não foram salvas. Sair mesmo assim?")) return; history.push(kind === "agent" ? "/ai-agents" : "/chatbot"); };

  if (!flow) return <div style={{ padding: 24 }}>Carregando o fluxo...</div>;
  const sideVisible = !narrow || sideOpen;
  const errors = issues.filter((i) => i.level === "error");
  const picked = nodes.find((n) => n.id === selected) || null;
  const connections = (whatsApps || []).filter((w) => ["whatsapp", "whatsapp_cloud", undefined].includes(w.channel));

  return (
    <div className={`${classes.page} page-grow`}>
      <div className={classes.bar}>
        <Tooltip title={kind === "agent" ? "Voltar para os agentes" : "Voltar para os fluxos"}><IconButton size="small" onClick={back} aria-label="Voltar"><ArrowLeft size={20} /></IconButton></Tooltip>
        <TextField size="small" variant="outlined" value={flow.name} onChange={(e) => { setFlow({ ...flow, name: e.target.value }); setDirty(true); }} style={{ flex: "1 1 160px", maxWidth: 260, minWidth: 140 }} inputProps={{ "aria-label": "Nome do fluxo", style: { fontWeight: 700 } }} />
        <span className={classes.chip} style={{ background: flow.status === "published" ? "rgba(22,163,74,.16)" : "rgba(100,116,139,.18)", color: flow.status === "published" ? "#15803d" : "#475569" }}>
          {flow.status === "published" ? `Publicado v${flow.version}` : "Rascunho"}
        </span>
        {flow.status === "published" && (dirty || flow.changed) && <span className={classes.chip} style={{ background: "rgba(217,119,6,.16)", color: "#b45309" }}>Alterações não publicadas</span>}
        <span style={{ flex: 1 }} />
        {kind === "agent" ? (
          <Tooltip title={agentOf && agentOf.active ? "O agente está ligado e atende com estes blocos depois de publicados." : "O agente está desligado: ligue em Agentes de IA para ele atender."}>
            <span className={classes.chip} style={{ background: agentOf && agentOf.active ? "rgba(22,163,74,.16)" : "rgba(100,116,139,.18)", color: agentOf && agentOf.active ? "#15803d" : "#475569" }}><Bot size={13} /> {agentOf ? `${agentOf.name} · ${agentOf.active ? "ligado" : "desligado"}` : "Agente"}</span>
          </Tooltip>
        ) : (
          <Tooltip title={`Começa: ${ENTRY_LABEL[flow.entry.type]}`}><Button size="small" variant="outlined" startIcon={<Settings2 size={15} />} onClick={() => setEntryOpen(true)}>Quando começa</Button></Tooltip>
        )}
        <Tooltip title="Versões publicadas: ver e restaurar"><Button size="small" variant="outlined" startIcon={<History size={15} />} onClick={() => setVersionsOpen(true)}>Versões</Button></Tooltip>
        <Button size="small" variant="outlined" className={classes.onlyNarrow} startIcon={<Plus size={15} />} onClick={(e) => setBlockMenu(e.currentTarget)}>Bloco</Button>
        <Menu anchorEl={blockMenu} open={Boolean(blockMenu)} onClose={() => setBlockMenu(null)}>
          {palette.map(([group, types]) => [
            <MenuItem key={group} disabled style={{ opacity: 0.7, fontSize: 12, fontWeight: 700, minHeight: 28 }}>{group}</MenuItem>,
            ...types.map((t) => <MenuItem key={t} onClick={() => { setBlockMenu(null); addBlock(t); }}>{BLOCKS[t].title}</MenuItem>),
          ])}
        </Menu>
        <Button size="small" variant="outlined" className={classes.onlyNarrow} startIcon={<PanelRight size={15} />} onClick={() => setSideOpen((v) => !v)}>Painel</Button>
        <Button size="small" variant="outlined" startIcon={<LayoutTemplate size={15} />} onClick={() => { setNodes((ns) => arrange(ns, edges)); setDirty(true); setTimeout(() => rf && rf.setViewport({ x: 40, y: 70, zoom: 0.85 }), 50); }}>Organizar</Button>
        <Button size="small" variant={showStats ? "contained" : "outlined"} startIcon={<BarChart3 size={15} />} onClick={() => setShowStats((v) => !v)}>Números</Button>
        <Button size="small" variant="outlined" startIcon={<Play size={15} />} onClick={() => { setTab(2); setSideOpen(true); }}>Testar</Button>
        <Button size="small" variant="outlined" startIcon={<Save size={15} />} onClick={() => save()} disabled={busy || !dirty}>Salvar rascunho</Button>
        {manager && <Button size="small" variant="contained" color="primary" startIcon={<Rocket size={15} />} onClick={publish} disabled={busy}>{flow.status === "published" ? "Publicar alterações" : "Publicar"}</Button>}
      </div>
      <div className={classes.body}>
        <div className={classes.palette}>
          {palette.map(([group, types]) => (
            <div key={group}>
              <div className={classes.group}>{group}</div>
              {types.map((t) => {
                const b = BLOCKS[t];
                const Icon = b.icon;
                return (
                  <div key={t} className={classes.item} draggable onDragStart={(e) => { e.dataTransfer.setData("application/flowblock", t); e.dataTransfer.effectAllowed = "move"; }} onClick={() => addBlock(t)} title={`${b.hint} Arraste para o quadro ou clique.`}>
                    <span className={classes.icon} style={{ background: b.color }}><Icon size={14} /></span>{b.title}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className={classes.canvas} ref={wrapper} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }} onDrop={onDrop}>
          <ReactFlow
            nodes={shownNodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onInit={(inst) => { setRf(inst); // starts readable, at the start block; the controls fit the whole flow
              inst.setViewport({ x: 40, y: 70, zoom: 0.85 }); }} minZoom={0.2} maxZoom={1.6} deleteKeyCode={["Backspace", "Delete"]}
            onPaneClick={() => setSelected(null)} defaultEdgeOptions={{ type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed } }}
          >
            <Background gap={22} size={1.4} color="rgba(127,140,160,.35)" />
            <Controls showInteractive={false} />
            {!narrow && <MiniMap pannable zoomable nodeColor={(n) => (BLOCKS[n.type] ? BLOCKS[n.type].color : "#999")} style={{ height: 80, width: 120 }} />}
          </ReactFlow>
        </div>
        {sideVisible && <div className={classes.side}>
          <Tabs value={tab} onChange={(e, v) => setTab(v)} variant="fullWidth" indicatorColor="primary" textColor="primary">
            <Tab className={classes.tab} label="Bloco" />
            <Tab className={classes.tab} label={errors.length ? `Problemas (${issues.length})` : issues.length ? `Avisos (${issues.length})` : "Problemas"} />
            <Tab className={classes.tab} label="Testar" />
          </Tabs>
          <div className={classes.sideBody}>
            {tab === 0 && <Inspector node={picked} update={updateNode} remove={removeNode} lists={lists} nodes={nodes} flowId={id} kind={kind} />}
            {tab === 1 && (
              issues.length === 0 ? (
                <div style={{ padding: 16, display: "flex", gap: 8, alignItems: "center", color: "#15803d", fontSize: 14 }}><CheckCircle2 size={20} /> Tudo certo: o fluxo pode ser publicado.</div>
              ) : issues.map((i, k) => (
                <div key={k} className={classes.issue} role="button" tabIndex={0} onClick={() => { if (i.nodeId) { setSelected(i.nodeId); setTab(0); const n = nodes.find((x) => x.id === i.nodeId); if (n && rf) rf.setCenter(n.position.x + 125, n.position.y + 60, { zoom: 1, duration: 300 }); } }}>
                  <AlertTriangle size={17} color={i.level === "error" ? "#dc2626" : "#d97706"} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>{i.text}</span>
                </div>
              ))
            )}
            {tab === 2 && <Simulator flowId={id} kind={kind} getGraph={graphNow} onPath={setPath} onClose={() => { setTab(0); setPath([]); }} />}
          </div>
        </div>}
      </div>
      <VersionsDialog open={versionsOpen} onClose={() => setVersionsOpen(false)} flowId={id} onRestored={(f) => { setVersionsOpen(false); apply(f); setDirty(true); }} />
      <EntryDialog open={entryOpen} onClose={() => setEntryOpen(false)} flow={flow} onSave={saveEntry} connections={connections} />
    </div>
  );
};

const FlowBuilder = () => <ReactFlowProvider><Builder /></ReactFlowProvider>;
export default FlowBuilder;
void Wand2;
