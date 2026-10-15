import React, { useEffect, useState } from "react";
import { Button, MenuItem, TextField, Typography } from "@material-ui/core";
import { Plus, Trash2, Workflow } from "lucide-react";
import { Link } from "react-router-dom";

import IconAction from "../../components/IconAction";
import api from "../../services/api";

// What the agent may start on its own: each function is a published flow with a name and "when to use it".
// During the conversation the agent decides; the flow then takes over and talks to the person by itself.
const FunctionsTab = ({ value, onChange }) => {
  const [flows, setFlows] = useState([]);
  const list = Array.isArray(value) ? value : [];
  useEffect(() => { api.get("/flows").then(({ data }) => setFlows(data.filter((f) => f.status === "published"))).catch(() => undefined); }, []);
  const set = (i, patch) => onChange(list.map((f, k) => (k === i ? { ...f, ...patch } : f)));

  return (
    <>
      <Typography variant="body2" color="textSecondary" gutterBottom>
        Funções são fluxos que o agente pode chamar sozinho, por exemplo “enviar o menu de cursos” ou “agendar uma conversa com o consultor”. Você diz quando usar; quando a conversa pedir, o agente chama o fluxo e ele assume o atendimento, com botões e envio ao CRM.
      </Typography>
      {list.length === 0 && (
        <Typography variant="body2" style={{ padding: "16px 0", opacity: 0.7 }}>
          <Workflow size={16} style={{ verticalAlign: -3, marginRight: 6 }} />Nenhuma função ainda. {flows.length === 0 ? <>Publique um fluxo em <Link to="/chatbot">Chatbot e fluxos</Link> para usar aqui.</> : "Adicione a primeira."}
        </Typography>
      )}
      {list.map((f, i) => (
        <div key={i} style={{ border: "1px solid rgba(127,140,160,.3)", borderRadius: 12, padding: 12, marginTop: 10, display: "grid", gap: 4 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <TextField variant="outlined" size="small" margin="dense" label="Nome da função" value={f.name || ""} onChange={(e) => set(i, { name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} helperText="Sem acento nem espaço. Ex.: menu_de_cursos" InputLabelProps={{ shrink: true }} style={{ flex: 1 }} />
            <TextField select variant="outlined" size="small" margin="dense" label="Fluxo" value={f.flowId || ""} onChange={(e) => set(i, { flowId: e.target.value })} InputLabelProps={{ shrink: true }} style={{ flex: 1 }}>
              {flows.map((fl) => <MenuItem key={fl.id} value={fl.id}>{fl.name}</MenuItem>)}
            </TextField>
            <IconAction title="Remover a função" onClick={() => onChange(list.filter((_, k) => k !== i))}><Trash2 size={16} /></IconAction>
          </div>
          <TextField fullWidth multiline rows={2} variant="outlined" size="small" margin="dense" label="Quando usar" value={f.description || ""} onChange={(e) => set(i, { description: e.target.value })} InputLabelProps={{ shrink: true }}
            placeholder="Use quando o aluno pedir para ver os cursos disponíveis ou disser que quer conhecer a oferta." />
        </div>
      ))}
      <div style={{ marginTop: 12 }}>
        <Button size="small" variant="outlined" startIcon={<Plus size={15} />} disabled={list.length >= 10 || flows.length === 0} onClick={() => onChange([...list, { name: "", description: "", flowId: "" }])}>Adicionar função</Button>
      </div>
      <Typography variant="caption" color="textSecondary" display="block" style={{ marginTop: 12 }}>
        Só fluxos publicados aparecem na lista. No teste do agente a função não é executada: o teste só mostra que o agente quis chamá-la. Salve o agente para valer.
      </Typography>
    </>
  );
};

export default FunctionsTab;
