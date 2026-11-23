import React, { useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useChartTheme } from "../../components/charts";
import { AlertTriangle, Building2, CheckCircle2, Gauge, MapPin, RefreshCw, Workflow, Users } from "lucide-react";
import api from "../../services/api";

import { ErrorState } from "../../components/ui";
import { Insights, SlaBar, hm, useShared } from "./shared";

const Kpi = ({ label, value, note, tone }) => (
  <div style={{ padding: "16px 18px" }}>
    <div style={{ fontSize: 12.5, opacity: 0.7, fontWeight: 500 }}>{label}</div>
    <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.035em", marginTop: 6, fontVariantNumeric: "tabular-nums", color: tone }}>{value}</div>
    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{note}</div>
  </div>
);

// Management: every department, attendant and polo side by side, with response times that do not lie (median, P90, share on time)
export const ManagementFeedback = ({ date, days, unavailableMessage }) => {
  const c = useShared();
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    requestId.current += 1;
    setFeedback(null);
    setLoading(false);
    setError(false);
    setCooldown(false);
    return () => { requestId.current += 1; };
  }, [date, days]);

  useEffect(() => {
    const generatedAt = feedback && feedback.source && feedback.source.generatedAt;
    if (!generatedAt) {
      setCooldown(false);
      return undefined;
    }
    const cacheMs = Number(feedback.source.cacheSeconds || 300) * 1000;
    const remaining = Date.parse(generatedAt) + cacheMs - Date.now();
    if (remaining <= 0) {
      setCooldown(false);
      return undefined;
    }
    setCooldown(true);
    const timer = window.setTimeout(() => setCooldown(false), remaining);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const generate = async () => {
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setLoading(true);
    setError(false);
    setFeedback(null);
    try {
      // Send only the selected reporting period; the backend builds the feedback from aggregate metrics.
      const { data: result } = await api.post("/dashboard/management/feedback", {
        ...(date ? { date } : {}),
        days,
      });
      const hasPoloContract = result && Array.isArray(result.feedback) && result.period;
      const hasPreviousContract = result && typeof result.summary === "string" && Array.isArray(result.risks);
      if (!hasPoloContract && !hasPreviousContract) throw new Error("Resposta de feedback vazia ou inválida");
      if (requestId.current === currentRequest) setFeedback(result);
    } catch (_) {
      if (requestId.current === currentRequest) setError(true);
    } finally {
      if (requestId.current === currentRequest) setLoading(false);
    }
  };

  return (
    <section className={c.panel} aria-labelledby="management-feedback-title">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: "1 1 260px" }}>
          <h2 id="management-feedback-title" className={c.title}><Workflow size={16} /> Feedback gerencial com IA</h2>
          <div className={c.sub}>Leitura agregada dos polos no período. As recomendações são orientativas; confirme os indicadores antes de agir. Não envia mensagens nem altera leads.</div>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={loading || cooldown || !!unavailableMessage}
          aria-busy={loading}
          style={{ border: 0, borderRadius: 9, padding: "9px 14px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#0b4279", color: "#fff", font: "inherit", fontSize: 13, fontWeight: 650, cursor: loading ? "wait" : cooldown ? "default" : "pointer", opacity: loading || cooldown ? 0.75 : 1, flex: "0 0 auto" }}
        >
          {loading ? <RefreshCw size={15} className="ui-spin" aria-hidden="true" /> : <Workflow size={15} aria-hidden="true" />}
          {loading ? "Gerando feedback…" : cooldown ? "Feedback atualizado" : unavailableMessage ? "Período indisponível" : feedback ? "Gerar novamente" : "Gerar feedback com IA"}
        </button>
      </div>

      {unavailableMessage && <div role="status" className={c.sub} style={{ marginTop: 12 }}>{unavailableMessage}</div>}

      {loading && <div role="status" aria-live="polite" className={c.sub} style={{ marginTop: 14 }}>Analisando os indicadores agregados dos polos…</div>}
      {error && (
        <div role="alert" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 14, color: "#b91c1c" }}>
          <AlertTriangle size={17} aria-hidden="true" />
          <span style={{ flex: "1 1 220px" }}>Não foi possível gerar o feedback agora.</span>
          <button type="button" onClick={generate} disabled={loading} style={{ border: "1px solid currentColor", borderRadius: 8, padding: "6px 10px", background: "transparent", color: "inherit", font: "inherit", cursor: "pointer" }}>Tentar novamente</button>
        </div>
      )}

      {feedback && (
        <div aria-live="polite" style={{ display: "grid", gap: 14, marginTop: 16, minWidth: 0 }}>
          <div className={c.sub}>
            Período analisado: {feedback.period ? feedback.period.days : feedback.source && feedback.source.rangeDays} dias
            {feedback.minimumSample ? ` · mínimo de ${feedback.minimumSample} atendimentos por polo` : ""}
            {feedback.source && feedback.source.generatedAt ? ` · gerado às ${new Date(feedback.source.generatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}; disponível novamente às ${new Date(Date.parse(feedback.source.generatedAt) + Number(feedback.source.cacheSeconds || 300) * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}
          </div>
          {Array.isArray(feedback.feedback) ? (
            feedback.feedback.length === 0 ? (
              <div role="status" className={c.sub}>
                {feedback.base && feedback.base.length === 0 ? "Não há dados agregados de polos neste período." : "Nenhum resultado por polo foi retornado para este período."}
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {feedback.feedback.map((item, i) => {
                  const base = (feedback.base || []).find((row) => row.poloId === item.poloId) || {};
                  const insufficient = item.status === "amostra_insuficiente";
                  const badgeStyle = insufficient
                    ? { background: "rgba(217,119,6,.12)", color: "#92400e" }
                    : { background: "rgba(22,163,74,.12)", color: "#166534" };
                  const metrics = [
                    ["Atendimentos", base.attendances],
                    ["Mensagens recebidas", base.receivedMessages],
                    ["Matrículas", base.enrollments],
                    ["Sem resposta", base.unansweredNow],
                  ].filter(([, value]) => value !== null && value !== undefined);
                  return (
                    <article key={`${item.poloId}-${i}`} style={{ border: "1px solid rgba(127,127,127,.22)", borderRadius: 10, padding: 12, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <b style={{ fontSize: 14, overflowWrap: "anywhere" }}>{item.polo || base.polo || `Polo ${item.poloId}`}</b>
                        <span style={{ ...badgeStyle, display: "inline-flex", borderRadius: 999, padding: "3px 9px", fontSize: 11.5, fontWeight: 700 }}>
                          {insufficient ? "Amostra insuficiente" : "Analisado"}
                        </span>
                      </div>
                      {item.leitura && <div style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.5 }}><b>Leitura orientativa da IA:</b> {item.leitura}</div>}
                      {item.acao && <div style={{ marginTop: 4, fontSize: 13.5, lineHeight: 1.5 }}><b>Ação sugerida:</b> {item.acao}</div>}
                      {metrics.length > 0 && <div className={c.sub} style={{ marginTop: 8 }}>{metrics.map(([label, value]) => `${label}: ${Number(value).toLocaleString("pt-BR")}`).join(" · ")}</div>}
                    </article>
                  );
                })}
              </div>
            )
          ) : (
            <>
              <div style={{ borderLeft: "3px solid #0b4279", padding: "4px 0 4px 12px", fontSize: 14, lineHeight: 1.55 }}><b>Resumo orientativo da IA:</b> {feedback.summary}</div>
              {feedback.strengths && feedback.strengths.length > 0 && (
                <div>
                  <h3 style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, margin: "0 0 6px" }}><CheckCircle2 size={15} style={{ color: "#15803d" }} /> Sinais positivos sugeridos</h3>
                  <ul style={{ margin: 0, paddingLeft: 22, display: "grid", gap: 5, fontSize: 13.5, lineHeight: 1.5 }}>{feedback.strengths.map((item, i) => <li key={`${i}-${item}`}>{item}</li>)}</ul>
                </div>
              )}
              {feedback.risks && feedback.risks.length > 0 && (
                <div>
                  <h3 style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, margin: "0 0 8px" }}><AlertTriangle size={15} style={{ color: "#b45309" }} /> Pontos de atenção sugeridos por polo</h3>
                  <div style={{ display: "grid", gap: 8 }}>
                    {feedback.risks.map((risk, i) => (
                      <article key={`${risk.polo}-${i}`} style={{ border: "1px solid rgba(127,127,127,.22)", borderRadius: 10, padding: 12, minWidth: 0 }}>
                        <b style={{ display: "block", fontSize: 13.5, overflowWrap: "anywhere" }}>{risk.polo}</b>
                        <div style={{ marginTop: 5, fontSize: 13.5, lineHeight: 1.5 }}><b>Leitura da IA:</b> {risk.issue}</div>
                        <div style={{ marginTop: 3, fontSize: 13, lineHeight: 1.5, color: "var(--text-secondary, #64748b)" }}><b>Evidência:</b> {risk.evidence}</div>
                        <div style={{ marginTop: 3, fontSize: 13.5, lineHeight: 1.5 }}><b>Ação sugerida:</b> {risk.action}</div>
                      </article>
                    ))}
                  </div>
                </div>
              )}
              {feedback.nextActions && feedback.nextActions.length > 0 && (
                <div>
                  <h3 style={{ fontSize: 13.5, margin: "0 0 6px" }}>Próximas ações</h3>
                  <ol style={{ margin: 0, paddingLeft: 22, display: "grid", gap: 5, fontSize: 13.5, lineHeight: 1.5 }}>{feedback.nextActions.map((item, i) => <li key={`${i}-${item}`}>{item}</li>)}</ol>
                </div>
              )}
              {feedback.caveats && feedback.caveats.length > 0 && (
                <div style={{ padding: 10, borderRadius: 9, background: "var(--surface-2, rgba(127,127,127,.08))", fontSize: 12.5, lineHeight: 1.5 }}>
                  <b>Limites da leitura:</b> {feedback.caveats.join(" ")}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
};

const Management = ({ data, sla, failed, onRetry, date, days }) => {
  const c = useShared();
  const ct = useChartTheme();
  if (!data && failed) return <div className={c.panel}><ErrorState title="Não foi possível carregar a visão de gestão." onRetry={onRetry} compact /></div>;
  if (!data) return <div className={c.panel} style={{ opacity: 0.6 }}>Carregando a visão de gestão...</div>;
  const t = data.total;
  const delta = t.reply.median !== null && t.previousMedian ? Math.round(((t.reply.median - t.previousMedian) / t.previousMedian) * 100) : null;
  const medianTone = t.reply.median === null ? undefined : t.reply.median <= sla ? "#16a34a" : t.reply.median > sla * 2 ? "#dc2626" : "#d97706";
  const hours = data.byHour.map((h) => ({ ...h, name: `${String(h.hour).padStart(2, "0")}h` }));

  return (
    <div className={c.stack}>
      <ManagementFeedback date={date} days={days} />
      <div className={c.panel} style={{ padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <Kpi label="Tempo mediano de resposta" value={hm(t.reply.median)} tone={medianTone}
          note={delta === null ? `meta: ${sla} min` : `${delta > 0 ? "+" : ""}${delta}% vs. período anterior · meta ${sla} min`} />
        <Kpi label="Respondidas no prazo" value={t.reply.withinSlaPct === null ? "—" : `${t.reply.withinSlaPct}%`} note={`P90: ${hm(t.reply.p90)} · ${t.reply.count} respostas`} />
        <Kpi label="Sem resposta agora" value={t.unansweredNow} tone={t.unansweredNow ? "#dc2626" : undefined} note={`${t.waitingNow} na fila de espera`} />
        <Kpi label="Conversas abertas" value={t.openNow} note="em atendimento agora" />
      </div>

      <Insights items={data.insights} title="O que a gestão precisa saber" />

      <div className={c.panel}>
        <h2 className={c.title}><Gauge size={16} /> Tempo de resposta por hora</h2>
        <div className={c.sub}>Mediana de espera de quem escreveu em cada hora. A linha é a meta ({sla} min).</div>
        <div style={{ height: 220, marginTop: 10 }}>
          <ResponsiveContainer>
            <BarChart data={hours} margin={{ top: 6, right: 4, left: -14, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={ct.grid} strokeDasharray="3 4" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11.5, fill: ct.axis }} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11.5, fill: ct.axis }} unit=" min" />
              <Tooltip cursor={{ fill: ct.cursor }} formatter={(v, n, p) => [hm(v), `Mediana (${p.payload.count} respostas)`]} contentStyle={{ background: "var(--surface)", border: "1px solid var(--line-strong)", borderRadius: 10, fontSize: 12.5 }} />
              <ReferenceLine y={sla} stroke={ct.c.warn} strokeDasharray="4 4" />
              <Bar dataKey="median" radius={[3, 3, 0, 0]} maxBarSize={24} isAnimationActive={false}>
                {hours.map((h) => <Cell key={h.hour} fill={h.median > sla * 2 ? ct.c.lost : h.median > sla ? ct.c.warn : ct.c.leads} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={c.panel}>
        <h2 className={c.title}><Building2 size={16} /> Departamentos</h2>
        <div className={c.sub}>Cada departamento é a etapa da conversa: Comercial, Pós-venda, Ambientação, Acadêmico e Relacionamento.</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginTop: 12 }}>
          {data.departments.length === 0 && <div style={{ opacity: 0.6 }}>Nenhum atendimento neste período.</div>}
          {data.departments.map((d) => (
            <div key={d.key} style={{ border: "1px solid rgba(127,127,127,.22)", borderRadius: 14, padding: 14 }}>
              <div style={{ fontWeight: 700 }}>{d.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.03em" }}>{hm(d.reply.median)}</span>
                <span style={{ fontSize: 12, opacity: 0.7 }}>mediana de resposta</span>
              </div>
              <div style={{ margin: "8px 0" }}><SlaBar pct={d.reply.withinSlaPct} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 10px", fontSize: 12.5, opacity: 0.85 }}>
                <span>{d.attendances} atendimentos</span><span>{d.openNow} abertas agora</span>
                <span style={{ color: d.unansweredNow ? "#dc2626" : undefined }}>{d.unansweredNow} sem resposta</span><span>{d.waitingNow} na fila</span>
                <span>1ª resposta: {hm(d.firstResponse.median)}</span>{d.key === "sales" ? <span>{d.enrolled} matrículas</span> : <span>P90: {hm(d.reply.p90)}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={c.panel}>
        <h2 className={c.title}><Users size={16} /> Equipe</h2>
        <div className={c.sub}>Ordenado por atendimentos. Quem tem poucas respostas no período aparece com a leitura mais incerta.</div>
        <div className={c.scroll}>
          <table className={c.table} style={{ marginTop: 8 }}>
            <thead><tr><th>Atendente</th><th className="r">Atend.</th><th className="r">Mediana</th><th>No prazo</th><th className="r">P90</th><th className="r">Abertas</th><th className="r">Sem resp.</th><th className="r">Matríc.</th></tr></thead>
            <tbody>
              {data.attendants.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td className="r">{a.attendances}</td>
                  <td className="r" style={{ fontWeight: 700 }}>{hm(a.reply.median)}</td>
                  <td><SlaBar pct={a.reply.withinSlaPct} /></td>
                  <td className="r">{hm(a.reply.p90)}</td>
                  <td className="r">{a.openNow}</td>
                  <td className="r" style={{ color: a.unansweredNow ? "#dc2626" : undefined, fontWeight: a.unansweredNow ? 700 : 400 }}>{a.unansweredNow}</td>
                  <td className="r">{a.enrolled}</td>
                </tr>
              ))}
              {data.attendants.length === 0 && <tr><td colSpan={8} style={{ opacity: 0.6 }}>Nenhum atendente com movimento neste período.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {data.polos.length > 0 && (
        <div className={c.panel}>
          <h2 className={c.title}><MapPin size={16} /> Polos</h2>
          <div className={c.scroll}>
            <table className={c.table} style={{ marginTop: 8 }}>
              <thead><tr><th>Polo</th><th className="r">Atend.</th><th className="r">Mediana</th><th>No prazo</th><th className="r">Abertas</th><th className="r">Na fila</th><th className="r">Sem resp.</th><th className="r">Matríc.</th></tr></thead>
              <tbody>
                {data.polos.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className="r">{p.attendances}</td>
                    <td className="r" style={{ fontWeight: 700 }}>{hm(p.reply.median)}</td>
                    <td><SlaBar pct={p.reply.withinSlaPct} /></td>
                    <td className="r">{p.openNow}</td>
                    <td className="r">{p.waitingNow}</td>
                    <td className="r" style={{ color: p.unansweredNow ? "#dc2626" : undefined }}>{p.unansweredNow}</td>
                    <td className="r">{p.enrolled}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Management;
