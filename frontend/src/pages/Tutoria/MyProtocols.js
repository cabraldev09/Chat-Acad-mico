import React, { useCallback, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { Button, CircularProgress } from "@material-ui/core";
import { Check, ClipboardList, MessageSquare, Plus } from "lucide-react";

import api from "../../services/api";
import { ErrorState } from "../../components/ui";
import { ProtocolDialog, ResolveDialog } from "../../components/TutorProtocols";

// The tutor's protocols: what is waiting for a protocol, the protocols open and the ones solved in the last 30 days. Simple: the number,
// the subject, tell the student, mark it solved. Everything stays in the student's history.
const TONE = { aberta: "#d97706", registrada: "#0369a1", resolvida: "#15803d" };
const LABEL = { aberta: "Falta o protocolo", registrada: "Aberto", resolvida: "Resolvido" };
const card = { border: "1px solid var(--line)", borderLeft: "4px solid var(--tone)", borderRadius: 12, background: "var(--surface)", padding: 14, display: "grid", gap: 8, minWidth: 0 };
const btn = { textTransform: "none", borderRadius: 8, minHeight: 36, fontWeight: 600 };

export default function MyProtocols() {
  const history = useHistory();
  const [items, setItems] = useState(null);
  const [failed, setFailed] = useState(false);
  const [dialog, setDialog] = useState(null);
  const load = useCallback(() => {
    setFailed(false);
    api.get("/tutoria/protocols").then(({ data }) => setItems(data.items || [])).catch(() => setFailed(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (failed && !items) return <ErrorState title="Não foi possível carregar os protocolos." onRetry={load} />;
  if (!items) return <div style={{ textAlign: "center", padding: 32 }}><CircularProgress size={24} /></div>;
  const open = items.filter((i) => i.status !== "resolvida");
  const done = items.filter((i) => i.status === "resolvida");
  return (
    <div style={{ display: "grid", gap: 12, paddingBottom: 16 }}>
      <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.5 }}>
        Registre o número e o assunto de cada chamado aberto para o aluno. O aluno pode ser avisado pela conversa e tudo fica no histórico dele.
        Para registrar um protocolo novo, abra a conversa do aluno e use Mais ações, Registrar protocolo.
      </div>
      {open.length === 0 && (
        <div style={{ textAlign: "center", padding: "28px 12px", border: "1px dashed var(--line-strong)", borderRadius: 12, color: "var(--text-2)", fontSize: 13.5 }}>
          Nenhum protocolo em aberto.
        </div>
      )}
      {[...open, ...done].map((i) => (
        <article key={i.id} style={{ ...card, "--tone": TONE[i.status] || "#64748b" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
            <ClipboardList size={16} />
            <b style={{ color: "var(--tone)" }}>{LABEL[i.status]}</b>
            {i.student && <span style={{ fontWeight: 650 }}>· {i.student}</span>}
            <span style={{ marginLeft: "auto", color: "var(--text-2)", fontSize: 12.5 }}>{new Date(i.resolvedAt || i.at).toLocaleDateString("pt-BR")}</span>
          </div>
          <div style={{ fontSize: 14.5, lineHeight: 1.5, overflowWrap: "anywhere" }}>
            {i.protocolNumber ? <><b>Protocolo {i.protocolNumber}</b>{i.protocolName ? ` · ${i.protocolName}` : ""}</> : i.summary}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {i.status === "aberta" && <Button size="small" variant="contained" color="primary" disableElevation style={btn} startIcon={<Plus size={14} />} onClick={() => setDialog({ kind: "register", issue: i })}>Registrar protocolo</Button>}
            {i.status === "registrada" && <Button size="small" variant="outlined" style={btn} startIcon={<Check size={14} />} onClick={() => setDialog({ kind: "resolve", issue: i })}>Resolvido</Button>}
            {i.ticketId && <Button size="small" style={btn} startIcon={<MessageSquare size={14} />} onClick={() => history.push(`/tickets/${i.ticketId}`)}>Abrir a conversa</Button>}
          </div>
        </article>
      ))}
      <ProtocolDialog open={!!dialog && dialog.kind === "register"} onClose={() => setDialog(null)} ticketId={dialog && dialog.issue && dialog.issue.ticketId} issue={dialog && dialog.issue} onDone={load} />
      <ResolveDialog open={!!dialog && dialog.kind === "resolve"} onClose={() => setDialog(null)} issue={dialog && dialog.issue} onDone={load} />
    </div>
  );
}
