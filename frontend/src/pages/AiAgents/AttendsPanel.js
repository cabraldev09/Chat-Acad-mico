import React, { useEffect, useMemo, useState } from "react";
import { Chip, Switch } from "@material-ui/core";
import { Check } from "lucide-react";
import { toast } from "react-toastify";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { Section } from "../../components/ui";

// Where the agent answers and whether it is on, in one place: the connections it serves (the same agent can serve several: the number of the QR Code
// and the one of the official API) and the switch. Nothing here needs another agent.
export default function AttendsPanel({ agentId, agent, active, flow, onToggle, onOpenFlow, onChanged }) {
  const [connections, setConnections] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/whatsapp").then(({ data }) => setConnections(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  const chosen = useMemo(
    () => [...new Set([agent && agent.whatsappId, ...((agent && agent.whatsappIds) || [])].filter(Boolean).map(Number))],
    [agent]
  );

  const pick = async (id) => {
    const next = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id];
    setSaving(true);
    try {
      await api.put(`/ai-agents/${agentId}`, { whatsappIds: next, whatsappId: null });
      toast.success(next.length ? "Conexões do agente salvas." : "Agora o agente atende as conexões que não têm outro agente.");
      onChanged && onChanged();
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };

  const unpublished = flow && flow.status !== "published";

  return (
    <Section title="Onde o agente atende" hint="Ligue o agente e escolha em quais conexões ele responde. O mesmo agente pode atender várias, sem criar outro.">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <Switch color="primary" checked={!!active} onChange={onToggle} />
        <div>
          <b>{active ? "Ligado" : "Desligado"}</b>
          <div style={{ fontSize: 13, opacity: 0.75 }}>{active ? "O agente responde as conversas das conexões abaixo." : "Desligado, o agente não responde ninguém."}</div>
        </div>
      </div>
      {unpublished && (
        <div style={{ fontSize: 13, color: "#b45309", marginBottom: 12 }}>
          O roteiro da conversa ainda está em edição.{" "}
          <button type="button" onClick={onOpenFlow} style={{ border: 0, background: "none", padding: 0, color: "inherit", fontWeight: 700, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit" }}>Abrir o roteiro para publicar</button>
        </div>
      )}
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Conexões em que atende</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {connections.map((c) => {
          const on = chosen.includes(Number(c.id));
          return (
            <Chip
              key={c.id}
              clickable
              disabled={saving}
              color={on ? "primary" : "default"}
              variant={on ? "default" : "outlined"}
              icon={on ? <Check size={14} style={{ marginLeft: 8 }} /> : undefined}
              label={c.name}
              onClick={() => pick(Number(c.id))}
            />
          );
        })}
        {!connections.length && <span style={{ fontSize: 13, opacity: 0.75 }}>Nenhuma conexão cadastrada.</span>}
      </div>
      <div style={{ fontSize: 13, opacity: 0.75, marginTop: 10 }}>
        {chosen.length
          ? `Atende só as conexões marcadas (${chosen.length}).`
          : "Nenhuma marcada: atende todas as conexões que não têm outro agente. Marque uma ou mais para limitar."}
      </div>
    </Section>
  );
}
