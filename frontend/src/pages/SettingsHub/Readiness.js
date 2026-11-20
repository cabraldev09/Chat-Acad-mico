import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, AlertCircle, RefreshCw } from "lucide-react";

import api from "../../services/api";
import toastError from "../../errors/toastError";

// Configurações → Prontidão do sistema: what is still missing before the team works on the system, each item saying where to fix it
const card = { border: "1px solid var(--line-strong)", borderRadius: 12, background: "var(--surface)", padding: 16, boxShadow: "var(--shadow-card)", minWidth: 0 };

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
          <div style={{ fontWeight: 700 }}>{required.length ? `${required.length} item(ns) obrigatório(s) pendente(s)` : pending.length ? "Pronto para o time, com recomendações" : "Tudo pronto para o time"}</div>
          <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>{items.length - pending.length} de {items.length} itens em ordem.</div>
        </div>
        <button type="button" onClick={load} disabled={busy} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--line-strong)", background: "var(--surface)", borderRadius: 8, padding: "6px 12px", font: "inherit", fontWeight: 600, cursor: "pointer", color: "inherit" }}>
          <RefreshCw size={14} className={busy ? "ui-spin" : undefined} /> Conferir de novo
        </button>
      </div>
      {[...pending.sort((a, b) => (a.level === b.level ? 0 : a.level === "required" ? -1 : 1)), ...items.filter((i) => i.ok)].map((i) => (
        <div key={i.key} style={{ ...card, padding: "12px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
          {i.ok ? <CheckCircle2 size={18} color="#15803d" style={{ flex: "none", marginTop: 2 }} /> : i.level === "required" ? <AlertCircle size={18} color="#b91c1c" style={{ flex: "none", marginTop: 2 }} /> : <AlertTriangle size={18} color="#b45309" style={{ flex: "none", marginTop: 2 }} />}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{i.label}{!i.ok && <span style={{ fontWeight: 500, fontSize: 12, color: "var(--text-2)" }}> · {i.level === "required" ? "obrigatório" : "recomendado"}</span>}</div>
            <div style={{ fontSize: 13, color: "var(--text-2)", overflowWrap: "anywhere" }}>{i.detail}</div>
            {!i.ok && <div style={{ fontSize: 12.5, marginTop: 2 }}>Onde resolver: <b>{i.where}</b></div>}
          </div>
        </div>
      ))}
    </div>
  );
}
