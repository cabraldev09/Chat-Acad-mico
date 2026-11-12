import React, { useEffect, useState } from "react";
import { Button, CircularProgress, FormControlLabel, Switch, TextField, MenuItem, Paper, makeStyles, IconButton } from "@material-ui/core";
import { ArrowUp, ArrowDown, Plus, Trash2, Save, Workflow, ShieldCheck, BarChart3 } from "lucide-react";
import { toast } from "react-toastify";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles(theme => ({
  root: { display: "grid", gap: 18, color: theme.palette.text.primary },
  card: { padding: 20, borderRadius: 16, display: "grid", gap: 14 },
  title: { display: "flex", gap: 10, alignItems: "center", fontSize: 16, fontWeight: 700 },
  hint: { fontSize: 13, color: theme.palette.text.secondary, lineHeight: 1.6 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px,1fr))", gap: 14 },
  step: { border: `1px solid ${theme.palette.divider}`, borderRadius: 12, padding: 14, display: "grid", gap: 10 },
  row: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  number: { width: 28, height: 28, borderRadius: 9, background: theme.palette.action.selected, display: "grid", placeItems: "center", fontWeight: 700, color: theme.palette.primary.main },
  footer: { display: "flex", gap: 12, justifyContent: "flex-end", position: "sticky", bottom: 0, background: theme.palette.background.paper, padding: "12px 0", zIndex: 1 }
}));

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "—");

// How the team uses the copilot: per consultant, suggestions and summaries asked, how many suggestions went out as they were or edited,
// and the thumbs up / down. Read only; the cost is in Agentes de IA → Uso (calls of kind "copilot").
function CopilotUsage({ classes: c }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    setData(null);
    api.get(`/copilot/usage?days=${days}`).then(({ data: result }) => { if (alive) setData(result); }).catch(toastError);
    return () => { alive = false; };
  }, [days]);
  const row = (label, v, key) => <tr key={key}>
    <td style={{ padding: "6px 8px" }}>{label}</td>
    <td align="right">{v.suggestions}</td><td align="right">{v.briefs}</td>
    <td align="right" title="Das sugestões levadas para a caixa de mensagem">{pct(v.used, v.used + v.edited + v.discarded)}</td>
    <td align="right">{pct(v.edited, v.used + v.edited + v.discarded)}</td>
    <td align="right">{v.useful} / {v.notUseful}</td>
  </tr>;
  return <Paper variant="outlined" className={c.card}>
    <div className={c.title}><BarChart3 size={20} /> Uso pela equipe
      <TextField select size="small" variant="outlined" value={days} onChange={e => setDays(Number(e.target.value))} style={{ marginLeft: "auto", minWidth: 140 }}>
        {[7, 30, 90].map(d => <MenuItem key={d} value={d}>Últimos {d} dias</MenuItem>)}
      </TextField>
    </div>
    <div className={c.hint}>“Enviada como veio” e “editada” contam as sugestões que o consultor colocou na caixa de mensagem e depois enviou. 👍 / 👎 é a opinião do consultor.</div>
    {!data ? <CircularProgress size={20} /> : !data.users.length ? <div className={c.hint}>Ninguém usou o copiloto neste período.</div> :
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr style={{ textAlign: "right" }}><th style={{ textAlign: "left", padding: "6px 8px" }}>Consultor</th><th>Sugestões</th><th>Resumos</th><th>Enviada como veio</th><th>Editada</th><th>👍 / 👎</th></tr></thead>
        <tbody>{data.users.map(u => row(u.name, u, u.userId))}{row(<b>Equipe</b>, data.total, "total")}</tbody>
      </table></div>}
  </Paper>;
}

