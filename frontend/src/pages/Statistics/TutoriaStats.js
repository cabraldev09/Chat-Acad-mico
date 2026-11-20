import React, { useContext, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { BarChart3, Clock, AlertTriangle, UserX, CheckCheck } from "lucide-react";

import MainContainer from "../../components/MainContainer";
import StatsHubBar from "../../components/StatsHub";
import TutorPanel from "../Tutoria/TutorPanel";
import { BarsChart } from "../../components/charts";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import { isManager } from "../../utils/access";

const PERIODS = [["semana", "Semana"], ["mes", "Mês"], ["ciclo", "Ciclo (semestre)"], ["90", "90 dias"]];

// Estatísticas → Tutoria: the ambientação in numbers (first contact, within the deadline, late, without tutor, finished per week)
// and the performance of each tutor in the period. The board of each student stays in "Alunos da tutoria".
const hoursText = (h) => (h === null || h === undefined ? "—" : h < 1 ? "menos de 1 h" : h < 48 ? `${String(h).replace(".", ",")} h` : `${Math.round(h / 24)} dias`);
const box = { border: "1px solid var(--line-strong)", borderRadius: 12, background: "var(--surface)", padding: 16, boxShadow: "var(--shadow-card)", minWidth: 0 };

export default function TutoriaStats() {
  const history = useHistory();
  const { user } = useContext(AuthContext);
  const manager = isManager(user);
  const [period, setPeriod] = useState("mes");
  const [stats, setStats] = useState(null);
  useEffect(() => { setStats(null); api.get("/onboarding/stats", { params: { period } }).then(({ data }) => setStats(data)).catch((e) => { toastError(e); setStats(false); }); }, [period]);
  const kpis = stats ? [
    [CheckCheck, stats.doneInPeriod, `ambientações concluídas (${stats.period})`, "#0B4279"],
    [BarChart3, stats.enrolledInPeriod, `alunos recebidos (${stats.period})`, "#0f766e"],
    [Clock, hoursText(stats.avgFirstContactHours), `tempo médio até o primeiro contato (${stats.period})`, "var(--accent)"],
    [CheckCheck, stats.withinSlaShare === null ? "—" : `${stats.withinSlaShare}%`, `iniciadas dentro de ${stats.slaHours} h`, "#0f766e"],
    [AlertTriangle, stats.totals.late, "atrasadas agora", stats.totals.late ? "#b91c1c" : "var(--text-3)"],
    ...(manager ? [[UserX, stats.totals.withoutTutor, "alunos sem tutor", stats.totals.withoutTutor ? "#b45309" : "var(--text-3)"]] : []),
  ] : [];
  return (
    <MainContainer>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 2px 24px" }}>
        <StatsHubBar />
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h1 style={{ margin: 0, fontSize: 24, letterSpacing: "-0.02em" }}>{manager ? "Desempenho da tutoria" : "Meus números da tutoria"}</h1>
            <div style={{ fontSize: 13.5, color: "var(--text-2)", marginTop: 4 }}>{manager ? "A ambientação dos alunos matriculados e o trabalho de cada tutor." : "Só os seus alunos: quantos chegaram, quantos você ambientou e quanto tempo levou o primeiro contato."}</div>
          </div>
          <button type="button" onClick={() => history.push("/meus-alunos")} style={{ border: "1px solid var(--line-strong)", background: "var(--surface)", borderRadius: 8, padding: "7px 14px", font: "inherit", fontWeight: 600, cursor: "pointer", color: "inherit" }}>{manager ? "Abrir os alunos da tutoria" : "Abrir meus alunos"}</button>
        </div>
        <div className="ui-tabs" role="tablist" aria-label="Período" style={{ marginLeft: 0, marginBottom: 14, flexWrap: "wrap" }}>
          {PERIODS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={period === k} className={`ui-tabs__btn${period === k ? " is-on" : ""}`} onClick={() => setPeriod(k)}>{l}</button>)}
        </div>
        {stats === null && <div style={{ color: "var(--text-2)", fontSize: 13, marginBottom: 16 }}>Carregando…</div>}
        {stats && (
          <>
            <div className="dash-stagger" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", marginBottom: 16 }}>
              {kpis.map(([Icon, n, label, tone]) => (
                <div key={label} className="ui-card" style={{ padding: 14, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-2)", fontSize: 12.5 }}><Icon size={15} style={{ color: tone }} /> {label}</div>
                  <div style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: tone === "#b91c1c" ? tone : "var(--text-1)", marginTop: 4 }}>{n}</div>
                </div>
              ))}
            </div>
            <div style={{ ...box, marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Alunos ambientados por semana</div>
              <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>Concluídos nas últimas 8 semanas.</div>
              <div style={{ marginTop: 10 }} role="img" aria-label={`Ambientações concluídas por semana: ${stats.weeks.map((w) => w.done).join(", ")}`}>
                <BarsChart data={stats.weeks.map((w) => ({ ...w, short: w.weekStart.split("-").reverse().slice(0, 2).join("/") }))} xKey="short" keys={[["done", "Concluídos", "won"]]} height={170} />
              </div>
            </div>
          </>
        )}
        {manager && <TutorPanel />}
      </div>
    </MainContainer>
  );
}
