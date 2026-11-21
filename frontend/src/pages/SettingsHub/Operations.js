import React, { useEffect, useState } from "react";
import { Button, FormControlLabel, Switch, TextField, Typography, MenuItem, Paper } from "@material-ui/core";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import api from "../../services/api";
import toastError from "../../errors/toastError";

// the rules of the operation live in one endpoint but each part is shown in the group where it belongs (no group "Operação" mixing
// deadlines, money and deliveries): "atendimento" in Horário e atendimento, "limites" in Custos, "modelos" in Modelos da Meta,
// "entregas" in Entregas e arquivos
const FOLLOW_FIELDS = [
  ["crm_escalation_minutes", "Escalar para a gestão após minutos"],
  ["crm_proposal_unopened_minutes", "Retornar proposta não aberta após minutos (0 desliga)"],
  ["crm_proposal_viewed_minutes", "Retornar proposta aberta após minutos (0 desliga)"],
  ["crm_payment_followup_minutes", "Acompanhar cobrança após minutos (0 desliga)"],
];
const LIMIT_FIELDS = [
  ["ai_daily_token_cap", "Tokens por dia de toda a IA, incluindo testes (0 sem limite)"],
  ["ai_daily_usd_cap", "Orçamento diário estimado da IA em US$ (0 sem limite)"],
  ["outbound_daily_messages", "Máximo de envios por dia (0 sem limite)"],
  ["outbound_daily_usd", "Orçamento diário estimado da Meta em US$ (0 sem limite)"],
  ["outbound_meta_service_usd", "Estimativa em US$ por mensagem de atendimento Meta"],
  ["outbound_meta_template_usd", "Estimativa em US$ por template Meta"]
];
export default function Operations({ part = "atendimento" }) {
  const [settings, setSettings] = useState(null);
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState("");
  const load = () => Promise.all([api.get("/operations/config"), api.get("/operations/summary")]).then(([config, data]) => { setSettings(config.data); setSummary(data.data); }).catch(toastError);
  useEffect(() => { load(); }, []);
  const save = async () => { setBusy(true); try { const { data } = await api.put("/operations/config", settings); setSettings(data); toast.success("Regras de operação salvas."); } catch (err) { toastError(err); } finally { setBusy(false); } };
  const reconcile = async (kind, id, status) => {
    if (!window.confirm(`Você já conferiu a conversa e confirmou que a mensagem ${status === "sent" ? "chegou" : "não chegou"}? Esta ação não reenvia mensagens.`)) return;
    try { await api.post(`/operations/reconcile/${kind}/${id}`, { status }); load(); } catch (err) { toastError(err); }
  };
  if (!settings || !summary) return null;
  const admin = Object.prototype.hasOwnProperty.call(settings, "ai_daily_token_cap");
  const spend = summary.spend;
  const saveBtn = <div><Button variant="contained" color="primary" disabled={busy} onClick={save}>{busy ? "Salvando..." : "Salvar"}</Button></div>;
  const numbers = (fields) => (
    <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", alignItems: "start" }}>
      {fields.filter(([key]) => settings[key] !== undefined).map(([key, label]) => <TextField key={key} variant="outlined" size="small" type="number" inputProps={{ min: 0, step: key.includes("usd") ? "any" : 1 }} InputLabelProps={{ shrink: true }} label={label} value={settings[key]} onChange={e => setSettings({ ...settings, [key]: e.target.value })} />)}
    </div>
  );

  if (part === "modelos") {
    if (!admin) return null;
    return <Paper variant="outlined" style={{ padding: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 260px", minWidth: 0 }}>
        <Typography style={{ fontWeight: 700 }}>Envio com modelos aprovados</Typography>
        <Typography variant="body2" color="textSecondary">Sem esta autorização nada sai fora das 24 horas: abertura dos departamentos, boas-vindas da matrícula e campanhas com modelo.</Typography>
      </div>
      <FormControlLabel style={{ margin: 0 }} control={<Switch color="primary" checked={settings.outbound_allow_templates === "true"} onChange={async e => {
        const next = { ...settings, outbound_allow_templates: String(e.target.checked) };
        setSettings(next); setBusy(true);
        try { const { data } = await api.put("/operations/config", next); setSettings(data); toast.success(e.target.checked ? "Envio com modelos autorizado." : "Envio com modelos desligado."); } catch (err) { toastError(err); load(); } finally { setBusy(false); }
      }} disabled={busy} />} label={settings.outbound_allow_templates === "true" ? "Autorizado" : "Desligado"} />
    </Paper>;
  }

  if (part === "limites") return <div style={{ display: "grid", gap: 16 }}>
    <Paper variant="outlined" style={{ padding: 20, display: "grid", gap: 14 }}>
      <Typography variant="h6">Limites de gasto por dia</Typography>
      <Typography variant="body2" color="textSecondary">Ao chegar no limite, o sistema para de gastar até o dia seguinte. 0 deixa sem limite.</Typography>
      {numbers(LIMIT_FIELDS)}
      <Typography variant="caption" color="textSecondary">Os valores em dólares são estimativas configuradas, não a fatura. Limites de IA reservam margem antes de cada chamada; testes também consomem o orçamento.</Typography>
      {saveBtn}
    </Paper>
    {spend && <Paper variant="outlined" style={{ padding: 20, display: "grid", gap: 4 }}>
      <Typography variant="h6">Consumo de hoje</Typography>
      <Typography variant="body2">IA estimada: US$ {spend.aiEstimatedUsd.toFixed(4)} · {spend.aiUnpricedCalls} chamadas sem preço cadastrado · {spend.aiReservedTokens} tokens reservados.</Typography>
      <Typography variant="body2">Envios: {spend.messages} · Meta estimada: US$ {spend.metaEstimatedUsd.toFixed(4)} · {spend.metaUnpricedMessages} mensagens sem preço.</Typography>
      <Typography variant="body2">Custo estimado por matrícula hoje: {spend.enrollments ? `US$ ${((spend.aiEstimatedUsd + spend.metaEstimatedUsd) / spend.enrollments).toFixed(4)}` : "sem matrícula hoje"}.</Typography>
    </Paper>}
  </div>;

  if (part === "entregas") return <div style={{ display: "grid", gap: 16 }}>
    <Paper variant="outlined" style={{ padding: 20 }}>
      <Typography variant="h6">Conferir entregas</Typography>
      <Typography variant="body2">Mensagens interrompidas não são reenviadas automaticamente. Confira a conversa e registre o resultado; se precisar reenviar, crie um novo envio.</Typography>
      {summary.uncertain.map(d => <div key={d.id}>{d.ticketId ? <Button component={Link} to={`/tickets/${d.ticketId}`}>Abrir conversa #{d.ticketId}</Button> : <Typography variant="body2">Conversa removida; registro de consumo preservado.</Typography>}<Typography variant="caption">{d.status === "sending" ? "Envio em andamento" : d.error}</Typography>{d.status === "uncertain" && (!d.ticketId || !/^(schedule|campaign):/.test(d.key)) && <><Button onClick={() => reconcile("delivery", d.id, "sent")}>Confirmei a entrega</Button><Button onClick={() => reconcile("delivery", d.id, "failed")}>Confirmei que não chegou</Button></>}</div>)}
      {[...summary.schedules.map(s => ({ ...s, kind: "schedule", label: "Agendamento" })), ...summary.shippings.map(s => ({ ...s, kind: "campaign", label: "Campanha" }))].map(s => <div key={`${s.kind}:${s.id}`} style={{ marginTop: 8 }}>
        <Typography variant="body2">{s.label} #{s.id}: {s.error}</Typography><Button onClick={() => reconcile(s.kind, s.id, "sent")}>Confirmei a entrega</Button><Button onClick={() => reconcile(s.kind, s.id, "failed")}>Confirmei que não chegou</Button>
      </div>)}
      {!summary.uncertain.length && !summary.schedules.length && !summary.shippings.length && <Typography variant="body2" color="textSecondary" style={{ marginTop: 8 }}>Nenhuma entrega para conferir. Tudo foi entregue ou já foi conferido.</Typography>}
      <Button onClick={load}>Atualizar</Button>
    </Paper>
    {admin && <Paper variant="outlined" style={{ padding: 20 }}>
      <Typography variant="h6">Revogar acesso a um arquivo</Typography>
      <Typography variant="body2">Links de arquivos expiram em uma hora. A revogação bloqueia imediatamente novos acessos a todos os links daquele arquivo.</Typography>
      <TextField value={file} onChange={e => setFile(e.target.value)} label="Nome do arquivo" />
      <Button disabled={!file.trim()} onClick={async () => { try { await api.post("/operations/files/revoke", { filename: file.trim() }); setFile(""); toast.success("Acesso revogado."); } catch (err) { toastError(err); } }}>Revogar acesso</Button>
    </Paper>}
  </div>;
  return <div style={{ display: "grid", gap: 16 }}>
    <Paper variant="outlined" style={{ padding: 20, display: "grid", gap: 14 }}>
      <Typography variant="h6">Continuidade do atendimento</Typography>
      <Typography variant="body2" color="textSecondary">Cada nova conversa sem resposta é acompanhada. Propostas e cobranças geram tarefas para o responsável; uma resposta ou encerramento interrompe o acompanhamento automático.</Typography>
      <TextField select variant="outlined" size="small" label="Fila comercial para encaminhamentos sem polo" value={settings.crm_fallback_queue_id || "0"} onChange={e => setSettings({ ...settings, crm_fallback_queue_id: e.target.value })}>
        <MenuItem value="0">Usar a fila já definida no atendimento</MenuItem>{summary.queues.map(q => <MenuItem key={q.id} value={String(q.id)}>{q.name}</MenuItem>)}
      </TextField>
      <FormControlLabel control={<Switch color="primary" checked={settings.crm_followup_enabled === "true"} onChange={e => setSettings({ ...settings, crm_followup_enabled: String(e.target.checked) })} />} label="Criar tarefas para acompanhar propostas e cobranças" />
      {numbers(FOLLOW_FIELDS)}
      {saveBtn}
    </Paper>
    {summary.unassigned.length > 0 && <Paper variant="outlined" style={{ padding: 20 }}>
      <Typography variant="h6">Atendimentos sem responsável</Typography>
      {summary.unassigned.map(t => <Button key={t.id} component={Link} to={`/tickets/${t.id}`} style={{ display: "block" }}>Distribuir: {t.contact?.name || `Atendimento ${t.id}`}</Button>)}
    </Paper>}
    <Paper variant="outlined" style={{ padding: 20, display: "grid", gap: 10 }}>
      <Typography variant="h6">Disponibilidade da equipe</Typography>
      <Typography variant="body2" color="textSecondary">Quem recebe conversas novas e quantas pode ter abertas ao mesmo tempo (0 = sem limite).</Typography>
      {summary.users.map((user, i) => <div key={user.id} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <FormControlLabel style={{ flex: "1 1 220px", minWidth: 0 }} control={<Switch color="primary" checked={user.acceptsNewTickets !== false} onChange={e => setSummary({ ...summary, users: summary.users.map((u, j) => j === i ? { ...u, acceptsNewTickets: e.target.checked } : u) })} />} label={`${user.name} · ${user.openTickets} abertos`} />
        <TextField size="small" variant="outlined" type="number" label="Capacidade" style={{ width: 120 }} value={user.maxOpenTickets} inputProps={{ min: 0, max: 1000 }} onChange={e => setSummary({ ...summary, users: summary.users.map((u, j) => j === i ? { ...u, maxOpenTickets: Number(e.target.value) } : u) })} />
        <Button variant="outlined" onClick={async () => { try { await api.put(`/operations/users/${user.id}/capacity`, { acceptsNewTickets: user.acceptsNewTickets, maxOpenTickets: user.maxOpenTickets }); toast.success("Capacidade salva."); } catch (err) { toastError(err); } }}>Salvar</Button>
      </div>)}
    </Paper>
  </div>;
}