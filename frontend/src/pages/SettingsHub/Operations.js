import React, { useEffect, useState } from "react";
import { Button, FormControlLabel, Switch, TextField, Typography } from "@material-ui/core";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { confirmDialog } from "../../components/ConfirmDialog";
import { SetCard, SaveBar, Fields } from "./ui";

// The rules of the operation live in one endpoint; each part is shown in the group where it belongs:
// "prazos" in Horário e prazos, "acompanhamento" and "equipe" in Distribuição e lembretes, "limites" in Limites e orçamento,
// "modelos" in Modelos da Meta, "entregas" in Entregas e arquivos.
const FOLLOW_FIELDS = [
  ["crm_proposal_unopened_minutes", "Proposta não aberta: retornar após (min)"],
  ["crm_proposal_viewed_minutes", "Proposta aberta: retornar após (min)"],
  ["crm_payment_followup_minutes", "Cobrança: acompanhar após (min)"],
];
const DAY_FIELDS = [
  ["ai_daily_usd_cap", "IA: US$ por dia"],
  ["ai_daily_token_cap", "IA: tokens por dia"],
  ["outbound_daily_usd", "WhatsApp oficial: US$ por dia"],
  ["outbound_daily_messages", "WhatsApp oficial: envios por dia"],
];
const MONTH_FIELDS = [
  ["outbound_monthly_usd", "WhatsApp oficial: teto do mês (US$)"],
  ["ai_monthly_budget_usd", "IA: orçamento do mês (US$)"],
  ["outbound_usd_brl", "Cotação do dólar (R$)"],
];
const PRICE_FIELDS = [
  ["outbound_meta_template_usd", "Preço do modelo de Utilidade (US$)"],
  ["outbound_meta_service_usd", "Preço da resposta acima das 1.000 grátis (US$)"],
];

const has = (o, k) => o && Object.prototype.hasOwnProperty.call(o, k);

