import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, AlertTriangle, AlertCircle, RefreshCw, ArrowRight } from "lucide-react";

import api from "../../services/api";
import toastError from "../../errors/toastError";

// Configurações → Prontidão do sistema: what is still missing before the team works on the system, each item saying where to fix it
const card = { border: "1px solid var(--line-strong)", borderRadius: 12, background: "var(--surface)", padding: 16, boxShadow: "var(--shadow-card)", minWidth: 0 };

// where each item is fixed: the button goes straight there
const FIX = {
  ai: ["/ai-agents?abrir=chave", "Cadastrar a chave"],
  numbers: ["/connections", "Abrir Conexões"],
  token: ["/connections", "Abrir Conexões"],
  tutoria: ["/configuracoes?secao=tutoria", "Informar o número"],
  templates_allowed: ["/configuracoes?secao=operacao", "Autorizar o envio"],
  templates: ["/configuracoes?secao=modelos", "Enviar os modelos"],
  efi: ["/configuracoes?secao=pagamentos", "Abrir Pagamentos"],
  mail: ["/configuracoes?secao=email", "Configurar o e-mail"],
  hours: ["/configuracoes?secao=atendimento", "Definir o horário"],
  polos: ["/polos", "Abrir Polos"],
};
const btn = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 34, boxSizing: "border-box", border: "1px solid var(--line-strong)", background: "var(--surface)", borderRadius: 8, padding: "0 12px", font: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "inherit", textDecoration: "none", whiteSpace: "nowrap", flex: "none" };

export default function Readiness() {
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try { const { data } = await api.get("/system/readiness"); setItems(data.items || []); } catch (err) { toastError(err); }
    setBusy(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!items) return <div style={{ fontSize: 13, color: "var(--text-2)" }}>Conferindo...</div>;

  const pending = items.filter((i) => !i.ok);
  const required = pending.filter((i) => i.level === "required");
  return (
    <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
      <div style={{ ...card, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {required.length ? <AlertCircle size={22} color="#b91c1c" /> : pending.length ? <AlertTriangle size={22} color="#b45309" /> : <CheckCircle2 size={22} color="#15803d" />}
        <div style={{ flex: "1 1 220px" }}>
          <div style={{ fontWeight: 700 }}>{required.length ? `Faltam ${required.length} ${required.length === 1 ? "ajuste obrigatório" : "ajustes obrigatórios"} antes de o time usar o sistema` : pending.length ? "Pronto para o time usar, com recomendações" : "Tudo pronto para o time usar"}</div>
          <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>{items.length - pending.length} de {items.length} itens conferidos estão em ordem. Clique no botão de cada item para ir direto ao lugar de resolver.</div>
        </div>
        <button type="button" onClick={load} disabled={busy} style={btn}>
          <RefreshCw size={14} className={busy ? "ui-spin" : undefined} /> Conferir de novo
        </button>
      </div>
      {[...pending.sort((a, b) => (a.level === b.level ? 0 : a.level === "required" ? -1 : 1)), ...items.filter((i) => i.ok)].map((i) => (
        <div key={i.key} style={{ ...card, padding: "12px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {i.ok ? <CheckCircle2 size={18} color="#15803d" style={{ flex: "none", alignSelf: "flex-start", marginTop: 2 }} /> : i.level === "required" ? <AlertCircle size={18} color="#b91c1c" style={{ flex: "none", alignSelf: "flex-start", marginTop: 2 }} /> : <AlertTriangle size={18} color="#b45309" style={{ flex: "none", alignSelf: "flex-start", marginTop: 2 }} />}
          <div style={{ minWidth: 0, flex: "1 1 260px" }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{i.label}{!i.ok && <span style={{ fontWeight: 500, fontSize: 12, color: "var(--text-2)" }}> · {i.level === "required" ? "obrigatório" : "recomendado"}</span>}</div>
            <div style={{ fontSize: 13, color: "var(--text-2)", overflowWrap: "anywhere" }}>{i.detail}</div>
            {!i.ok && <div style={{ fontSize: 12.5, marginTop: 2, color: "var(--text-2)" }}>Onde resolver: {i.where}</div>}
          </div>
          {!i.ok && FIX[i.key] && <Link to={FIX[i.key][0]} style={{ ...btn, color: "var(--accent)" }}>{FIX[i.key][1]} <ArrowRight size={14} /></Link>}
        </div>
      ))}
    </div>
  );
}
