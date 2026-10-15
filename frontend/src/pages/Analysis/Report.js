import React from "react";
import ReactDOM from "react-dom";

import logoWhite from "../../assets/logo-cruzeiro.svg";
import { cn, completionOf, pluralize, statusOutcome } from "./orig";

// "Gerar relatório do aluno": the report that the original prints for the student (header band, journey, path to
// graduation, pending subjects and the next step). It opens over the system and prints alone (Imprimir / Salvar PDF).

const SOURCE_TEXT = {
  OFFICIAL_ACADEMIC_HISTORY: "Análise elaborada a partir do Histórico Escolar oficial anexado.",
  SIMPLE_ACADEMIC_HISTORY: "Análise elaborada a partir do Histórico Escolar simples (conferência) anexado.",
  CURRICULAR_EXTRACT: "Análise elaborada a partir do Extrato/Grade Curricular anexado.",
};

const longDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Porto_Velho" }).format(d);
};

const reportStatusTitle = (status) => ({
  NO_PENDING: "Sem pendências anteriores",
  CAN_ADD: "Há espaço para avançar nas pendências",
  NEAR_LIMIT: "Semestre quase completo",
  LIMIT_REACHED: "Semestre com a carga completa",
  MANUAL_REVIEW_REQUIRED: "Análise com ressalvas",
  ENROLLMENT_INACTIVE: "Matrícula sem previsão",
}[status] || "Resultado da análise");

const nextStepOf = (result, needsReview) => {
  if (result.status === "ENROLLMENT_INACTIVE") return { title: "Regularizar a matrícula", description: "Procure o polo ou a secretaria para ver como reativar a matrícula. Depois disso a análise é refeita." };
  if (result.status === "MANUAL_REVIEW_REQUIRED" || needsReview > 0) return { title: "Use a previsão como referência", description: "A estimativa foi calculada com os dados legíveis do documento. Se algo estiver diferente do seu histórico, fale com a equipe acadêmica para ajustar." };
  if (result.canAddNow > 0) return { title: "Avançar nas pendências", description: `Ainda cabe(m) ${result.canAddNow} disciplina(s) pendente(s) neste semestre. Confirme a oferta e os pré-requisitos com a equipe acadêmica.` };
  if (result.previousPending > 0) return { title: "Seguir o planejamento", description: "Este semestre já está com a carga completa. As pendências restantes entram nos próximos semestres, conforme a oferta acadêmica." };
  return { title: "Manter o planejamento atualizado", description: "Revise a grade a cada novo período para atualizar a estimativa de conclusão." };
};

const Heading = ({ kicker, title, note }) => (
  <div className="flex items-end justify-between gap-4">
    <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-cyan-700">{kicker}</p><h2 className="mt-0.5 text-sm font-semibold tracking-tight text-slate-900">{title}</h2></div>
    <p className="max-w-[50%] text-right text-[9.5px] leading-[1.35] text-slate-500">{note}</p>
  </div>
);

const Stat = ({ label, value, note, tone }) => (
  <div className={cn("report-card rounded-xl border border-slate-200 border-t-[3px] bg-white p-3", tone)}>
    <p className="text-[10px] font-medium text-slate-500">{label}</p>
    <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">{value}</p>
    <p className="mt-0.5 text-[9.5px] leading-[1.3] text-slate-500">{note}</p>
  </div>
);

