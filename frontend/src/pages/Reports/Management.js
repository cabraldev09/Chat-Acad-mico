import React from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Building2, Gauge, MapPin, Users } from "lucide-react";

import { Insights, SlaBar, hm, useShared } from "./shared";

const Kpi = ({ label, value, note, tone }) => (
  <div style={{ padding: "16px 18px" }}>
    <div style={{ fontSize: 12.5, opacity: 0.7, fontWeight: 500 }}>{label}</div>
    <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.035em", marginTop: 6, fontVariantNumeric: "tabular-nums", color: tone }}>{value}</div>
    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{note}</div>
  </div>
);

// Management: every department, attendant and polo side by side, with response times that do not lie (median, P90, share on time)
const Management = ({ data, sla }) => {
  const c = useShared();
  if (!data) return <div className={c.panel} style={{ opacity: 0.6 }}>Carregando a visão de gestão...</div>;
  const t = data.total;
  const delta = t.reply.median !== null && t.previousMedian ? Math.round(((t.reply.median - t.previousMedian) / t.previousMedian) * 100) : null;
  const medianTone = t.reply.median === null ? undefined : t.reply.median <= sla ? "#16a34a" : t.reply.median > sla * 2 ? "#dc2626" : "#d97706";
  const hours = data.byHour.map((h) => ({ ...h, name: `${String(h.hour).padStart(2, "0")}h` }));

  return (
    <div className={c.stack}>
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
              <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.35} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} unit=" min" />
              <Tooltip cursor={{ fill: "rgba(127,127,127,.08)" }} formatter={(v, n, p) => [hm(v), `Mediana (${p.payload.count} respostas)`]} />
              <ReferenceLine y={sla} stroke="#d97706" strokeDasharray="4 4" />
              <Bar dataKey="median" radius={[5, 5, 0, 0]}>
                {hours.map((h) => <Cell key={h.hour} fill={h.median > sla * 2 ? "#dc2626" : h.median > sla ? "#d97706" : "#0693E3"} />)}
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
