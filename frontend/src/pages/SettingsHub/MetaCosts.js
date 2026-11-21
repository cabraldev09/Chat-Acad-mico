import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CircleDollarSign, RefreshCw } from "lucide-react";

import { BarsChart } from "../../components/charts";
import api from "../../services/api";
import toastError from "../../errors/toastError";

// Configurações → Custos da API oficial: what the Meta really charged (its own pricing analytics), by day, kind of message and number.
// The screen refreshes by itself every 5 minutes while open; "Atualizar agora" asks the Meta again.
const iso = (d) => d.toLocaleDateString("en-CA");
const PERIODS = [
  ["mes", "Este mês", () => { const d = new Date(); return [iso(new Date(d.getFullYear(), d.getMonth(), 1)), iso(d)]; }],
  ["hoje", "Hoje", () => [iso(new Date()), iso(new Date())]],
  ["7", "7 dias", () => [iso(new Date(Date.now() - 6 * 864e5)), iso(new Date())]],
  ["30", "30 dias", () => [iso(new Date(Date.now() - 29 * 864e5)), iso(new Date())]],
  ["anterior", "Mês passado", () => { const d = new Date(); return [iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), iso(new Date(d.getFullYear(), d.getMonth(), 0))]; }],
];
const card = { border: "1px solid var(--line-strong)", borderRadius: 12, background: "var(--surface)", padding: 16, boxShadow: "var(--shadow-card)", minWidth: 0 };
const cell = { padding: "8px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, textAlign: "left", fontVariantNumeric: "tabular-nums" };
const th = { ...cell, fontSize: 12, fontWeight: 700, color: "var(--text-2)", background: "var(--surface-2)" };

export default function MetaCosts() {
  const [period, setPeriod] = useState("mes");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (fresh) => {
    const [from, to] = PERIODS.find((p) => p[0] === period)[2]();
    setBusy(true);
    try { const { data: d } = await api.get("/meta/costs", { params: { from, to, ...(fresh ? { fresh: 1 } : {}) } }); setData(d); } catch (err) { toastError(err); }
    setBusy(false);
  }, [period]);
  useEffect(() => { setData(null); load(false); const t = setInterval(() => load(true), 5 * 60 * 1000); return () => clearInterval(t); }, [load]);

  const money = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: data?.currency || "USD" }).format(v || 0);
  const failing = (data?.accounts || []).filter((a) => !a.ok);
  const paid = data ? data.volume - data.freeVolume : 0;
  return (
    <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div className="ui-tabs" role="tablist" aria-label="Período" style={{ marginLeft: 0 }}>
          {PERIODS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={period === k} className={`ui-tabs__btn${period === k ? " is-on" : ""}`} onClick={() => setPeriod(k)}>{l}</button>)}
        </div>
        <span style={{ flex: 1 }} />
        {data && <span style={{ fontSize: 12, color: "var(--text-2)" }}>Lido na Meta às {new Date(data.updatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>}
        <button type="button" onClick={() => load(true)} disabled={busy} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--line-strong)", background: "var(--surface)", borderRadius: 8, padding: "6px 12px", font: "inherit", fontWeight: 600, cursor: "pointer" }}>
          <RefreshCw size={14} className={busy ? "ui-spin" : undefined} /> Atualizar agora
        </button>
      </div>

      {failing.map((a) => (
        <div key={`${a.wabaId}-${a.connections.join()}`} role="alert" style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(217,119,6,.4)", background: "rgba(217,119,6,.08)", fontSize: 13 }}>
          <AlertTriangle size={16} style={{ color: "#b45309", flex: "none", marginTop: 1 }} />
          <span><b>{a.connections.join(", ")}</b>: {a.error} <Link to="/connections">Abrir Conexões</Link></span>
        </div>
      ))}

      {!data ? <div style={{ color: "var(--text-2)", fontSize: 13 }}>Consultando a Meta…</div> : !data.accounts.length ? (
        <div style={{ ...card, color: "var(--text-2)", fontSize: 13.5 }}>Nenhuma conexão da API oficial. Os custos aparecem aqui quando houver um número da Meta em Conexões.</div>
      ) : (
        <>
          <div className="dash-stagger" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
            {[["Gasto no período", money(data.total), "var(--accent)"], ["Gasto hoje", money(data.today), "#0f766e"], ["Modelos cobrados", paid.toLocaleString("pt-BR"), "#0B4279"], ["Gratuitas (janela de 24 h)", data.freeVolume.toLocaleString("pt-BR"), "var(--text-3)"]].map(([l, v, tone]) => (
              <div key={l} className="ui-card" style={{ padding: 14, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-2)", fontSize: 12.5 }}><CircleDollarSign size={15} style={{ color: tone }} /> {l}</div>
                <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums", marginTop: 4, overflowWrap: "anywhere" }}>{v}</div>
              </div>
            ))}
          </div>
          {data.pricing && (
            <div style={card} aria-label="Como a Meta cobra">
              <div style={{ fontSize: 15, fontWeight: 700 }}>Como a Meta cobra</div>
              <ul style={{ margin: "8px 0 10px", paddingLeft: 18, fontSize: 13, display: "grid", gap: 4 }}>
                {data.pricing.rules.map((r) => <li key={r}>{r}</li>)}
              </ul>
              <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: 10 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={th}>Categoria</th><th style={th}>Tarifa por modelo ({data.pricing.country})</th><th style={th}>Modelos no período</th><th style={th}>Cobrado</th></tr></thead>
                  <tbody>
                    {data.pricing.rates.map((r) => {
                      const real = (data.byCategory || []).find((c) => String(c.category).toUpperCase() === r.category);
                      return (
                        <tr key={r.category}>
                          <td style={cell}><b>{r.label}</b><div style={{ fontSize: 12, color: "var(--text-2)", whiteSpace: "normal" }}>{r.note}</div></td>
                          <td style={cell}>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(r.usd)}</td>
                          <td style={cell}>{real ? real.volume.toLocaleString("pt-BR") : 0}</td>
                          <td style={{ ...cell, fontWeight: 700 }}>{money(real ? real.cost : 0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 6 }}>Tarifas de referência da tabela pública da Meta ({String(data.pricing.date).split("-").reverse().join("/")}), em dólar. Confira a tabela oficial antes de planejar campanhas; o valor cobrado de verdade é o que aparece nas colunas da Meta.</div>
            </div>
          )}
          {data.estimate && data.estimate.messages > 0 && (
            <div style={{ ...card, display: "grid", gap: 4 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Estimado pelo sistema × cobrado pela Meta</div>
              <div style={{ fontSize: 13 }}>
                O sistema estimou <b>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" }).format(data.estimate.usd)}</b> para {data.estimate.messages.toLocaleString("pt-BR")} envios no período (a tarifa de Operação e custos, usada no orçamento do dia); a Meta cobrou <b>{money(data.total)}</b>.
                {data.estimate.unpriced > 0 && <> {data.estimate.unpriced} envio(s) sem tarifa não entraram na estimativa.</>}
              </div>
              {!data.estimate.sameCurrency && <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>A conta da Meta cobra em {data.currency}: a comparação com a estimativa em dólar é só uma referência.</div>}
              {data.estimate.suggestedRate !== null && <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>Pelo que a Meta cobrou, a tarifa média real ficou em US$ {String(data.estimate.suggestedRate).replace(".", ",")} por envio. Se estiver muito diferente da tarifa salva, ajuste em Operação e custos.</div>}
            </div>
          )}
          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Gasto por dia</div>
            <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>Valores da própria Meta ({data.currency || "moeda da conta"}). A Meta consolida os números algumas vezes por hora.</div>
            {data.byDay.length ? (
              <div style={{ marginTop: 10 }} role="img" aria-label={`Gasto por dia: ${data.byDay.map((d) => `${d.date} ${money(d.cost)}`).join(", ")}`}>
                <BarsChart data={data.byDay.map((d) => ({ ...d, short: d.date.split("-").reverse().slice(0, 2).join("/") }))} xKey="short" keys={[["cost", "Gasto", "won"]]} height={180} />
              </div>
            ) : <div style={{ color: "var(--text-2)", fontSize: 13, marginTop: 10 }}>Sem cobranças no período.</div>}
          </div>
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
            {[["Por categoria", data.byCategory.map((c) => [c.category, c.label, c.volume, c.cost])], ["Por número", data.byNumber.map((n) => [n.phone, n.name, n.volume, n.cost])]].map(([title, rows]) => (
              <div key={title} style={card}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{title}</div>
                <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: 10 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr><th style={th}>{title === "Por número" ? "Número" : "Tipo"}</th><th style={th}>{title === "Por número" ? "Mensagens" : "Modelos"}</th><th style={th}>Gasto</th></tr></thead>
                    <tbody>
                      {rows.map(([k, l, v, c]) => <tr key={k}><td style={{ ...cell, overflowWrap: "anywhere" }}>{l}</td><td style={cell}>{v.toLocaleString("pt-BR")}</td><td style={{ ...cell, fontWeight: 700 }}>{money(c)}</td></tr>)}
                      {!rows.length && <tr><td colSpan={3} style={{ ...cell, color: "var(--text-2)" }}>Nada no período.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>
            Contas lidas: {data.accounts.filter((a) => a.ok).map((a) => `${a.name || a.wabaId} (${a.connections.join(", ")})`).join(" · ") || "nenhuma"}. As mensagens de atendimento dentro da janela de 24 h são gratuitas; modelos de marketing, utilidade e autenticação são cobrados por mensagem entregue.
          </div>
        </>
      )}
    </div>
  );
}