export const AcademicReportPage = ({ a }) => {
  const snap = a.snapshot;
  const result = snap.result || {};
  const forecast = a.forecast;
  const disciplines = (snap.disciplines || []).filter((d) => d.inMainCurriculum);
  const completed = disciplines.filter((d) => ["COMPLETED", "EXEMPT"].includes(statusOutcome(d.normalizedStatus))).length;
  const needsReview = disciplines.filter((d) => d.period === null || d.period === undefined || statusOutcome(d.normalizedStatus) === "UNKNOWN").length;
  const completion = forecast && forecast.completionTermMin ? completionOf(forecast) : "";
  const pendingByPeriod = Object.entries(result.pendingByPeriod || {}).sort(([x], [y]) => Number(x) - Number(y));
  const currentPeriod = result.currentPeriod ?? null;
  const documentType = snap.documentType || "CURRICULAR_EXTRACT";
  const mappingMissing = !a.currentPeriodConfirmed || (snap.disciplines || []).some((d) => d.inMainCurriculum && (d.period === null || d.period === undefined));
  const workload = documentType !== "CURRICULAR_EXTRACT" && snap.plannedWorkload && snap.integralizedWorkload != null ? { planned: snap.plannedWorkload, integralized: snap.integralizedWorkload } : null;
  const progress = workload ? Math.min(100, Math.round((workload.integralized / workload.planned) * 100)) : disciplines.length ? Math.round((completed / disciplines.length) * 100) : 0;
  const pending = (forecast && forecast.knownBacklog) ?? result.previousPending ?? 0;
  const ring = 2 * Math.PI * 49;
  const periods = [...new Set(disciplines.filter((d) => d.period !== null && d.period !== undefined).map((d) => d.period))].sort((x, y) => x - y);
  const steps = forecast && forecast.plan ? forecast.plan.slice(0, 6) : [];
  const maxPending = Math.max(1, ...pendingByPeriod.map(([, count]) => count));
  const calculated = Boolean(forecast && forecast.completionTermMin) && result.status !== "ENROLLMENT_INACTIVE";
  const ready = calculated && !(forecast && forecast.incomplete);
  const nextStep = nextStepOf(result, needsReview);

  return (
    <article className="print-report mx-auto w-full max-w-[820px] p-6 text-slate-900" aria-label="Relatório acadêmico para o aluno">
      <div className="report-card relative overflow-hidden rounded-2xl bg-[linear-gradient(120deg,#002b55_0%,#003B71_55%,#07558f_100%)] px-6 py-4 text-white">
        <span aria-hidden="true" className="absolute -right-10 -top-16 size-56 rounded-full bg-[#0693E3]/25" />
        <span aria-hidden="true" className="absolute -bottom-20 right-40 size-40 rounded-full bg-cyan-300/10" />
        <div className="relative flex items-center justify-between gap-6">
          <img src={logoWhite} alt="Cruzeiro do Sul Virtual" className="h-11 w-auto" />
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-100">Acompanhamento acadêmico</p>
            <p className="mt-0.5 text-lg font-semibold tracking-tight">Resultado da análise</p>
          </div>
        </div>
        <div className="relative mt-3 border-t border-white/15 pt-3">
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight">{a.studentName || "Estudante"}</h1>
          <p className="mt-0.5 text-[13px] text-blue-50/85">{a.courseName || "Curso não identificado"}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10.5px] font-medium">
            {a.rgm && <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5">RGM {a.rgm}</span>}
            <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5">Análise de {longDate(a.createdAt)}</span>
            <span className="ml-1 text-[10px] font-normal text-blue-100/80">{SOURCE_TEXT[documentType] || SOURCE_TEXT.CURRICULAR_EXTRACT}</span>
          </div>
        </div>
      </div>

      <section className="mt-2.5 grid grid-cols-[1.35fr_1fr] gap-2.5">
        <div className="report-card relative overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#003B71_0%,#07558f_64%,#087db0_100%)] p-4 text-white">
          <span aria-hidden="true" className="absolute -right-12 -top-20 size-56 rounded-full bg-cyan-200/10" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100">Visão da jornada</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight">{reportStatusTitle(result.status)}</h2>
              <p className="mt-1 text-[11px] leading-4 text-blue-50/85">{workload ? "Curso integralizado conforme a carga horária do histórico escolar." : "Componentes da grade principal concluídos ou dispensados."}</p>
            </div>
            <div className="relative grid size-[88px] shrink-0 place-items-center" role="img" aria-label={`${progress}% concluído`}>
              <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
                <circle cx="60" cy="60" r="49" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="10" />
                <circle cx="60" cy="60" r="49" fill="none" stroke="#FEF84C" strokeWidth="10" strokeLinecap="round" strokeDasharray={ring} strokeDashoffset={ring * (1 - progress / 100)} />
              </svg>
              <span className="absolute text-xl font-semibold tabular-nums">{progress}<span className="text-xs">%</span></span>
            </div>
          </div>
          <div className="relative mt-3 flex items-end justify-between gap-3 border-t border-white/15 pt-3">
            <div>
              <p className="text-[10px] text-blue-100/80">{workload ? "Carga horária integralizada" : "Concluídas ou dispensadas"}</p>
              <p className="mt-0.5 text-base font-semibold tabular-nums">{workload ? `${workload.integralized.toLocaleString("pt-BR")}h` : completed} <span className="text-[11px] font-normal text-blue-100/80">de {workload ? `${workload.planned.toLocaleString("pt-BR")}h` : disciplines.length}</span></p>
            </div>
            <div className="shrink-0 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-right">
              <p className="text-[9px] font-medium uppercase tracking-wide text-blue-100/80">Conclusão estimada</p>
              <p className="mt-0.5 whitespace-nowrap text-[15px] font-semibold tabular-nums">{calculated && completion ? completion : "Sem prazo calculado"}</p>
              <p className="text-[9px] text-blue-100/75">{calculated ? (forecast.incomplete ? "Faixa automática · dados parciais" : "Estimativa automática") : "Dados insuficientes"}</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Stat label="Período atual" value={currentPeriod ? `${currentPeriod}º` : "—"} note="Seu período no curso" tone="border-t-[#0693E3]" />
          <Stat label="Concluídas" value={completed} note={`de ${disciplines.length} disciplinas do curso`} tone="border-t-[#1ca9b4]" />
          <Stat label="Pendências" value={mappingMissing ? "—" : pending} note="De períodos anteriores, a cursar" tone="border-t-[#d6ce23]" />
          <Stat label="Em andamento" value={mappingMissing ? "—" : (result.previousAlreadyAdded ?? 0)} note="Disciplinas anteriores que você já cursa" tone="border-t-slate-400" />
        </div>
      </section>

      {mappingMissing ? <p className="report-card mt-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">Mapeamento curricular necessário. Vagas e pendências por período aguardam confirmação do tutor.</p> : periods.length > 0 && (
        <section className="report-card mt-2.5 rounded-2xl border border-slate-200 bg-white p-4">
          <Heading kicker="Mapa curricular" title="Jornada por período" note="Situação das disciplinas em cada período curricular." />
          <ol className="mt-3 grid grid-cols-5 gap-2">
            {periods.map((period) => {
              const rows = disciplines.filter((d) => d.period === period);
              const done = rows.filter((d) => ["COMPLETED", "EXEMPT"].includes(statusOutcome(d.normalizedStatus))).length;
              const pendingRows = rows.filter((d) => statusOutcome(d.normalizedStatus) === "PENDING").length;
              const underway = rows.filter((d) => statusOutcome(d.normalizedStatus) === "IN_PROGRESS").length;
              const isCurrent = period === currentPeriod;
              const isFuture = currentPeriod !== null && period > currentPeriod;
              const state = isCurrent ? "current" : isFuture ? "future" : pendingRows ? "attention" : underway ? "underway" : "completed";
              const label = { current: "Período atual", future: "Futuro", attention: "Com pendências", underway: "Em andamento", completed: "Concluído" }[state];
              return (
                <li key={period} className={cn("rounded-xl border p-2.5", state === "current" ? "border-[#0693E3]/60 bg-sky-50" : state === "attention" ? "border-amber-200 bg-amber-50/70" : state === "underway" ? "border-cyan-200 bg-cyan-50/60" : state === "completed" ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white")}>
                  <div className="flex items-center justify-between"><span className="text-[11px] font-semibold text-slate-900">{period}º período</span><span className={cn("size-1.5 rounded-full", state === "current" ? "bg-[#0693E3]" : state === "attention" ? "bg-amber-500" : state === "underway" ? "bg-cyan-500" : state === "completed" ? "bg-emerald-500" : "bg-slate-300")} /></div>
                  <p className={cn("mt-0.5 text-[9.5px] font-medium", state === "current" ? "text-sky-800" : state === "attention" ? "text-amber-800" : state === "underway" ? "text-cyan-800" : "text-slate-500")}>{label}</p>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-200"><div className={cn("h-full rounded-full", state === "current" ? "bg-[#0693E3]" : state === "underway" ? "bg-cyan-500" : "bg-emerald-500")} style={{ width: `${rows.length ? Math.round((done / rows.length) * 100) : 0}%` }} /></div>
                  <p className="mt-1 text-[9px] text-slate-600">{done} de {rows.length}{pendingRows ? ` · ${pendingRows} pend.` : ""}{underway ? ` · ${underway} cursando` : ""}</p>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <section className="report-card mt-2.5 rounded-2xl border border-slate-200 bg-white p-4">
        <Heading kicker="Planejamento" title="Seu caminho até a conclusão" note="Estimativa sujeita à aprovação, rematrícula no prazo, oferta e pré-requisitos." />
        {steps.length && result.status !== "ENROLLMENT_INACTIVE" ? (
          <ol className="mt-3 grid grid-cols-2 gap-2">
            {steps.map((step, index) => {
              const isCurrentStep = !step.isAdditional && step.curriculumPeriod === currentPeriod;
              const regular = step.regularSubjectNames || [];
              const underway = step.inProgressSubjectNames || [];
              const previous = step.previousSubjects || [];
              const total = regular.length + underway.length + previous.length;
              const parts = [
                regular.length ? `${regular.length} do período` : null,
                underway.length ? `${underway.length} em andamento` : null,
                previous.length ? pluralize(previous.length, "pendência anterior", "pendências anteriores") : null,
                step.exemptions ? pluralize(step.exemptions, "dispensa", "dispensas") : null,
              ].filter(Boolean);
              return (
                <li key={`${step.curriculumPeriod}-${step.term}-${index}`} className={cn("relative rounded-xl border py-2.5 pl-8 pr-3", isCurrentStep ? "border-[#0693E3]/50 bg-sky-50/70" : "border-slate-200 bg-white")}>
                  <span aria-hidden="true" className={cn("absolute left-2 top-2.5 size-[18px] rounded-full border-4", step.isAdditional ? "border-amber-100 bg-[#FEF84C]" : "border-sky-100 bg-[#0693E3]")} />
                  <div className="flex items-start justify-between gap-2">
                    <div><p className="text-[9.5px] font-semibold uppercase tracking-wide text-slate-500">{step.isAdditional ? `Semestre adicional ${step.adaptationSemesterNumber ?? ""}` : `${step.curriculumPeriod}º período`}{isCurrentStep ? " · atual" : ""}</p><p className="text-sm font-semibold tabular-nums text-slate-900">{step.term ?? "A definir"}</p></div>
                    <p className="text-right text-xs font-semibold tabular-nums text-slate-900">{pluralize(total, "disciplina", "disciplinas")}</p>
                  </div>
                  <p className="mt-1 text-[9.5px] text-slate-600">{parts.join(" · ")}</p>
                </li>
              );
            })}
          </ol>
        ) : <p className="mt-2 text-xs text-slate-500">Não foi possível simular etapas com os dados disponíveis no documento.</p>}
        {forecast && forecast.plan && forecast.plan.length > 6 && <p className="mt-2 text-[10px] text-slate-500">A projeção continua nas etapas seguintes do plano acadêmico.</p>}
      </section>

      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        {mappingMissing ? <div /> : (
          <section className="report-card rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-cyan-700">Pendências anteriores</p>
            <h2 className="mt-0.5 text-sm font-semibold tracking-tight text-slate-900">{pendingByPeriod.length ? `${pluralize(result.previousPending, "disciplina", "disciplinas")} a cursar` : "Nenhuma pendência anterior"}</h2>
            {pendingByPeriod.length ? (
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {pendingByPeriod.map(([period, count]) => (
                  <div key={period} className="rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-1.5">
                    <div className="flex items-baseline justify-between"><span className="text-[10.5px] font-semibold text-slate-800">{period}º período</span><span className="text-[10px] font-semibold tabular-nums text-sky-800">{count}</span></div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-[#0693E3]" style={{ width: `${Math.max(6, Math.round((count / maxPending) * 100))}%` }} /></div>
                  </div>
                ))}
              </div>
            ) : <p className="mt-1 text-[11px] leading-4 text-slate-600">Não há disciplinas “A CURSAR” em períodos anteriores.</p>}
          </section>
        )}
        <section className={cn("report-card rounded-2xl border p-4", ready ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50")}>
          <p className={cn("text-[10px] font-semibold uppercase tracking-[0.14em]", ready ? "text-emerald-700" : "text-amber-700")}>Próximo passo</p>
          <h2 className={cn("mt-0.5 text-sm font-semibold", ready ? "text-emerald-950" : "text-amber-950")}>{nextStep.title}</h2>
          <p className="mt-1 text-[11px] leading-4 text-slate-700">{nextStep.description}</p>
        </section>
      </div>

      <footer className="report-card mt-2.5 flex items-center justify-between gap-6 rounded-2xl bg-[#003B71] px-5 py-3 text-white">
        <div className="text-[1.05rem]">
          <p aria-label="Escolha ter estrela." className="whitespace-nowrap leading-none"><span className="font-normal tracking-tight text-white">Escolha</span>{" "}<span style={{ fontFamily: "Caveat, 'Segoe Script', cursive" }} className="text-[1.12em] font-bold text-[#ECE181]">ter estrela .</span></p>
          <p className="mt-1.5 text-[0.62em] italic tracking-wide text-white/90">cruzeirodosulvirtual.com.br</p>
        </div>
        <p className="max-w-[58%] text-right text-[9px] leading-[1.35] text-blue-100/85">Resumo informativo para apoiar o planejamento acadêmico. A confirmação final depende dos registros e das regras oficiais da instituição. Emitido em {longDate(a.createdAt)}.</p>
      </footer>
    </article>
  );
};

// the report over the whole screen, with the buttons to print or close (they do not print)
export const AcademicReportOverlay = ({ a, onClose }) => ReactDOM.createPortal(
  <div className="orig orig-report-overlay" role="dialog" aria-modal="true" aria-label="Relatório do aluno">
    <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
      <p className="text-sm font-semibold text-slate-800">Relatório do aluno</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => window.print()} className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-white">Imprimir / Salvar PDF</button>
        <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700">Fechar</button>
      </div>
    </div>
    <AcademicReportPage a={a} />
  </div>,
  document.body
);
