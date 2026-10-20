import React, { useCallback, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { Button, Menu, MenuItem, Switch, Tooltip, makeStyles } from "@material-ui/core";
import { AlertTriangle, ChevronDown, ChevronRight, Filter, GraduationCap, Headphones, Key, Plus, Scale, Sparkles, Trash2, UserCheck, Workflow } from "lucide-react";

import IconAction from "../../components/IconAction";
import ConfirmationModal from "../../components/ConfirmationModal";
import AgentEditor from "./AgentEditor";
import FunnelDialog from "./FunnelDialog";
import HandoffDialog from "./HandoffDialog";
import KeysDialog from "./KeysDialog";
import NewAgentDialog from "./NewAgentDialog";
import RegulationsDialog from "./RegulationsDialog";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => ({
  wrap: { display: "flex", flexDirection: "column", flex: 1, overflowY: "auto", overflowX: "hidden", ...theme.scrollbarStyles, gap: theme.spacing(2), paddingBottom: theme.spacing(3) },
  banner: { display: "flex", gap: 12, alignItems: "center", padding: theme.spacing(1.5, 2), borderRadius: 16, border: "1px solid rgba(217,119,6,.45)", background: "rgba(217,119,6,.08)" },
  hint: { fontSize: 13, color: theme.palette.text.secondary },
  cards: { display: "grid", gap: theme.spacing(2), gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" },
  agent: { display: "flex", flexDirection: "column", gap: theme.spacing(1.25), padding: theme.spacing(2.25), borderRadius: 22, border: `1px solid ${theme.palette.divider}`, background: theme.palette.background.paper, transition: "box-shadow .15s, transform .15s, border-color .15s", "&:hover": { boxShadow: "0 14px 32px rgba(15,23,42,.1)", transform: "translateY(-2px)", borderColor: theme.palette.primary.light } },
  head: { display: "flex", alignItems: "center", gap: 12 },
  icon: { width: 46, height: 46, borderRadius: 14, display: "grid", placeItems: "center", flex: "none", color: "#fff", background: "linear-gradient(135deg, #0B4279 0%, #0693E3 100%)" },
  iconOff: { background: "linear-gradient(135deg, #64748b 0%, #94a3b8 100%)" },
  name: { fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  chips: { display: "flex", gap: 6, flexWrap: "wrap" },
  chip: { display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 600, background: theme.palette.action.hover, color: theme.palette.text.secondary },
  go: { display: "flex", alignItems: "center", gap: 8, marginTop: theme.spacing(0.5) },
  empty: { textAlign: "center", padding: theme.spacing(6, 3), borderRadius: 24, border: `1.5px dashed ${theme.palette.divider}` },
}));

const KINDS = { commercial: { label: "Comercial", icon: GraduationCap }, service: { label: "Atendimento", icon: Headphones } };

// The agents of the company. Each card opens the agent's Central; the settings that belong to everybody (who takes the conversation, the funnel of the
// CRM, the MEC rules and the AI key) are one menu away.
const AiAgents = () => {
  const classes = useStyles();
  const history = useHistory();
  const [agents, setAgents] = useState(null);
  const [flows, setFlows] = useState([]);
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new agent (form)
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [menu, setMenu] = useState(null);
  const [handoff, setHandoff] = useState(null);

  const load = useCallback(() => {
    api.get("/ai-agents").then(({ data }) => setAgents(data)).catch((e) => { toastError(e); setAgents([]); });
    api.get("/flows", { params: { kind: "agent" } }).then(({ data }) => setFlows(Array.isArray(data) ? data : [])).catch(() => setFlows([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  // polos where nobody would answer a handoff: the manager sees it before a lead is left waiting
  useEffect(() => { if (dialog !== "assume") api.get("/ai-handoff").then(({ data }) => setHandoff(data)).catch(() => setHandoff(null)); }, [dialog]);

  const toggle = async (a) => {
    try { await api.put(`/ai-agents/${a.id}`, { active: !a.active }); load(); } catch (err) { toastError(err); }
  };
  const convert = async (a) => {
    try { const { data } = await api.post(`/ai-agents/${a.id}/convert`, {}); toast.success("Pronto: o agente virou blocos, em edição. Confira antes de publicar."); history.push(`/ai-agents/blocos/${data.flowId}`); } catch (e) { toastError(e); }
  };
  const flowOf = (a) => flows.find((f) => f.agentId === a.id);
  const kindOf = (a) => (flowOf(a) && flowOf(a).agentKind === "commercial" ? "commercial" : "service");
  const open = (name) => { setMenu(null); setDialog(name); };
  const notReady = handoff ? handoff.polos.filter((p) => !p.ready) : [];

  return (
    <MainContainer>
      <AgentEditor open={editing !== undefined} agent={editing || null} onClose={() => { setEditing(undefined); load(); }}
        onSaved={(saved, isNew) => { load(); if (isNew && saved && saved.id) history.push(`/ai-agents/${saved.id}/central?secao=ensinar`); }} />
      <NewAgentDialog open={creating} onClose={() => setCreating(false)} onManual={() => { setCreating(false); setEditing(null); }}
        onCreated={(made) => {
          setCreating(false);
          if (made.funnel && made.funnel.created && made.funnel.created.length) toast.success(`Colunas criadas no CRM: ${made.funnel.created.join(", ")}.`);
          else toast.success("Agente criado. Confira o roteiro, teste e publique.");
          history.push(`/ai-agents/blocos/${made.flowId}`);
        }} />
      <FunnelDialog open={dialog === "funil"} onClose={() => setDialog(null)} />
      <RegulationsDialog open={dialog === "mec"} onClose={() => setDialog(null)} />
      <HandoffDialog open={dialog === "assume"} onClose={() => setDialog(null)} />
      <KeysDialog open={dialog === "chave"} onClose={() => setDialog(null)} />
      <ConfirmationModal title="Remover este agente?" open={!!removing} onClose={() => setRemoving(null)}
        onConfirm={async () => { try { await api.delete(`/ai-agents/${removing.id}`); load(); } catch (e) { toastError(e); } setRemoving(null); }}>
        O que ele sabe e o roteiro da conversa também serão apagados.
      </ConfirmationModal>

      <MainHeader>
        <Title>Agentes de IA</Title>
        <MainHeaderButtonsWrapper>
          <Button variant="outlined" onClick={(e) => setMenu(e.currentTarget)} endIcon={<ChevronDown size={16} />} style={{ borderRadius: 12 }}>Configurações gerais</Button>
          <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)} getContentAnchorEl={null} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
            <MenuItem onClick={() => open("assume")}><UserCheck size={16} style={{ marginRight: 10 }} />Quem assume a conversa</MenuItem>
            <MenuItem onClick={() => open("funil")}><Filter size={16} style={{ marginRight: 10 }} />Etapas do CRM</MenuItem>
            <MenuItem onClick={() => open("mec")}><Scale size={16} style={{ marginRight: 10 }} />Regras do MEC</MenuItem>
            <MenuItem onClick={() => open("chave")}><Key size={16} style={{ marginRight: 10 }} />Chave de IA</MenuItem>
          </Menu>
          <Button variant="contained" color="primary" disableElevation startIcon={<Plus size={16} />} onClick={() => setCreating(true)} style={{ borderRadius: 12 }}>Novo agente</Button>
        </MainHeaderButtonsWrapper>
      </MainHeader>

      <div className={classes.wrap}>
        {notReady.length > 0 && (
          <div className={classes.banner}>
            <AlertTriangle size={20} color="#d97706" style={{ flex: "none" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{notReady.length} polo{notReady.length === 1 ? "" : "s"} sem consultor no comercial</b>
              <div className={classes.hint}>{notReady.map((p) => p.name).join(", ")}. A conversa fica na fila do polo e só a gestão é avisada.</div>
            </div>
            <Button size="small" variant="outlined" onClick={() => setDialog("assume")} style={{ borderRadius: 10 }}>Ver</Button>
          </div>
        )}

        {agents && agents.length === 0 && (
          <div className={classes.empty}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Nenhum agente ainda</div>
            <p className={classes.hint} style={{ maxWidth: 520, margin: "8px auto 16px" }}>
              O agente responde os leads sozinho, usa o que você ensinou a ele, descobre o que falta e passa a conversa para a equipe do polo certo com um resumo pronto.
            </p>
            <Button variant="contained" color="primary" disableElevation startIcon={<Sparkles size={16} />} onClick={() => setCreating(true)} style={{ borderRadius: 12 }}>Criar o primeiro agente</Button>
          </div>
        )}

        <div className={classes.cards}>
          {(agents || []).map((a) => {
            const f = flowOf(a);
            const kind = KINDS[kindOf(a)];
            const Icon = kind.icon;
            return (
              <div key={a.id} className={classes.agent}>
                <div className={classes.head}>
                  <span className={`${classes.icon} ${a.active ? "" : classes.iconOff}`}><Icon size={22} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className={classes.name} title={a.name}>{a.name}</div>
                    <div className={classes.hint}>{a.provider === "openai" ? "GPT" : "Claude"} · {a.model}</div>
                  </div>
                  <Tooltip title={a.active ? "Desligar o agente" : "Ligar o agente"}><span><Switch size="small" color="primary" checked={!!a.active} onChange={() => toggle(a)} /></span></Tooltip>
                </div>
                <div className={classes.chips}>
                  <span className={classes.chip} style={a.active ? { background: "rgba(22,163,74,.14)", color: "#15803d" } : undefined}>{a.active ? "Ligado" : "Desligado"}</span>
                  <span className={classes.chip}>{f ? kind.label : "Modo simples"}</span>
                  {f && <span className={classes.chip} style={f.status === "published" ? undefined : { background: "rgba(217,119,6,.14)", color: "#b45309" }}>{f.status === "published" ? `Publicado v${f.version}${f.changed ? " · com mudanças" : ""}` : "Em edição"}</span>}
                </div>
                <div className={classes.hint}>Atende: {a.queueId ? "uma fila" : a.whatsappId ? "uma conexão" : "todas as conversas sem atendente"}</div>
                <div className={classes.go}>
                  <Button variant="contained" color="primary" disableElevation endIcon={<ChevronRight size={16} />} onClick={() => history.push(`/ai-agents/${a.id}/central`)} style={{ borderRadius: 12, flex: 1 }}>Abrir central</Button>
                  {f ? (
                    <Tooltip title="Roteiro da conversa"><span><IconAction title="Roteiro da conversa" onClick={() => history.push(`/ai-agents/blocos/${f.id}`)}><Workflow size={17} /></IconAction></span></Tooltip>
                  ) : (
                    <Tooltip title="Passa este agente para o desenho em blocos, em edição. Nada muda para as pessoas até você publicar."><span><IconAction title="Converter em blocos" onClick={() => convert(a)}><Workflow size={17} /></IconAction></span></Tooltip>
                  )}
                  <IconAction title="Remover agente" onClick={() => setRemoving(a)}><Trash2 size={17} /></IconAction>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </MainContainer>
  );
};

export default AiAgents;
