import React, { useState } from "react";

import MetaCosts from "./MetaCosts";
import AiCosts from "./AiCosts";
import Operations from "./Operations";

// Configurações → Custos: the two bills of the system in one place (the Meta, for the official WhatsApp, and the AI), with
// what makes the Meta cheaper.
const TIPS = [
  "Responder dentro de 24 horas da última mensagem do aluno é gratuito: a conversa de atendimento não é cobrada.",
  "Fora das 24 horas, use os modelos de Utilidade (Configurações → Modelos da Meta): custam bem menos que Marketing, e o pacote do sistema já vai protegido para nunca virar Marketing.",
  "Modelo de Utilidade enviado com a janela de 24 horas aberta também é gratuito.",
  "Campanha para quem nunca respondeu sai sempre por modelo pago: prefira listas de quem já conversou.",
  "Botões de resposta nas mensagens (campanhas, retenção, agendadas) trazem a resposta mais rápido e abrem de novo a janela gratuita.",
  "Anúncio que leva direto ao WhatsApp dá 72 horas gratuitas para conversar com quem clicou.",
];

export default function Costs() {
  const [tab, setTab] = useState("meta");
  return (
    <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
      <div className="ui-tabs" role="tablist" aria-label="Custos" style={{ marginLeft: 0 }}>
        {[["meta", "WhatsApp oficial (Meta)"], ["ia", "IA (OpenAI e Anthropic)"], ["limites", "Limites de gasto"], ["dicas", "Como gastar menos"]].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`ui-tabs__btn${tab === k ? " is-on" : ""}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === "meta" && <MetaCosts onLimits={() => setTab("limites")} />}
      {tab === "ia" && <AiCosts />}
      {tab === "limites" && <Operations part="limites" />}
      {tab === "dicas" && (
        <div className="ui-card" style={{ padding: 16 }}>
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8, fontSize: 13.5 }}>
            {TIPS.map((t) => <li key={t}>{t}</li>)}
          </ul>
          <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 12 }}>
            Para travar o gasto, defina o orçamento diário da Meta e da IA na aba <button type="button" onClick={() => setTab("limites")} style={{ border: 0, background: "transparent", padding: 0, color: "var(--accent)", font: "inherit", fontWeight: 600, cursor: "pointer" }}>Limites de gasto</button>.
          </div>
        </div>
      )}
    </div>
  );
}
