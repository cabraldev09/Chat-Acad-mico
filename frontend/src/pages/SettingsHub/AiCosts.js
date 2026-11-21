import React, { useCallback, useEffect, useState } from "react";
import { Bot } from "lucide-react";

import { BarsChart, ProgressBar } from "../../components/charts";
import api from "../../services/api";
import toastError from "../../errors/toastError";

// Configurações → Custos → IA: what the AI (OpenAI and Anthropic) spent, from the usage recorded on every call. The value
// is an estimate made with the prices typed in Agentes de IA → Uso; a model without a price counts its tokens only.
const PERIODS = [[1, "Hoje"], [7, "7 dias"], [30, "30 dias"], [90, "90 dias"]];
const card = { border: "1px solid var(--line-strong)", borderRadius: 12, background: "var(--surface)", padding: 16, boxShadow: "var(--shadow-card)", minWidth: 0 };
const cell = { padding: "8px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, textAlign: "left", fontVariantNumeric: "tabular-nums" };
const th = { ...cell, fontSize: 12, fontWeight: 700, color: "var(--text-2)", background: "var(--surface-2)" };
const usd = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: v && v < 1 ? 4 : 2 }).format(v || 0);
const num = (v) => Number(v || 0).toLocaleString("pt-BR");

export default function AiCosts() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    setFailed(false);
    try { const { data: d } = await api.get("/operations/ai-costs", { params: { days } }); setData(d); } catch (err) { setFailed(true); toastError(err); }
  }, [days]);
  useEffect(() => { setData(null); load(); }, [load]);
  // the budget of the month (OpenAI has no API for the remaining credit: the manager types it)
  const [budgetText, setBudgetText] = useState("");
  const [savingBudget, setSavingBudget] = useState(false);
  useEffect(() => { if (data) setBudgetText(data.budget ? String(data.budget.limit) : ""); }, [data]);
  const saveBudget = async () => {
    const value = String(budgetText || "0").replace(",", ".").trim();
    setSavingBudget(true);
    try { await api.put("/operations/config", { ai_monthly_budget_usd: value || "0" }); await load(); } catch (err) { toastError(err); }
    setSavingBudget(false);
  };

  return (
    <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
      <div className="ui-tabs" role="tablist" aria-label="Período da IA" style={{ marginLeft: 0 }}>
        {PERIODS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={days === k} className={`ui-tabs__btn${days === k ? " is-on" : ""}`} onClick={() => setDays(k)}>{l}</button>)}
      </div>
      {failed ? (
        <div style={{ color: "var(--text-2)", fontSize: 13 }}>Não foi possível somar o uso da IA agora. <button type="button" onClick={load} style={{ border: 0, background: "none", color: "var(--accent)", font: "inherit", fontWeight: 600, cursor: "pointer", padding: 0 }}>Tentar de novo</button></div>
      ) : !data ? <div style={{ color: "var(--text-2)", fontSize: 13 }}>Somando o uso da IA…</div> : (
        <>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
            {[
              ["Gasto estimado", usd(data.total.usd)],
              ...data.byProvider.map((p) => [p.label, usd(p.usd)]),
              ["Chamadas", num(data.total.calls)],
              ["Tokens", num(data.total.tokens)],
            ].map(([l, v]) => (
              <div key={l} className="ui-card" style={{ padding: 14, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-2)", fontSize: 12.5 }}><Bot size={15} /> {l}</div>
                <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums", marginTop: 4, overflowWrap: "anywhere" }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            <div style={card} aria-label="Orçamento do mês">
              <div style={{ fontSize: 15, fontWeight: 700 }}>Orçamento do mês</div>
              {data.budget ? (
                <>
                  <div style={{ fontSize: 13, marginTop: 6 }}>
                    Usado <b>{usd(data.budget.spent)}</b> de {usd(data.budget.limit)} ({Math.round(data.budget.pct)}%). Restam <b>{usd(data.budget.remaining)}</b>.
                  </div>
                  <div style={{ marginTop: 8 }}><ProgressBar value={Math.min(data.budget.spent, data.budget.limit)} max={data.budget.limit} color={data.budget.pct >= 100 ? "lost" : data.budget.warn ? "warn" : "won"} height={8} /></div>
                  <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 6 }}>{data.budget.source === "real" ? "Com o valor cobrado pela OpenAI (e o estimado da Anthropic)." : "Com o valor estimado pelo sistema."} Aviso aos 80% na tela e no e-mail diário.</div>
                </>
              ) : <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 6 }}>A OpenAI não informa o saldo por API. Informe o crédito ou orçamento do mês para ver quanto ainda tem e receber o aviso aos 80%.</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "stretch" }}>
                <input aria-label="Orçamento do mês em dólares" inputMode="decimal" placeholder="Ex.: 50" value={budgetText} onChange={(e) => setBudgetText(e.target.value)} style={{ flex: "1 1 120px", minWidth: 0, height: 36, boxSizing: "border-box", border: "1px solid var(--line-strong)", borderRadius: 8, padding: "0 10px", font: "inherit", background: "var(--surface)", color: "var(--text-1)" }} />
                <button type="button" onClick={saveBudget} disabled={savingBudget} style={{ height: 36, border: 0, borderRadius: 8, padding: "0 14px", background: "var(--accent)", color: "#fff", font: "inherit", fontWeight: 600, cursor: "pointer" }}>{savingBudget ? "Salvando…" : "Salvar orçamento (US$)"}</button>
              </div>
            </div>
            <div style={card} aria-label="Cobrado pela OpenAI">
              <div style={{ fontSize: 15, fontWeight: 700 }}>Cobrado pela OpenAI</div>
              {!data.real ? (
                <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 6 }}>Para ver o valor real da fatura, cadastre a chave de administrador da OpenAI em Agentes de IA, Chave de IA. Sem ela, o gasto acima é a estimativa do sistema.</div>
              ) : !data.real.ok ? (
                <div role="status" style={{ fontSize: 13, color: "#b45309", marginTop: 6 }}>{data.real.error}</div>
              ) : (
                <>
                  <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums", marginTop: 4 }}>{usd(data.real.usd)}</div>
                  <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>No mesmo período, lido na própria OpenAI. A estimativa do sistema para os modelos da OpenAI fica na tabela por modelo.</div>
                </>
              )}
            </div>
          </div>
          {data.total.unpriced > 0 && (
            <div role="status" style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(217,119,6,.4)", background: "rgba(217,119,6,.08)", fontSize: 13 }}>
              {num(data.total.unpriced)} {data.total.unpriced === 1 ? "chamada é de um modelo" : "chamadas são de modelos"} sem preço cadastrado: entram nos tokens, não no valor. Informe o preço em Agentes de IA → Uso.
            </div>
          )}
          {days > 1 && (
            <div style={card}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Gasto por dia</div>
              {data.byDay.length ? (
                <div style={{ marginTop: 10 }} role="img" aria-label={`Gasto da IA por dia: ${data.byDay.map((d) => `${d.key} ${usd(d.usd)}`).join(", ")}`}>
                  <BarsChart data={data.byDay.map((d) => ({ ...d, short: d.key.split("-").reverse().slice(0, 2).join("/") }))} xKey="short" keys={[["usd", "Gasto", "won"]]} height={180} />
                </div>
              ) : <div style={{ color: "var(--text-2)", fontSize: 13, marginTop: 10 }}>Sem uso no período.</div>}
            </div>
          )}
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
            {[["Por uso", data.byKind], ["Por modelo", data.byModel]].map(([title, rows]) => (
              <div key={title} style={card}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{title}</div>
                <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: 10 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr><th style={th}>{title === "Por modelo" ? "Modelo" : "Uso"}</th><th style={th}>Chamadas</th><th style={th}>Tokens</th><th style={th}>Gasto</th></tr></thead>
                    <tbody>
                      {rows.map((r) => <tr key={r.key}><td style={{ ...cell, overflowWrap: "anywhere" }}>{r.label}</td><td style={cell}>{num(r.calls)}</td><td style={cell}>{num(r.tokens)}</td><td style={{ ...cell, fontWeight: 700 }}>{usd(r.usd)}</td></tr>)}
                      {!rows.length && <tr><td colSpan={4} style={{ ...cell, color: "var(--text-2)" }}>Nada no período.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
          {data.prices && data.prices.length > 0 && (
            <div style={card}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Preço usado por modelo (US$ por milhão de tokens)</div>
              <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: 10 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={th}>Modelo</th><th style={th}>Entrada</th><th style={th}>Saída</th><th style={th}>Origem</th></tr></thead>
                  <tbody>
                    {data.prices.map((p) => <tr key={p.model}><td style={{ ...cell, overflowWrap: "anywhere" }}>{p.model}</td><td style={cell}>{p.in !== undefined ? usd(p.in) : "-"}</td><td style={cell}>{p.out !== undefined ? usd(p.out) : "-"}</td><td style={cell}>{p.source === "cadastrado" ? "Cadastrado pela equipe" : p.source === "padrão" ? `Referência (${String(data.pricesDate || "").split("-").reverse().join("/")})` : "Sem preço"}</td></tr>)}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 6 }}>O preço de referência vem da tabela pública do fornecedor e pode mudar. Para usar outro, cadastre em Agentes de IA, Uso.</div>
            </div>
          )}
          <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>
            Valores estimados pelo sistema com os preços cadastrados (a fatura oficial fica no painel da OpenAI e da Anthropic).
            {data.caps.dailyUsd > 0 ? ` Limite diário: ${usd(data.caps.dailyUsd)}.` : " Sem limite diário em US$."}
            {data.caps.dailyTokens > 0 ? ` Limite de ${num(data.caps.dailyTokens)} tokens por dia.` : ""} Os limites ficam em Operação.
          </div>
        </>
      )}
    </div>
  );
}
