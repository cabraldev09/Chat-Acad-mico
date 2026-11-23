import React, { useContext, useEffect, useState } from "react";
import { Redirect, useHistory } from "react-router-dom";
import { BarChart3, Clock, AlertTriangle, UserX, CheckCheck } from "lucide-react";

import MainContainer from "../../components/MainContainer";
import StatsHubBar from "../../components/StatsHub";
import { Tutoring } from "./index";
import TutorPanel from "../Tutoria/TutorPanel";
import { BarsChart } from "../../components/charts";
import { GlowPanel, GlowStat } from "../../components/peak";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import { isManager } from "../../utils/access";
import { hubHome } from "../../components/StatsHub";

const PERIODS = [["semana", "Semana"], ["mes", "Mês"], ["ciclo", "Ciclo (semestre)"], ["90", "90 dias"]];

// Estatísticas → Tutoria: the ambientação in numbers (first contact, within the deadline, late, without tutor, finished per week)
// and the performance of each tutor in the period. The board of each student stays in "Alunos da tutoria".
const hoursText = (h) => (h === null || h === undefined ? "—" : h < 1 ? "menos de 1 h" : h < 48 ? `${String(h).replace(".", ",")} h` : `${Math.round(h / 24)} dias`);

export default function TutoriaStats() {
  const history = useHistory();
  const { user } = useContext(AuthContext);
  const manager = isManager(user);
  const [period, setPeriod] = useState("mes");
  const [stats, setStats] = useState(null);
  // the tutoring numbers are for the management and the tutors: anyone else goes to their own numbers (no request, no "sem permissão")
  const allowed = manager || (!!user && ["tutor", "academico"].includes(user.role));
  const [again, setAgain] = useState(0);
  useEffect(() => { if (!allowed) return; setStats(null); api.get("/onboarding/stats", { params: { period } }).then(({ data }) => setStats(data)).catch((e) => { toastError(e); setStats(false); }); }, [period, allowed, again]);
  const late = stats ? stats.totals.late : 0;
  const noTutor = stats ? stats.totals.withoutTutor : 0;
  const kpis = stats ? [
    ["done", CheckCheck, stats.doneInPeriod, "Ambientações concluídas", stats.period, "good"],
    ["received", BarChart3, stats.enrolledInPeriod, "Alunos recebidos", stats.period],
    ["first", Clock, hoursText(stats.avgFirstContactHours), "Tempo até o primeiro contato", `Média, ${stats.period}`],
    ["sla", CheckCheck, stats.withinSlaShare === null ? "—" : `${stats.withinSlaShare}%`, `Iniciadas em até ${stats.slaHours} h`, stats.period],
    ["late", AlertTriangle, late, "Atrasadas agora", late ? "Passaram do prazo de início" : "Nenhuma atrasada", late ? "bad" : "good"],
    ...(manager ? [["noTutor", UserX, noTutor, "Alunos sem tutor", noTutor ? "Distribua para um tutor" : "Todos com tutor", noTutor ? "warn" : "good"]] : []),
  ] : [];
  if (!allowed) return <Redirect to={hubHome(user)} />;
  return (
    <MainContainer>
      <div className="gv-plain" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 2px 24px" }}>
        <StatsHubBar />
        <div className="gv-head" style={{ marginBottom: 20 }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h1>{manager ? "Desempenho da tutoria" : "Meus números da tutoria"}</h1>
            <p>{manager ? "A ambientação dos alunos matriculados e o trabalho de cada tutor." : "Só os seus alunos: quantos chegaram, quantos você ambientou e quanto tempo levou o primeiro contato."}</p>
          </div>
          <div className="gv-seg" role="group" aria-label="Período">
            {PERIODS.map(([k, l]) => <button key={k} type="button" aria-pressed={period === k} onClick={() => setPeriod(k)}>{l}</button>)}
          </div>
          <button type="button" className="gv-btn" style={{ background: "#fff", color: "#0b4279", alignSelf: "auto" }} onClick={() => history.push("/meus-alunos")}>Abrir os alunos</button>
        </div>
        {/* what needs care now: students without contact, risk of dropping out, re-enrollments and where the onboarding stops */}
        <div style={{ marginBottom: 16 }}><Tutoring params={{ range: period === "semana" ? "week" : "month" }} /></div>
        {stats === false && <GlowPanel error onRetry={() => setAgain((n) => n + 1)} />}
        {stats === null && <div className="pk-grid" style={{ marginBottom: 16 }} aria-busy="true">{[0, 1, 2, 3].map((i) => <GlowStat key={i} id={`load-${i}`} label="Carregando" loading />)}</div>}
        {stats && (
          <>
            <div className="pk-grid" style={{ marginBottom: 16 }}>
              {kpis.map(([id, Icon, n, label, hint, tone]) => <GlowStat key={id} id={id} icon={Icon} label={label} value={typeof n === "number" ? n.toLocaleString("pt-BR") : n} hint={hint} tone={tone} />)}
            </div>
            <div style={{ marginBottom: 16 }}>
              <GlowPanel tone="good" title="Alunos ambientados por semana" sub="Concluídos nas últimas 8 semanas.">
                <div role="img" aria-label={`Ambientações concluídas por semana: ${stats.weeks.map((w) => w.done).join(", ")}`}>
                  <BarsChart data={stats.weeks.map((w) => ({ ...w, short: w.weekStart.split("-").reverse().slice(0, 2).join("/") }))} xKey="short" keys={[["done", "Concluídos", "won"]]} height={170} />
                </div>
              </GlowPanel>
            </div>
          </>
        )}
        {manager && <TutorPanel />}
      </div>
    </MainContainer>
  );
}