export default function Operations({ part = "acompanhamento" }) {
  const [saved, setSaved] = useState(null);
  const [settings, setSettings] = useState(null);
  const [summary, setSummary] = useState(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState("");
  const needsSummary = part === "entregas" || part === "equipe";
  const load = () => {
    setFailed(false);
    return Promise.all([api.get("/operations/config"), needsSummary ? api.get("/operations/summary") : Promise.resolve({ data: null })])
      .then(([config, data]) => { setSaved(config.data); setSettings(config.data); setSummary(data.data); })
      .catch((err) => { setFailed(true); toastError(err); });
  };
  useEffect(() => { load(); }, [part]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) return <SetCard title="Não foi possível carregar"><Button variant="outlined" onClick={load} style={{ justifySelf: "start" }}>Tentar de novo</Button></SetCard>;
  if (!settings || (needsSummary && !summary)) return <Typography variant="body2" color="textSecondary">Carregando...</Typography>;

  const keysOf = (fields) => fields.map(([k]) => k).filter((k) => has(settings, k));
  const dirtyOf = (keys) => keys.some((k) => String(settings[k]) !== String(saved[k]));
  const saveKeys = async (keys) => {
    setBusy(true);
    try {
      const { data } = await api.put("/operations/config", Object.fromEntries(keys.map((k) => [k, settings[k]])));
      setSaved(data);
      // the edits of the other cards on screen stay as they are
      setSettings((cur) => ({ ...data, ...Object.fromEntries(Object.entries(cur).filter(([k]) => !keys.includes(k))) }));
      toast.success("Salvo.");
    } catch (err) { toastError(err); } finally { setBusy(false); }
  };
  const numbers = (fields) => (
    <Fields>
      {fields.filter(([key]) => has(settings, key)).map(([key, label]) => (
        <TextField key={key} variant="outlined" size="small" type="number" inputProps={{ min: 0, step: key.includes("usd") ? "any" : 1 }} InputLabelProps={{ shrink: true }}
          label={label} value={settings[key]} onChange={(e) => { const value = e.target.value; setSettings((cur) => ({ ...cur, [key]: value })); }} />
      ))}
    </Fields>
  );
  const bar = (keys) => <SaveBar dirty={dirtyOf(keys)} busy={busy} onSave={() => saveKeys(keys)} onDiscard={() => setSettings((cur) => ({ ...cur, ...Object.fromEntries(keys.map((k) => [k, saved[k]])) }))} />;

  if (part === "prazos") {
    const keys = ["crm_escalation_minutes"];
    return (
      <SetCard title="Escalar para a gestão" sub="Se o lead novo continuar sem resposta depois do alerta, a coordenação recebe outro aviso após este tempo.">
        {numbers([["crm_escalation_minutes", "Escalar após (min)"]])}
        {bar(keys)}
      </SetCard>
    );
  }

  if (part === "acompanhamento") {
    const keys = ["crm_followup_enabled", ...keysOf(FOLLOW_FIELDS)];
    const on = settings.crm_followup_enabled === "true";
    return (
      <SetCard title="Retorno de propostas e cobranças" sub="O responsável recebe uma tarefa para retomar. Uma resposta do lead ou o encerramento interrompe o acompanhamento. 0 desliga.">
        <FormControlLabel style={{ margin: 0 }} control={<Switch color="primary" checked={on} onChange={(e) => { const v = String(e.target.checked); setSettings((cur) => ({ ...cur, crm_followup_enabled: v })); }} />} label={on ? "Criar tarefas de retorno" : "Sem tarefas de retorno"} />
        {on && numbers(FOLLOW_FIELDS)}
        {bar(keys)}
      </SetCard>
    );
  }

  if (part === "equipe") {
    const change = (i, patch) => setSummary((cur) => ({ ...cur, users: cur.users.map((u, j) => (j === i ? { ...u, ...patch } : u)) }));
    return (
      <SetCard title="Disponibilidade da equipe" sub="Quem recebe conversas novas e quantas pode ter abertas ao mesmo tempo (0 = sem limite).">
        <div style={{ display: "grid", gap: 8 }}>
          {summary.users.map((user, i) => (
            <div key={user.id} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <FormControlLabel style={{ flex: "1 1 220px", minWidth: 0, margin: 0 }} control={<Switch color="primary" checked={user.acceptsNewTickets !== false} onChange={(e) => change(i, { acceptsNewTickets: e.target.checked })} />} label={`${user.name} · ${user.openTickets} abertos`} />
              <TextField size="small" variant="outlined" type="number" label="Capacidade" style={{ width: 120 }} value={user.maxOpenTickets} inputProps={{ min: 0, max: 1000 }} onChange={(e) => change(i, { maxOpenTickets: Number(e.target.value) })} />
              <Button variant="outlined" style={{ height: 40 }} onClick={async () => { try { await api.put(`/operations/users/${user.id}/capacity`, { acceptsNewTickets: user.acceptsNewTickets, maxOpenTickets: user.maxOpenTickets }); toast.success("Capacidade salva."); } catch (err) { toastError(err); } }}>Salvar</Button>
            </div>
          ))}
        </div>
      </SetCard>
    );
  }

  if (part === "modelos") {
    if (!has(settings, "outbound_allow_templates")) return null;
    const on = settings.outbound_allow_templates === "true";
    return (
      <SetCard title="Envio com modelos aprovados" sub="Sem esta autorização nada sai fora das 24 horas: abertura dos departamentos, boas-vindas da matrícula e campanhas com modelo.">
        <FormControlLabel style={{ margin: 0 }} control={<Switch color="primary" checked={on} disabled={busy} onChange={async (e) => {
          const v = String(e.target.checked);
          setSettings((cur) => ({ ...cur, outbound_allow_templates: v })); setBusy(true);
          try { const { data } = await api.put("/operations/config", { outbound_allow_templates: v }); setSaved(data); setSettings(data); toast.success(v === "true" ? "Envio com modelos autorizado." : "Envio com modelos desligado."); } catch (err) { toastError(err); load(); } finally { setBusy(false); }
        }} />} label={on ? "Autorizado" : "Desligado"} />
      </SetCard>
    );
  }

  if (part === "limites") {
    const admin = has(settings, "ai_daily_token_cap");
    const quota = ["send_quota_monthly"].filter((k) => has(settings, k));
    const day = keysOf(DAY_FIELDS);
    const month = [...keysOf(MONTH_FIELDS), ...keysOf(PRICE_FIELDS), ...(has(settings, "outbound_allow_marketing") ? ["outbound_allow_marketing"] : [])];
    const brl = Number(settings.outbound_monthly_usd) > 0 && Number(settings.outbound_usd_brl) > 0
      ? (Number(settings.outbound_monthly_usd) * Number(settings.outbound_usd_brl)).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : null;
    return (
      <>
        {quota.length > 0 && (
          <SetCard title="Cota de disparos por pessoa" sub="Mensagens que as campanhas e os avisos de cada pessoa podem enviar no mês. Quem passa pede liberação à gestão (Estatísticas → Disparos). 0 deixa sem limite.">
            {numbers([["send_quota_monthly", "Mensagens por pessoa no mês"]])}
            {bar(quota)}
          </SetCard>
        )}
        {admin && day.length > 0 && (
          <SetCard title="Limites por dia" sub="Ao chegar no limite, o sistema para de gastar até o dia seguinte. 0 deixa sem limite.">
            {numbers(DAY_FIELDS)}
            {bar(day)}
          </SetCard>
        )}
        {admin && month.length > 0 && (
          <SetCard title="Teto do mês" sub={`Campanha que passaria do teto não começa, e os envios pagos param até o mês seguinte. A gestão é avisada aos 80%.${brl ? ` O teto do WhatsApp equivale a cerca de ${brl}.` : ""}`}>
            {numbers(MONTH_FIELDS)}
            <FormControlLabel style={{ margin: 0 }} control={<Switch color="primary" checked={settings.outbound_allow_marketing === "true"} onChange={(e) => { const v = String(e.target.checked); setSettings((cur) => ({ ...cur, outbound_allow_marketing: v })); }} />}
              label="Permitir modelos de Marketing em campanhas (cerca de 9 vezes o preço de Utilidade)" />
            <details>
              <summary style={{ cursor: "pointer", fontSize: 13.5, fontWeight: 600 }}>Preços da Meta (vazio usa a tabela)</summary>
              <div style={{ marginTop: 12 }}>{numbers(PRICE_FIELDS)}</div>
            </details>
            {bar(month)}
          </SetCard>
        )}
        <Typography variant="body2" color="textSecondary">O gasto de cada dia fica em <Link to="/estatisticas?aba=disparos">Estatísticas → Disparos</Link> (WhatsApp) e em <Link to="/ai-agents">Agentes de IA</Link> (IA).</Typography>
      </>
    );
  }

  // entregas
  const reconcile = async (kind, id, status) => {
    if (!(await confirmDialog({ title: status === "sent" ? "Marcar como entregue?" : "Marcar como não entregue?", message: `Confira na conversa se a mensagem ${status === "sent" ? "chegou" : "não chegou"}. Esta ação não reenvia mensagens.`, confirmText: "Confirmar" }))) return;
    try { await api.post(`/operations/reconcile/${kind}/${id}`, { status }); load(); } catch (err) { toastError(err); }
  };
  const admin = has(settings, "ai_daily_token_cap");
  const pending = [...summary.schedules.map((s) => ({ ...s, kind: "schedule", label: "Agendamento" })), ...summary.shippings.map((s) => ({ ...s, kind: "campaign", label: "Campanha" }))];
  return (
    <>
      <SetCard title="Conferir entregas" sub="Mensagens interrompidas não são reenviadas sozinhas. Confira a conversa e registre o resultado.">
        {(summary.metaWebhooks || []).length > 0 && (
          <div role="alert" style={{ padding: 12, borderRadius: 10, border: "1px solid #c62828" }}>
            <Typography variant="subtitle2">Eventos da Meta com falha definitiva</Typography>
            <Typography variant="body2">O sistema não conseguiu processar estes eventos depois de cinco tentativas. Confira a conexão antes de qualquer ação.</Typography>
            {(summary.metaWebhooks || []).map((event) => (
              <Typography key={event.id} variant="caption" display="block">Evento #{event.id} · {event.whatsappId ? `conexão #${event.whatsappId}` : "aplicativo Meta"} · {event.attempts} tentativas · {new Date(event.updatedAt).toLocaleString("pt-BR")}</Typography>
            ))}
            <Button component={Link} to="/connections">Abrir conexões</Button>
          </div>
        )}
        {summary.uncertain.map((d) => (
          <div key={d.id}>
            {d.ticketId ? <Button component={Link} to={`/tickets/${d.ticketId}`}>Abrir conversa #{d.ticketId}</Button> : <Typography variant="body2">Conversa removida; registro de consumo preservado.</Typography>}
            <Typography variant="caption">{d.status === "sending" ? "Envio em andamento" : d.error}</Typography>
            {d.status === "uncertain" && (!d.ticketId || !/^(schedule|campaign):/.test(d.key)) && <><Button onClick={() => reconcile("delivery", d.id, "sent")}>Confirmei a entrega</Button><Button onClick={() => reconcile("delivery", d.id, "failed")}>Confirmei que não chegou</Button></>}
          </div>
        ))}
        {pending.map((s) => (
          <div key={`${s.kind}:${s.id}`}>
            <Typography variant="body2">{s.label} #{s.id}: {s.error}</Typography>
            <Button onClick={() => reconcile(s.kind, s.id, "sent")}>Confirmei a entrega</Button><Button onClick={() => reconcile(s.kind, s.id, "failed")}>Confirmei que não chegou</Button>
          </div>
        ))}
        {!summary.uncertain.length && !pending.length && <Typography variant="body2" color="textSecondary">Nenhuma entrega para conferir.</Typography>}
        <Button variant="outlined" onClick={load} style={{ justifySelf: "start" }}>Atualizar</Button>
      </SetCard>
      {admin && (
        <SetCard title="Revogar acesso a um arquivo" sub="Os links de arquivos expiram em uma hora. A revogação bloqueia na hora todos os links daquele arquivo.">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <TextField size="small" variant="outlined" value={file} onChange={(e) => setFile(e.target.value)} label="Nome do arquivo" style={{ flex: "1 1 240px" }} />
            <Button variant="outlined" style={{ height: 40 }} disabled={!file.trim()} onClick={async () => { try { await api.post("/operations/files/revoke", { filename: file.trim() }); setFile(""); toast.success("Acesso revogado."); } catch (err) { toastError(err); } }}>Revogar acesso</Button>
          </div>
        </SetCard>
      )}
    </>
  );
}