export default function CopilotSettings({ processOnly = false, onSaved }) {
  const c = useStyles();
  const [config, setConfig] = useState(null);
  const [agents, setAgents] = useState([]);
  const [connections, setConnections] = useState([]);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const load = () => {
    setFailed(false);
    api.get("/copilot/settings").then(({ data }) => setConfig(data)).catch(e => { setFailed(true); toastError(e); });
  };
  useEffect(() => {
    load();
    if (!processOnly) {
      api.get("/ai-agents").then(({ data }) => setAgents(Array.isArray(data) ? data : data.agents || [])).catch(toastError);
      api.get("/whatsapp").then(({ data }) => setConnections(Array.isArray(data) ? data : data.whatsapps || [])).catch(toastError);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processOnly]);
  if (!config) return failed ? <Button onClick={load}>Tentar carregar novamente</Button> : <CircularProgress size={24} aria-label="Carregando configuração do copiloto" />;
  const set = (key, value) => setConfig(v => ({ ...v, [key]: value }));
  const updateStep = (index, key, value) => set("steps", config.steps.map((s, i) => i === index ? { ...s, [key]: value } : s));
  const move = (index, delta) => {
    const steps = [...config.steps];
    [steps[index], steps[index + delta]] = [steps[index + delta], steps[index]];
    set("steps", steps);
  };
  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/copilot/settings", config);
      setConfig(data);
      toast.success("Processo e controles do copiloto salvos.");
      window.dispatchEvent(new CustomEvent("copilotRefresh"));
      if (onSaved) onSaved();
    } catch (e) { toastError(e); }
    setSaving(false);
  };
  const limit = (key, label) => <TextField key={key} variant="outlined" size="small" type="number" label={label} value={config[key]} onChange={e => set(key, e.target.value === "" ? "" : Number(e.target.value))} inputProps={{ min: 0, max: 100000, step: 1 }} helperText="0 = sem limite. Resumos e sugestões contam juntos" />;
  return <div className={c.root}>
    {processOnly && <Button href="/configuracoes?secao=copiloto" style={{ justifySelf: "start" }}>Ativação, conexões e limites de uso</Button>}
    {!processOnly && <>
      <Paper variant="outlined" className={c.card}>
        <div className={c.title}><ShieldCheck size={20} /> Disponibilidade e consumo</div>
        <FormControlLabel control={<Switch checked={config.enabled} onChange={e => set("enabled", e.target.checked)} color="primary" />} label="Copiloto disponível em todas as conexões" />
        <div className={c.hint}>Conexões atuais e novas recebem o processo automaticamente. As exceções abaixo permitem desativar conexões específicas. O roteiro e os textos prontos não fazem chamadas à IA.</div>
        <FormControlLabel control={<Switch checked={config.aiEnabled} onChange={e => set("aiEnabled", e.target.checked)} color="primary" />} label="Permitir sugestões e resumos de IA solicitados pelo consultor" />
        <TextField select label="Agente e base de conhecimento" variant="outlined" size="small" value={config.agentId || ""} onChange={e => set("agentId", Number(e.target.value) || null)} helperText="Usa as orientações do agente para sugerir textos. Não liga o atendimento automático.">
          <MenuItem value="">Agente da conexão; na ausência, primeiro agente ativo</MenuItem>
          {agents.map(a => <MenuItem key={a.id} value={a.id}>{a.name}{!a.active ? " (atendimento automático desligado)" : ""}</MenuItem>)}
        </TextField>
        <div className={c.grid}>{limit("dailyLimit", "Sugestões por dia — equipe")}{limit("userDailyLimit", "Por consultor / dia")}{limit("connectionDailyLimit", "Por conexão / dia")}</div>
        <div className={c.hint}>Os limites são compartilhados entre abas e reinícios e seguem o fuso do sistema. Tentativas com falha também contam, pois o provedor pode ter processado a chamada. Pedir novamente para a mesma mensagem reutiliza a sugestão. Os limites de tokens do agente e do sistema também se aplicam.</div>
      </Paper>
      <CopilotUsage classes={c} />
      <Paper variant="outlined" className={c.card}>
        <div className={c.title}>Conexões</div>
        {connections.map(conn => {
          const rule = config.connections[String(conn.id)];
          const update = patch => set("connections", { ...config.connections, [conn.id]: { enabled: true, dailyLimit: config.connectionDailyLimit, ...rule, ...patch } });
          return <div className={c.row} key={conn.id}>
            <FormControlLabel style={{ flex: "1 1 180px" }} control={<Switch color="primary" checked={!rule || rule.enabled} onChange={e => update({ enabled: e.target.checked })} />} label={conn.name} />
            <TextField label="Sugestões / dia" size="small" variant="outlined" type="number" value={rule ? rule.dailyLimit : config.connectionDailyLimit} onChange={e => update({ dailyLimit: e.target.value === "" ? "" : Number(e.target.value) })} inputProps={{ min: 0, max: 100000 }} style={{ width: 150 }} />
            {rule && <Button size="small" onClick={() => { const next = { ...config.connections }; delete next[conn.id]; set("connections", next); }}>Usar padrão</Button>}
          </div>;
        })}
        {!connections.length && <div className={c.hint}>As novas conexões seguirão automaticamente o padrão definido acima.</div>}
      </Paper>
    </>}
    <Paper variant="outlined" className={c.card}>
      <div className={c.title}><Workflow size={20} /> Processo até a matrícula <span className={c.hint}>· versão {config.version}</span></div>
      <div className={c.hint}>Revise os objetivos, personalize os textos e ordene as etapas. A edição vale para toda a equipe. O progresso já registrado é preservado pelas etapas mantidas. A matrícula é concluída pelo registro real no CRM.</div>
      {config.steps.map((s, i) => <div key={s.key} className={c.step}>
        <div className={c.row}>
          <span className={c.number}>{i + 1}</span><b style={{ flex: 1 }}>{s.label || "Nova etapa"}</b>
          <IconButton size="small" disabled={saving || i === 0 || s.key === "enroll"} onClick={() => move(i, -1)} aria-label={`Mover ${s.label} para cima`}><ArrowUp size={16} /></IconButton>
          <IconButton size="small" disabled={saving || i >= config.steps.length - 2} onClick={() => move(i, 1)} aria-label={`Mover ${s.label} para baixo`}><ArrowDown size={16} /></IconButton>
          <IconButton size="small" disabled={saving || s.key === "enroll" || config.steps.length <= 2} onClick={() => set("steps", config.steps.filter((_, index) => index !== i))} aria-label={`Remover ${s.label}`}><Trash2 size={16} /></IconButton>
        </div>
        <TextField label="Nome da etapa" variant="outlined" size="small" value={s.label} onChange={e => updateStep(i, "label", e.target.value)} inputProps={{ maxLength: 100 }} />
        <TextField label="O que o consultor deve fazer" variant="outlined" size="small" multiline value={s.instruction} onChange={e => updateStep(i, "instruction", e.target.value)} inputProps={{ maxLength: 800 }} />
        <TextField label="Mensagem pronta (opcional)" variant="outlined" size="small" multiline minRows={2} value={s.message} onChange={e => updateStep(i, "message", e.target.value)} inputProps={{ maxLength: 1500 }} helperText="Vazio: usa o texto padrão, quando houver. O consultor pode editar antes de enviar." />
      </div>)}
      <Button startIcon={<Plus size={16} />} disabled={saving || config.steps.length >= 20} onClick={() => {
        const steps = [...config.steps];
        steps.splice(steps.length - 1, 0, { key: `custom_${Date.now()}`, label: "Nova etapa", instruction: "", message: "" });
        set("steps", steps);
      }}>Adicionar etapa</Button>
    </Paper>
    <div className={c.footer}><Button disabled={saving} onClick={load}>Recarregar</Button><Button variant="contained" color="primary" disabled={saving || config.steps.some(s => !s.label.trim())} startIcon={saving ? <CircularProgress size={16} /> : <Save size={16} />} onClick={save}>{saving ? "Salvando…" : "Salvar alterações"}</Button></div>
  </div>;
}
