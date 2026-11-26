import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, AlertTriangle, AlertCircle, RefreshCw, ArrowRight, ChevronDown } from "lucide-react";

import { toast } from "react-toastify";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { confirmDialog } from "../../components/ConfirmDialog";

// Configurações → Prontidão do sistema: what is still missing before the team works on the system, each item saying where to fix it
const card = { border: "1px solid var(--line-strong)", borderRadius: 12, background: "var(--surface)", padding: 16, boxShadow: "var(--shadow-card)", minWidth: 0 };

// where each item is fixed: the button goes straight there
const FIX = {
  ai: ["/ai-agents?abrir=chave", "Cadastrar a chave"],
  numbers: ["/connections", "Abrir Conexões"],
  webhook: ["/connections", "Corrigir a chave secreta"],
  token: ["/connections", "Abrir Conexões"],
  tutoria: ["/configuracoes?secao=tutoria", "Informar o número"],
  templates_allowed: ["/configuracoes?secao=modelos", "Autorizar o envio"],
  templates: ["/configuracoes?secao=modelos", "Enviar os modelos"],
  efi: ["/configuracoes?secao=pagamentos", "Abrir Pagamentos"],
  mail: ["/configuracoes?secao=email", "Configurar o e-mail"],
  hours: ["/configuracoes?secao=horario", "Definir o horário"],
  polos: ["/polos", "Abrir Polos"],
  users_hours: ["/users", "Abrir Usuários"],
  users_number: ["/users", "Abrir Usuários"],
  affiliates_owner: ["/afiliados", "Abrir Afiliados"],
};
const btn = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 34, boxSizing: "border-box", border: "1px solid var(--line-strong)", background: "var(--surface)", borderRadius: 8, padding: "0 12px", font: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "inherit", textDecoration: "none", whiteSpace: "nowrap", flex: "none" };

export default function Readiness() {
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [openDetail, setOpenDetail] = useState({});
  const load = useCallback(async () => {
    setBusy(true);
    try { const { data } = await api.get("/system/readiness"); setItems(data.items || []); } catch (err) { toastError(err); }
    setBusy(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  // the affiliates that entered the funnel as leads go out of it (never a student or a lead with a paid charge)
  const cleanAffiliateLeads = async () => {
    if (!(await confirmDialog({ title: "Tirar os afiliados do funil?", message: "Só saem os que não têm matrícula nem pagamento. As conversas continuam.", confirmText: "Tirar do funil" }))) return;
    try { const { data } = await api.post("/system/affiliate-leads/clean"); toast.success(`${data.removed} afiliado(s) saíram do funil.`); load(); } catch (err) { toastError(err); }
  };
  if (!items) return <div style={{ fontSize: 13, color: "var(--text-2)" }}>Conferindo...</div>;

  const pending = items.filter((i) => !i.ok);
  const required = pending.filter((i) => i.level === "required");
  const recommended = pending.filter((i) => i.level !== "required");
  const done = items.filter((i) => i.ok);
  const share = items.length ? Math.round((done.length / items.length) * 100) : 100;
  const tone = required.length ? "#b91c1c" : pending.length ? "#b45309" : "#15803d";

  const Row = ({ i }) => {
    const fix = FIX[i.key];
    const long = String(i.detail || "").length > 160;
    const open = !!openDetail[i.key];
    return (
      <div style={{ ...card, padding: "12px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {i.ok ? <CheckCircle2 size={18} color="#15803d" style={{ flex: "none", alignSelf: "flex-start", marginTop: 2 }} /> : i.level === "required" ? <AlertCircle size={18} color="#b91c1c" style={{ flex: "none", alignSelf: "flex-start", marginTop: 2 }} /> : <AlertTriangle size={18} color="#b45309" style={{ flex: "none", alignSelf: "flex-start", marginTop: 2 }} />}
        <div style={{ minWidth: 0, flex: "1 1 260px" }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{i.label}</div>
          <div style={{ fontSize: 13, color: "var(--text-2)", overflowWrap: "anywhere", ...(long && !open ? { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } : {}) }}>{i.detail}</div>
          {long && <button type="button" onClick={() => setOpenDetail((o) => ({ ...o, [i.key]: !o[i.key] }))} style={{ border: 0, background: "transparent", padding: 0, marginTop: 2, color: "var(--accent)", font: "inherit", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{open ? "Ver menos" : "Ver tudo"}</button>}
          {!i.ok && !fix && i.key !== "affiliate_leads" && <div style={{ fontSize: 12.5, marginTop: 2, color: "var(--text-2)" }}>Onde resolver: {i.where}</div>}
        </div>
        {!i.ok && fix && <Link to={fix[0]} style={{ ...btn, color: "var(--accent)" }}>{fix[1]} <ArrowRight size={14} /></Link>}
        {!i.ok && i.key === "affiliate_leads" && <button type="button" onClick={cleanAffiliateLeads} style={{ ...btn, color: "var(--accent)" }}>Tirar do funil</button>}
      </div>
    );
  };
  const Group = ({ title, list }) => (list.length ? (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-2)", marginTop: 4 }}>{title} · {list.length}</div>
      {list.map((i) => <Row key={i.key} i={i} />)}
    </div>
  ) : null);

  return (
    <div style={{ display: "grid", gap: 14, minWidth: 0 }}>
      <div style={{ ...card, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {required.length ? <AlertCircle size={22} color={tone} /> : pending.length ? <AlertTriangle size={22} color={tone} /> : <CheckCircle2 size={22} color={tone} />}
          <div style={{ flex: "1 1 220px", minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>{required.length ? `Faltam ${required.length} ${required.length === 1 ? "ajuste obrigatório" : "ajustes obrigatórios"} antes de o time usar o sistema` : pending.length ? "Pronto para o time usar, com recomendações" : "Tudo pronto para o time usar"}</div>
            <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>{done.length} de {items.length} itens em ordem. O botão de cada item leva direto ao lugar de resolver.</div>
          </div>
          <button type="button" onClick={load} disabled={busy} style={btn}>
            <RefreshCw size={14} className={busy ? "ui-spin" : undefined} /> Conferir de novo
          </button>
        </div>
        <div role="progressbar" aria-valuenow={share} aria-valuemin={0} aria-valuemax={100} aria-label="Itens em ordem" style={{ height: 8, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden" }}>
          <div style={{ width: `${share}%`, height: "100%", borderRadius: 999, background: tone, transition: "width .4s ease" }} />
        </div>
      </div>
      <Group title="Obrigatórios" list={required} />
      <Group title="Recomendados" list={recommended} />
      {done.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          <button type="button" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone} style={{ ...btn, justifyContent: "space-between", width: "100%", height: 40, color: "var(--text-1)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><CheckCircle2 size={16} color="#15803d" />{done.length} {done.length === 1 ? "item em ordem" : "itens em ordem"}</span>
            <ChevronDown size={16} style={{ transform: showDone ? "rotate(180deg)" : "none", transition: "transform .2s ease" }} />
          </button>
          {showDone && done.map((i) => <Row key={i.key} i={i} />)}
        </div>
      )}
    </div>
  );
}
