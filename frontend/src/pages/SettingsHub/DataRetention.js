import React, { useCallback, useEffect, useState } from "react";
import { Button, FormControlLabel, Paper, Switch, TextField, Typography } from "@material-ui/core";
import { toast } from "react-toastify";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { ErrorState } from "../../components/ui";
import { confirmDialog } from "../../components/ConfirmDialog";

// Configurações > Retenção de dados (só o administrador). As duas regras começam desligadas: apagar não tem volta.
// A simulação mostra o que seria apagado, por polo e por tipo, sem apagar nada.
const TYPE = { text: "Textos", audio: "Áudios", image: "Imagens", video: "Vídeos", document: "Documentos" };
const when = (v) => (v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Porto_Velho", dateStyle: "short", timeStyle: "short" }) : "-");
const n = (v) => Number(v || 0).toLocaleString("pt-BR");

const card = { padding: 16, display: "grid", gap: 12, borderRadius: 16 };
const hint = { fontSize: 12.5, opacity: 0.75 };
const table = { width: "100%", borderCollapse: "collapse", fontSize: 13.5 };
const cell = { padding: "6px 8px", borderTop: "1px solid rgba(127,140,160,.25)", textAlign: "left" };
const num = { ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" };

const Rule = ({ title, sub, days, suggested, min, max, onSave, busy }) => {
  const [value, setValue] = useState(String(days || suggested));
  useEffect(() => { setValue(String(days || suggested)); }, [days, suggested]);
  const on = days > 0;
  const toggle = async (e) => {
    const checked = e.target.checked;
    if (checked) {
      const v = Math.round(Number(value) || suggested);
      if (!(await confirmDialog({ title: "Ligar a regra?", message: `Toda noite o sistema apaga o que tiver mais de ${v} dias. O que for apagado não pode ser recuperado.`, confirmText: "Ligar" }))) return;
      onSave(v);
    } else onSave(0);
  };
  return (
    <Paper variant="outlined" style={card}>
      <div>
        <Typography style={{ fontWeight: 700 }}>{title}</Typography>
        <div style={hint}>{sub}</div>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <TextField variant="outlined" size="small" type="number" label="Dias" value={value} style={{ width: 140 }}
          inputProps={{ min, max, step: 1 }} onChange={(e) => setValue(e.target.value)} disabled={busy} />
        {on && Number(value) !== days && (
          <Button variant="outlined" disabled={busy} onClick={async () => {
            const v = Math.round(Number(value));
            if (!(v >= min && v <= max)) { toast.error(`Use um número entre ${min} e ${max} dias.`); return; }
            if (await confirmDialog({ title: `Mudar para ${v} dias?`, message: `O que tiver mais de ${v} dias será apagado na próxima noite.`, confirmText: "Mudar" })) onSave(v);
          }}>Salvar dias</Button>
        )}
        <FormControlLabel style={{ margin: 0 }} control={<Switch color="primary" checked={on} disabled={busy} onChange={toggle} />} label={on ? `Ligada: ${days} dias` : "Desligada"} />
      </div>
      <div style={hint}>Sugestão inicial: {suggested} dias. Entre {min} e {max} dias.</div>
    </Paper>
  );
};

const Simulation = ({ data }) => {
  if (!data) return null;
  const { audio, conversations } = data;
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {audio && (
        <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
          <Typography style={{ fontWeight: 700 }}>Áudios com mais de {audio.days} dias: {n(audio.files)} arquivos</Typography>
          <div style={hint}>{n(audio.withTranscript)} com transcrição (o texto fica) e {n(audio.withoutTranscript)} sem transcrição (o conteúdo se perde).</div>
          {audio.byPolo.length === 0 ? <div style={hint}>Nada seria apagado.</div> : (
            <div style={{ overflowX: "auto" }}>
              <table style={table}>
                <thead><tr><th style={cell}>Polo</th><th style={num}>Arquivos</th><th style={num}>Com transcrição</th><th style={num}>Sem transcrição</th></tr></thead>
                <tbody>{audio.byPolo.map((r) => <tr key={`a-${r.poloId || 0}`}><td style={cell}>{r.polo}</td><td style={num}>{n(r.files)}</td><td style={num}>{n(r.withTranscript)}</td><td style={num}>{n(r.withoutTranscript)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {conversations && (
        <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
          <Typography style={{ fontWeight: 700 }}>Conversas encerradas e sem atividade há {conversations.days} dias: {n(conversations.conversations)} conversas, {n(conversations.messages)} mensagens</Typography>
          <div style={hint}>{Object.entries(TYPE).map(([k, label]) => `${label}: ${n(conversations.byType[k])}`).join(" · ")} · Arquivos: {n(conversations.files)}</div>
          <div style={hint}>Ficam de fora: {n(conversations.kept.openElsewhere)} conversas de contatos com outro atendimento aberto e {n(conversations.kept.pendingEnrollment)} de leads com matrícula esperando confirmação.</div>
          {conversations.byPolo.length === 0 ? <div style={hint}>Nada seria apagado.</div> : (
            <div style={{ overflowX: "auto" }}>
              <table style={table}>
                <thead><tr><th style={cell}>Polo</th><th style={num}>Conversas</th><th style={num}>Mensagens</th>{Object.values(TYPE).map((label) => <th key={label} style={num}>{label}</th>)}</tr></thead>
                <tbody>{conversations.byPolo.map((r) => (
                  <tr key={`c-${r.poloId || 0}`}><td style={cell}>{r.polo}</td><td style={num}>{n(r.conversations)}</td><td style={num}>{n(r.messages)}</td>{Object.keys(TYPE).map((k) => <td key={k} style={num}>{n(r[k])}</td>)}</tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default function DataRetention() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sim, setSim] = useState(null);
  const [simDays, setSimDays] = useState({ conversationDays: "", audioDays: "" });
  const [simulating, setSimulating] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    api.get("/data-retention").then(({ data: d }) => {
      setData(d);
      setSimDays({ conversationDays: String(d.conversationDays || d.suggested.conversationDays), audioDays: String(d.audioDays || d.suggested.audioDays) });
    }).catch((e) => { toastError(e); setFailed(true); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (patch) => {
    setBusy(true);
    try { const { data: d } = await api.put("/data-retention", patch); setData(d); toast.success("Regra de retenção salva."); } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  const simulate = async () => {
    setSimulating(true);
    try { const { data: d } = await api.post("/data-retention/simulate", { conversationDays: Number(simDays.conversationDays) || 0, audioDays: Number(simDays.audioDays) || 0 }); setSim(d); load(); } catch (e) { toastError(e); } finally { setSimulating(false); }
  };

  if (failed) return <ErrorState title="Não foi possível carregar a retenção de dados." text="Nada foi alterado. Tente de novo." onRetry={load} />;
  if (!data) return <Typography style={hint}>Carregando...</Typography>;
  const { min, max } = data.limits;

  return (
    <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
      <Paper variant="outlined" style={{ ...card, background: "rgba(220,38,38,.06)" }}>
        <Typography style={{ fontWeight: 700 }}>Apagar não tem volta</Typography>
        <div style={hint}>As regras começam desligadas. Antes de ligar, faça a simulação e confirme o prazo com a gestão e com a orientação jurídica (LGPD). Leads, matrículas, propostas, tarefas, histórico de atividades, revisões das conversas e dados acadêmicos nunca são apagados por aqui. Cópias de segurança do servidor seguem o próprio prazo delas.</div>
      </Paper>
      <Rule title="Áudios" sub="Apaga o arquivo dos áudios mais antigos que o prazo. A mensagem e a transcrição ficam." days={data.audioDays} suggested={data.suggested.audioDays} min={min} max={max} busy={busy} onSave={(v) => save({ audioDays: v })} />
      <Rule title="Conversas" sub="Em conversas encerradas e sem atividade no prazo, apaga o texto, a transcrição e os arquivos das mensagens. Fica só o registro de que a mensagem existiu. Nunca mexe em conversa aberta, de contato com outro atendimento aberto ou de lead com matrícula esperando confirmação." days={data.conversationDays} suggested={data.suggested.conversationDays} min={min} max={max} busy={busy} onSave={(v) => save({ conversationDays: v })} />

      <Paper variant="outlined" style={card}>
        <div>
          <Typography style={{ fontWeight: 700 }}>Simular</Typography>
          <div style={hint}>Conta o que seria apagado com estes prazos, por polo e por tipo. Nada é apagado. Use 0 para não simular uma das regras.</div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <TextField variant="outlined" size="small" type="number" label="Áudios (dias)" value={simDays.audioDays} style={{ width: 150 }} inputProps={{ min: 0, max }} onChange={(e) => { const v = e.target.value; setSimDays((cur) => ({ ...cur, audioDays: v })); }} />
          <TextField variant="outlined" size="small" type="number" label="Conversas (dias)" value={simDays.conversationDays} style={{ width: 150 }} inputProps={{ min: 0, max }} onChange={(e) => { const v = e.target.value; setSimDays((cur) => ({ ...cur, conversationDays: v })); }} />
          <Button variant="contained" color="primary" disabled={simulating} onClick={simulate} style={{ height: 40 }}>{simulating ? "Simulando..." : "Simular"}</Button>
        </div>
        <Simulation data={sim} />
      </Paper>

      <Paper variant="outlined" style={card}>
        <Typography style={{ fontWeight: 700 }}>Execuções</Typography>
        {data.runs.length === 0 ? <div style={hint}>Nenhuma execução nem simulação ainda.</div> : (
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead><tr><th style={cell}>Quando</th><th style={cell}>Tipo</th><th style={num}>Áudios</th><th style={num}>Conversas</th><th style={num}>Mensagens</th><th style={num}>Arquivos apagados</th><th style={cell}>Situação</th></tr></thead>
              <tbody>{data.runs.map((r) => (
                <tr key={r.id}>
                  <td style={cell}>{when(r.startedAt)}</td>
                  <td style={cell}>{r.mode === "simulation" ? "Simulação" : "Execução"}</td>
                  <td style={num}>{n(r.audioFiles)}</td>
                  <td style={num}>{n(r.conversations)}</td>
                  <td style={num}>{n(r.conversationMessages)}</td>
                  <td style={num}>{r.mode === "simulation" ? "-" : n(r.filesDeleted)}</td>
                  <td style={cell}>{r.error ? "Com erro (tenta de novo)" : r.finishedAt ? "Concluída" : "Em andamento"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Paper>
    </div>
  );
}
