import React from "react";
import { useHistory } from "react-router-dom";
import { CalendarCheck2, Clock3, Target, Wallet } from "lucide-react";
import { format, parseISO } from "date-fns";

import { Insights, SlaBar, hm, useShared } from "./shared";

const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// What a consultant needs first: who is waiting, what is due, how they stand against the goal
const MyDay = ({ data }) => {
  const c = useShared();
  const history = useHistory();
  if (!data) return null;
  const sla = data.slaMinutes;
  return (
    <div className={c.stack} style={{ marginBottom: 20 }}>
      <Insights items={data.insights} title="Seu dia" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <div className={c.panel}>
          <h2 className={c.title}><Clock3 size={16} /> Para responder agora <span className={c.chip} style={{ background: data.toReplyCount ? "rgba(220,38,38,.14)" : "rgba(22,163,74,.14)", color: data.toReplyCount ? "#dc2626" : "#15803d" }}>{data.toReplyCount}</span></h2>
          <div style={{ marginTop: 8 }}>
            {data.toReply.length === 0 && <div className={c.sub}>Ninguém esperando resposta sua.</div>}
            {data.toReply.map((t) => (
              <button key={t.id} type="button" onClick={() => history.push(`/tickets/${t.id}`)} style={{ display: "flex", width: "100%", gap: 8, border: 0, background: "transparent", color: "inherit", fontFamily: "inherit", fontSize: 14, padding: "6px 0", cursor: "pointer", textAlign: "left" }}>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                <b style={{ color: t.minutes >= sla ? "#dc2626" : "#d97706", fontVariantNumeric: "tabular-nums" }}>há {hm(t.minutes)}</b>
              </button>
            ))}
          </div>
        </div>

        <div className={c.panel}>
          <h2 className={c.title}><CalendarCheck2 size={16} /> Tarefas de hoje</h2>
          <div style={{ marginTop: 8 }}>
            {data.tasks.length === 0 && <div className={c.sub}>Nenhuma tarefa para hoje.</div>}
            {data.tasks.map((t) => (
              <button key={t.id} type="button" onClick={() => history.push(`/crm?lead=${t.leadId}`)} style={{ display: "flex", width: "100%", gap: 8, border: 0, background: "transparent", color: "inherit", fontFamily: "inherit", fontSize: 14, padding: "6px 0", cursor: "pointer", textAlign: "left" }}>
                <span style={{ flex: 1, minWidth: 0 }}>{t.title}{t.lead ? <span style={{ opacity: 0.6 }}> · {t.lead}</span> : null}</span>
                <span style={{ color: t.overdue ? "#dc2626" : undefined, fontWeight: t.overdue ? 700 : 400, whiteSpace: "nowrap" }}>{t.overdue ? "atrasada" : format(parseISO(t.dueAt), "HH:mm")}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={c.panel}>
          <h2 className={c.title}><Target size={16} /> Minha meta</h2>
          {data.goals.length === 0 && <div className={c.sub} style={{ marginTop: 8 }}>Você ainda não está em nenhuma meta do período.</div>}
          {data.goals.map((g) => (
            <div key={g.id} style={{ marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                <span>{g.title || `${g.startsOn.slice(8)}/${g.startsOn.slice(5, 7)} – ${g.endsOn.slice(8)}/${g.endsOn.slice(5, 7)}`}</span>
                <b>{g.mine.done}{g.mine.target ? ` / ${g.mine.target}` : ""} {g.mine.reached ? "✅" : ""}</b>
              </div>
              <div className={c.bar} style={{ margin: "6px 0" }}><div className={c.fill} style={{ width: `${g.mine.pct || 0}%`, background: g.mine.reached ? "#16a34a" : "#0693E3" }} /></div>
              <div className={c.sub}>{g.mine.missing ? `faltam ${g.mine.missing} em ${g.daysLeft} dia${g.daysLeft === 1 ? "" : "s"}${g.mine.pace ? ` · ${g.mine.pace}/dia` : ""}` : g.mine.reached ? "meta batida" : `${g.daysLeft} dias restantes`}</div>
            </div>
          ))}
        </div>

        <div className={c.panel}>
          <h2 className={c.title}><Wallet size={16} /> Comissões do mês</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
            <div><div className={c.sub}>Recebido</div><div style={{ fontSize: 20, fontWeight: 700, color: "#15803d" }}>{brl(data.commissions.received.total)}</div></div>
            <div><div className={c.sub}>A receber</div><div style={{ fontSize: 20, fontWeight: 700, color: "#b45309" }}>{brl(data.commissions.owed.total)}</div></div>
          </div>
          <button type="button" onClick={() => history.push("/crm/comissoes")} style={{ marginTop: 10, border: 0, background: "transparent", color: "#0693E3", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, padding: 0 }}>Abrir o extrato</button>
        </div>

        <div className={c.panel}>
          <h2 className={c.title}>Meu tempo de resposta · 7 dias</h2>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em", marginTop: 8 }}>{hm(data.reply.median)}</div>
          <div className={c.sub}>mediana · meta {sla} min</div>
          <div style={{ marginTop: 10 }}><SlaBar pct={data.reply.withinSlaPct} /></div>
          <div className={c.sub} style={{ marginTop: 6 }}>P90: {hm(data.reply.p90)} · {data.reply.count} respostas</div>
        </div>
      </div>
    </div>
  );
};

export default MyDay;
