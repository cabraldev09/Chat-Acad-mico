import { createPortal } from "react-dom";
import React, { useLayoutEffect, useRef } from "react";
import { GraduationCap } from "lucide-react";

import "../../styles/orig.css";

// The interface of the original analysis system, ported as it is (same classes, same structure): Card, Badge, Button,
// the dashboard cards, the period journey, the path to graduation and the message for the student. The styles are in
// styles/orig.css and only apply under an element with the class "orig".

export const cn = (...parts) => parts.flat(Infinity).filter(Boolean).join(" ");

// ------------------------------------------------------------------ text and status helpers (same rules as the original)

const LOWER_WORDS = new Set(["a", "à", "ao", "aos", "as", "às", "o", "os", "e", "de", "da", "das", "do", "dos", "em", "na", "nas", "no", "nos", "para", "por", "com", "sem"]);
const ROMAN = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)$/;
const ACRONYMS = new Set(["ti", "ead", "ux", "ui", "rh", "sql", "api", "ia", "tcc", "libras"]);

// "GESTÃO DA TECNOLOGIA DA INFORMAÇÃO I" → "Gestão da Tecnologia da Informação I" (only all-caps text is changed)
export const readableName = (value) => {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text || text !== text.toLocaleUpperCase("pt-BR")) return text;
  return text
    .split(" ")
    .map((word, index) => {
      const lower = word.toLocaleLowerCase("pt-BR");
      const bare = lower.replace(/[^\p{L}]/gu, "");
      if (ROMAN.test(bare) || ACRONYMS.has(bare)) return word;
      if (index > 0 && LOWER_WORDS.has(lower)) return lower;
      return lower.replace(/\p{L}/u, (char) => char.toLocaleUpperCase("pt-BR"));
    })
    .join(" ");
};

const foldStatus = (status) => String(status || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

// COMPLETED | EXEMPT | PENDING | IN_PROGRESS | UNKNOWN (rules.ts of the original)
export const statusOutcome = (status) => {
  const n = foldStatus(status);
  if (["A CURSAR", "REPROVADO", "REPROVADA", "REPROVADO POR NOTA", "REPROVADO POR FALTA"].includes(n)) return "PENDING";
  if (n === "CURSANDO") return "IN_PROGRESS";
  if (n === "AE" || n === "AE*") return "EXEMPT";
  if (["APROVADO", "APROVADA", "CONCLUIDO", "CONCLUIDA", "DISPENSADO", "DISPENSADA", "S"].includes(n)) return "COMPLETED";
  const grade = n.match(/^(?:NOTA\s*)?(\d{1,3}(?:[,.]\d{1,2})?)$/);
  if (grade) return Number(grade[1].replace(",", ".")) >= 6 ? "COMPLETED" : "PENDING";
  return "UNKNOWN";
};

export const pluralize = (count, one, many) => `${count} ${count === 1 ? one : many}`;

export const formatDay = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR", { timeZone: "America/Porto_Velho", day: "2-digit", month: "short", year: "numeric" });
};

// "2027.1" or "2027.1 a 2027.2"
export const completionOf = (forecast) => {
  if (!forecast || !forecast.completionTermMin) return null;
  return forecast.completionTermMin === forecast.completionTermMax ? forecast.completionTermMin : `${forecast.completionTermMin} a ${forecast.completionTermMax}`;
};

// ------------------------------------------------------------------ shadcn-like primitives

export const Card = ({ className, size = "default", ...props }) => (
  <div
    data-slot="card"
    data-size={size}
    className={cn("group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card shadow-[0_1px_2px_rgba(15,42,66,0.04),0_14px_36px_-28px_rgba(15,42,66,0.45)] py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 data-[size=sm]:[--card-spacing:--spacing(3)]", className)}
    {...props}
  />
);
export const CardHeader = ({ className, ...props }) => (
  <div data-slot="card-header" className={cn("grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) [.border-b]:pb-(--card-spacing)", className)} {...props} />
);
export const CardTitle = ({ className, ...props }) => <div data-slot="card-title" className={cn("text-base leading-snug font-medium", className)} {...props} />;
export const CardDescription = ({ className, ...props }) => <div data-slot="card-description" className={cn("text-sm text-muted-foreground", className)} {...props} />;
export const CardContent = ({ className, ...props }) => <div data-slot="card-content" className={cn("px-(--card-spacing)", className)} {...props} />;

const BADGE_VARIANTS = {
  default: "bg-primary text-primary-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  destructive: "bg-destructive/10 text-destructive",
  outline: "border-border text-foreground",
};
export const Badge = ({ className, variant = "default", ...props }) => (
  <span data-slot="badge" data-variant={variant} className={cn("inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all [&>svg]:pointer-events-none [&>svg]:size-3!", BADGE_VARIANTS[variant], className)} {...props} />
);

const BUTTON_VARIANTS = {
  default: "bg-primary text-primary-foreground hover:bg-primary/80",
  outline: "border-border bg-background hover:bg-muted hover:text-foreground",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  ghost: "hover:bg-muted hover:text-foreground",
  destructive: "bg-destructive/10 text-destructive hover:bg-destructive/20",
  link: "text-primary underline-offset-4 hover:underline",
};
const BUTTON_SIZES = {
  default: "h-8 gap-1.5 px-2.5",
  xs: "h-6 gap-1 rounded-md px-2 text-xs",
  sm: "h-7 gap-1 rounded-md px-2.5 text-[0.8rem]",
  lg: "h-9 gap-1.5 px-2.5",
  icon: "size-8",
};
// the original merges classes (tailwind-merge): a background given by the caller replaces the one of the variant
const withoutBackground = (variantClasses, extra) => (/(^|\s)bg-/.test(extra || "") ? variantClasses.split(" ").filter((t) => !/^(hover:)?bg-/.test(t) && !/^text-(primary-foreground|foreground)$/.test(t)).join(" ") : variantClasses);
export const Button = ({ className, variant = "default", size = "default", type = "button", ...props }) => (
  <button data-slot="button" data-variant={variant} data-size={size} type={type} className={cn("inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0", withoutBackground(BUTTON_VARIANTS[variant], className), BUTTON_SIZES[size], className)} {...props} />
);

export const Input = ({ className, ...props }) => (
  <input data-slot="input" className={cn("h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 md:text-sm", className)} {...props} />
);

// ------------------------------------------------------------------ magic effects

export const SpotlightCard = ({ className, onMouseMove, ...props }) => (
  <div
    onMouseMove={(event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      event.currentTarget.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
      event.currentTarget.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
      if (onMouseMove) onMouseMove(event);
    }}
    className={cn("magic-card", className)}
    {...props}
  />
);

const formatNumber = (value, suffix) => `${value.toLocaleString("pt-BR")}${suffix}`;
export const NumberTicker = ({ value, duration = 900, suffix = "", className }) => {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || value === 0 || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) return undefined;
    let frame = 0;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      node.textContent = formatNumber(Math.round(value * (1 - Math.pow(1 - t, 3))), suffix);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    node.textContent = formatNumber(0, suffix);
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); node.textContent = formatNumber(value, suffix); };
  }, [value, duration, suffix]);
  return <span ref={ref} className={className} style={{ fontVariantNumeric: "tabular-nums" }}>{formatNumber(value, suffix)}</span>;
};

let dotId = 0;
export const DotPattern = ({ className, size = 18 }) => {
  const id = useRef(`dots-${++dotId}`).current;
  return (
    <svg aria-hidden="true" className={cn("pointer-events-none absolute inset-0 h-full w-full [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]", className)}>
      <defs><pattern id={id} width={size} height={size} patternUnits="userSpaceOnUse"><circle cx={1.2} cy={1.2} r={1.2} fill="currentColor" /></pattern></defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
};

// ------------------------------------------------------------------ dashboard cards (academic-dashboard-visuals.tsx)

const CompactStat = ({ label, value, note, tone }) => {
  const top = { blue: "border-t-[#0693E3]", gold: "border-t-[#d6ce23]", cyan: "border-t-[#1ca9b4]", slate: "border-t-slate-400" }[tone];
  const numeric = typeof value === "number" ? value : /^(\d+)º$/.exec(value);
  return (
    <SpotlightCard className={cn("min-w-0 rounded-xl border border-slate-200 border-t-[3px] bg-white p-3.5 shadow-[0_12px_30px_-28px_rgba(15,42,66,0.6)] sm:p-4", top)}>
      <p className="truncate text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
        {typeof numeric === "number" ? <NumberTicker value={numeric} /> : numeric ? <NumberTicker value={Number(numeric[1])} suffix="º" /> : value}
      </p>
      <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">{note}</p>
    </SpotlightCard>
  );
};

export const AcademicDashboardOverview = ({ disciplines, currentPeriod, currentPeriodConfirmed, pending, inProgress, currentAE, availableSlots, completionTerm, needsReview, workloadProgress, mappingRequired = false, audience = "staff" }) => {
  const mainGrid = disciplines.filter((d) => d.inMainCurriculum);
  const completed = mainGrid.filter((d) => ["COMPLETED", "EXEMPT"].includes(statusOutcome(d.normalizedStatus))).length;
  const progress = workloadProgress ? Math.min(100, Math.round((workloadProgress.integralized / workloadProgress.planned) * 100)) : mainGrid.length ? Math.round((completed / mainGrid.length) * 100) : 0;
  const circle = 2 * Math.PI * 49;
  return (
    <section aria-label="Resumo da trajetória acadêmica" className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.9fr)]">
      <article className="relative isolate overflow-hidden rounded-2xl border border-[#003B71]/15 bg-[linear-gradient(135deg,#003B71_0%,#07558f_64%,#087db0_100%)] p-5 text-white shadow-[0_20px_48px_-32px_rgba(0,59,113,0.78)] sm:p-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-14 -top-24 -z-10 size-72 rounded-full bg-cyan-200/10 blur-3xl" />
        <DotPattern className="-z-10 text-white/10" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100">Visão da jornada</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">Progresso acadêmico</h2>
            <p className="mt-1 max-w-lg text-sm leading-6 text-blue-50/85">{workloadProgress ? "Curso integralizado conforme a carga horária informada no histórico escolar." : "Percentual de componentes da grade principal com situação concluída ou dispensada. Disciplinas em andamento não são contadas como concluídas."}</p>
          </div>
          <div className="relative grid size-[108px] shrink-0 place-items-center" role="img" aria-label={`${progress}% ${workloadProgress ? "do curso integralizado" : "dos componentes da grade estão concluídos ou dispensados"}`}>
            <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
              <circle cx="60" cy="60" r="49" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="9" />
              <circle cx="60" cy="60" r="49" fill="none" stroke="#FEF84C" strokeWidth="9" strokeLinecap="round" strokeDasharray={circle} strokeDashoffset={circle * (1 - progress / 100)} className="transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none" />
            </svg>
            <span className="absolute text-2xl font-semibold tabular-nums">{progress}<span className="text-sm">%</span></span>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-white/15 pt-4">
          <div>
            <p className="text-xs text-blue-100/80">{workloadProgress ? "Carga horária integralizada" : "Componentes concluídos ou dispensados"}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{workloadProgress ? `${workloadProgress.integralized.toLocaleString("pt-BR")}h` : completed} <span className="text-sm font-normal text-blue-100/80">de {workloadProgress ? `${workloadProgress.planned.toLocaleString("pt-BR")}h` : mainGrid.length}</span></p>
          </div>
          <div className="max-w-full rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 backdrop-blur-sm">
            <p className="text-[11px] font-medium uppercase tracking-wide text-blue-100/80">Conclusão estimada</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums">{completionTerm ?? "Sem prazo calculado"}</p>
            <p className="mt-0.5 text-[10px] leading-4 text-blue-100/75">{needsReview ? "Faixa automática · dados parciais" : "Estimativa automática"}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-blue-100/70">Projeção automática; pode variar conforme aprovação, oferta e rematrícula no prazo.</p>
      </article>

      {audience === "student" ? (
        <div className="grid grid-cols-2 gap-3">
          <CompactStat label="Período atual" value={currentPeriod ? `${currentPeriod}º` : "—"} note={currentPeriodConfirmed ? "Seu período no curso" : "Em conferência pela equipe"} tone="blue" />
          <CompactStat label="Concluídas" value={completed} note={`de ${mainGrid.length} disciplinas do curso`} tone="cyan" />
          <CompactStat label="Pendências" value={mappingRequired ? "—" : pending} note="De períodos anteriores, a cursar" tone="gold" />
          <CompactStat label="Em andamento" value={mappingRequired ? "—" : inProgress} note="Disciplinas anteriores que você já cursa" tone="slate" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <CompactStat label="Período atual" value={currentPeriod ? `${currentPeriod}º` : "—"} note={currentPeriodConfirmed ? "Mapeamento confirmado" : "Não identificado · conferir se necessário"} tone="blue" />
          <CompactStat label="Pendências anteriores" value={mappingRequired ? "—" : pending} note="Inclui reprovações registradas" tone="gold" />
          <CompactStat label="Em andamento" value={mappingRequired ? "—" : inProgress} note="Já ocupam vagas adicionais" tone="cyan" />
          <CompactStat label="Vagas adicionais" value={mappingRequired ? "—" : availableSlots} note={`${currentAE} AE/AE* no período atual`} tone="slate" />
        </div>
      )}
    </section>
  );
};

export const AcademicPeriodJourney = ({ disciplines, currentPeriod }) => {
  const periods = [...new Set(disciplines.filter((d) => d.inMainCurriculum && d.period !== null && d.period !== undefined).map((d) => d.period))].sort((a, b) => a - b);
  if (!periods.length) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_16px_40px_-36px_rgba(15,42,66,0.62)] sm:p-5" aria-labelledby="period-journey-title">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-brand-cyan-700">Mapa curricular</p>
          <h2 id="period-journey-title" className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Jornada por período</h2>
        </div>
        <p className="text-xs text-slate-500">Situações lidas do documento acadêmico, organizadas por período curricular.</p>
      </div>
      <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6" aria-label="Situação das disciplinas em cada período">
        {periods.map((period) => {
          const rows = disciplines.filter((d) => d.inMainCurriculum && d.period === period);
          const done = rows.filter((d) => ["COMPLETED", "EXEMPT"].includes(statusOutcome(d.normalizedStatus))).length;
          const pending = rows.filter((d) => statusOutcome(d.normalizedStatus) === "PENDING").length;
          const underway = rows.filter((d) => statusOutcome(d.normalizedStatus) === "IN_PROGRESS").length;
          const unknown = rows.filter((d) => statusOutcome(d.normalizedStatus) === "UNKNOWN").length;
          const isCurrent = period === currentPeriod;
          const isFuture = currentPeriod !== null && currentPeriod !== undefined && period > currentPeriod;
          const state = isCurrent ? "current" : isFuture ? "future" : pending || unknown ? "attention" : underway ? "underway" : "completed";
          const ratio = rows.length ? Math.round((done / rows.length) * 100) : 0;
          const title = state === "current" ? "Período atual" : state === "future" ? "Futuro" : state === "attention" ? "Com pendências" : state === "underway" ? "Em andamento" : "Concluído ou dispensado";
          return (
            <li key={period} aria-current={state === "current" ? "step" : undefined} className={cn("min-w-0 rounded-xl border p-3", state === "current" ? "border-[#0693E3]/60 bg-sky-50 shadow-[0_8px_24px_-20px_rgba(0,100,180,0.65)]" : state === "attention" ? "border-amber-200 bg-amber-50/65" : state === "completed" ? "border-slate-200 bg-slate-50/70" : state === "underway" ? "border-cyan-200 bg-cyan-50/60" : "border-slate-200 bg-white")}>
              <div className="flex items-center justify-between gap-1">
                <span className="text-sm font-semibold text-slate-900">{period}º período</span>
                <span className={cn("size-2 rounded-full", state === "current" ? "bg-[#0693E3]" : state === "attention" ? "bg-amber-500" : state === "completed" ? "bg-emerald-500" : state === "underway" ? "bg-cyan-500" : "bg-slate-300")} aria-hidden="true" />
              </div>
              <p className={cn("mt-1 truncate text-[11px] font-medium", state === "current" ? "text-sky-800" : state === "attention" ? "text-amber-800" : state === "underway" ? "text-cyan-800" : "text-slate-500")}>{title}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label={`Componentes concluídos no ${period}º período`} aria-valuemin={0} aria-valuemax={rows.length} aria-valuenow={done}>
                <div className={cn("h-full rounded-full", state === "current" ? "bg-[#0693E3]" : state === "underway" ? "bg-cyan-500" : "bg-emerald-500")} style={{ width: `${ratio}%` }} />
              </div>
              <p className="mt-2 text-[10px] leading-4 text-slate-600">{done}/{rows.length} concluídas{pending ? ` · ${pending} pend.` : ""}{underway ? ` · ${underway} cursando` : ""}{unknown ? ` · ${unknown} revisar` : ""}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
};

export const PendingDistribution = ({ byPeriod, totalPending, disciplines }) => {
  const periods = Object.entries(byPeriod || {}).sort(([a], [b]) => Number(a) - Number(b));
  if (!periods.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-5 text-center">
        <p className="text-sm font-semibold text-slate-800">Nenhuma pendência anterior identificada</p>
        <p className="mt-1 text-xs text-slate-500">Não há disciplinas com situação “A CURSAR” em períodos anteriores.</p>
      </div>
    );
  }
  const max = Math.max(...periods.map(([, count]) => count), 1);
  return (
    <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={`${totalPending} pendências distribuídas por período`}>
      {periods.map(([period, count]) => {
        const rows = (disciplines || []).filter((d) => String(d.period) === period);
        return (
          <details key={period} className="group min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white open:border-slate-300 open:shadow-sm">
            <summary className="cursor-pointer list-none transition-colors hover:bg-slate-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400 [&::-webkit-details-marker]:hidden">
              <div className="px-5 py-3.5">
                <div className="flex items-baseline justify-between gap-2"><span className="text-sm font-semibold text-slate-800">{period}º período</span><span className="text-xs tabular-nums text-slate-500">{count} de {totalPending}</span></div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${count} pendências no ${period}º período`}><div className="h-full rounded-full bg-[#0693E3]" style={{ width: `${Math.max(5, Math.round((count / max) * 100))}%` }} /></div>
                <div className="mt-3 flex items-center justify-between gap-2 text-sm font-medium text-slate-700">
                  <span>Ver disciplinas do {period}º período</span>
                  <span className="flex shrink-0 items-center gap-2"><span className="rounded-full bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800">{count} {count === 1 ? "pendência" : "pendências"}</span><span aria-hidden="true" className="text-xs text-slate-500 group-open:rotate-180">⌄</span></span>
                </div>
              </div>
            </summary>
            <div className="divide-y border-t border-slate-200 bg-slate-50/40">
              {rows.map((item, i) => (
                <div key={`${item.code}-${item.name}-${i}`} className="grid gap-1 px-3 py-2.5 text-sm sm:grid-cols-[5rem_minmax(0,1fr)]">
                  <span className="font-mono text-xs text-slate-500">{item.code || "Sem código"}</span>
                  <span className="min-w-0 font-medium text-slate-800">{readableName(item.name)}<span className="mt-0.5 block text-xs font-normal text-slate-500">{item.workload === null || item.workload === undefined ? "CH não informada" : `${item.workload}h`} · {item.originalStatus}</span></span>
                </div>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
};

// ------------------------------------------------------------------ "Seu caminho até a conclusão" (conclusion-path.tsx)

export const ConclusionPath = ({ steps, officialTerms, allOfficial = false, completion, showLoad = false }) => (
  <ol className="relative" aria-label="Semestres previstos até a conclusão">
    {steps.map((step, index) => {
      const groups = [
        ["Disciplinas do período", step.regularSubjectNames || [], "bg-[#0693E3]"],
        ["Já em andamento", step.inProgressSubjectNames || [], "bg-cyan-500"],
        ["Pendências de períodos anteriores", step.previousSubjects || [], "bg-amber-400"],
      ].filter(([, names]) => names.length > 0);
      const total = groups.reduce((sum, [, names]) => sum + names.length, 0);
      const chips = [
        step.regularSubjectNames && step.regularSubjectNames.length ? pluralize(step.regularSubjectNames.length, "do período", "do período") : null,
        step.inProgressSubjectNames && step.inProgressSubjectNames.length ? pluralize(step.inProgressSubjectNames.length, "em andamento", "em andamento") : null,
        step.previousSubjects && step.previousSubjects.length ? pluralize(step.previousSubjects.length, "pendência anterior", "pendências anteriores") : null,
        step.exemptions ? pluralize(step.exemptions, "dispensa", "dispensas") : null,
      ].filter(Boolean);
      const first = index === 0;
      const projected = Boolean(step.term && !allOfficial && !(officialTerms && officialTerms.has(step.term)));
      return (
        <li key={`${step.curriculumPeriod}-${step.term}-${index}`} className="relative pb-7 pl-8 sm:pl-10">
          <span aria-hidden="true" className="absolute bottom-0 left-[7px] top-5 w-0.5 rounded-full bg-gradient-to-b from-[#0693E3]/50 to-slate-200 sm:left-[11px]" />
          <span aria-hidden="true" className={cn("absolute left-0 top-1 grid size-4 place-items-center rounded-full ring-4 sm:left-1", first ? "bg-[#0693E3] ring-sky-100" : step.isAdditional ? "bg-amber-400 ring-amber-100" : "border-2 border-[#0693E3] bg-white ring-sky-100")} />
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">
                {step.isAdditional ? `Semestre adicional ${step.adaptationSemesterNumber ?? ""}` : `${step.curriculumPeriod}º período`}
                {first && <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] tracking-wide text-sky-800">agora</span>}
              </p>
              <h3 className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                {step.term ?? "A definir"}
                {projected && <span className="ml-2 align-middle text-xs font-normal tracking-normal text-slate-400">previsto</span>}
              </h3>
            </div>
            <p className="flex items-center gap-2 text-sm font-medium text-slate-600">
              {pluralize(total, "disciplina", "disciplinas")}
              {showLoad && <span title="Carga prevista / capacidade do semestre" className={cn("rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", step.totalLoad >= step.capacity ? "bg-amber-100 text-amber-900" : "bg-sky-50 text-sky-800")}>Carga {step.totalLoad}/{step.capacity}</span>}
            </p>
          </div>
          {chips.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-1.5">
              {chips.map((chip) => <span key={chip} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{chip}</span>)}
            </p>
          )}
          {total > 0 && (
            <details open={first} className="group mt-3 rounded-2xl border border-slate-200 bg-white shadow-[0_10px_30px_-28px_rgba(15,42,66,0.6)] open:border-sky-200">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#003B71] [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">Ver as disciplinas deste semestre</span>
                <span className="hidden group-open:inline">Disciplinas deste semestre</span>
                <span aria-hidden="true" className="text-slate-400 transition-transform group-open:rotate-180">⌄</span>
              </summary>
              <div className="space-y-4 border-t border-slate-100 px-4 pt-3 pb-4">
                {groups.map(([label, names, dot]) => (
                  <div key={label}>
                    <p className="text-[11px] font-semibold tracking-[0.1em] text-slate-500 uppercase">{label}</p>
                    <ul className="mt-1 gap-x-8 sm:columns-2">
                      {names.map((name, nameIndex) => (
                        <li key={`${name}-${nameIndex}`} className="flex break-inside-avoid items-start gap-2.5 border-b border-slate-100 py-2 text-sm leading-5 text-slate-800">
                          <span aria-hidden="true" className={cn("mt-[7px] size-1.5 shrink-0 rounded-full", dot)} />
                          <span className="min-w-0">{readableName(name)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          )}
        </li>
      );
    })}
    <li className="relative pl-8 sm:pl-10">
      <span aria-hidden="true" className="absolute -left-1 top-0 grid size-6 place-items-center rounded-full bg-[#003B71] text-[#FEF84C] ring-4 ring-[#FEF84C]/30 sm:left-0">
        <GraduationCap className="size-3.5" />
      </span>
      <p className="text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Conclusão prevista</p>
      <p className="mt-0.5 text-2xl font-semibold tracking-tight text-[#003B71] tabular-nums">{completion ?? "Em cálculo"}</p>
    </li>
  </ol>
);

// ------------------------------------------------------------------ the message for the student and the vacancy formula (workspace.tsx)

export const StudentMessagePreview = ({ message }) => {
  const blocks = String(message || "").trim().split(/\n\s*\n/).filter(Boolean);
  return (
    <div className="space-y-4 rounded-2xl border border-sky-100 bg-gradient-to-br from-white via-white to-sky-50/80 p-4 shadow-sm sm:p-5">
      {blocks.map((block, index) => {
        const lines = block.split("\n").filter(Boolean);
        if (lines.every((line) => line.trimStart().startsWith("•"))) {
          return (
            <div key={`results-${index}`} className="grid gap-2 sm:grid-cols-2" aria-label="Resumo dos resultados">
              {lines.map((line, lineIndex) => {
                const content = line.trim().replace(/^•\s*/, "");
                const separator = content.indexOf(":");
                const label = separator >= 0 ? content.slice(0, separator) : `Resultado ${lineIndex + 1}`;
                const value = separator >= 0 ? content.slice(separator + 1).trim() : content;
                return (
                  <div key={`${label}-${lineIndex}`} className="min-w-0 rounded-xl border border-sky-100 bg-sky-50/65 p-3 sm:p-3.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-sky-800">{label}</p>
                    <p className="mt-1 break-words text-sm font-medium leading-5 text-slate-800">{value}</p>
                  </div>
                );
              })}
            </div>
          );
        }
        return <p key={`paragraph-${index}`} className={cn("whitespace-pre-wrap text-sm leading-6 text-slate-700", index === 0 && "border-l-4 border-sky-500 pl-3 font-medium text-slate-900")}>{block}</p>;
      })}
    </div>
  );
};

export const FormulaFlow = ({ label, values, operators }) => (
  <div role="group" aria-label={label} className="rounded-xl border border-slate-200 bg-slate-50/65 p-3 sm:p-4">
    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <div className="flex flex-wrap items-stretch gap-2">
      {values.map((item, index) => (
        <div key={item.label} className="flex min-w-0 flex-1 basis-[7.5rem] items-center gap-2">
          <div className={cn("min-w-0 flex-1 rounded-lg border p-3", index === values.length - 1 ? "border-brand-navy/20 bg-brand-navy text-white" : "border-slate-200 bg-white")}>
            <p className="text-2xl font-bold tabular-nums">{item.value}</p>
            <p className={cn("text-[11px] leading-4", index === values.length - 1 ? "text-white/75" : "text-muted-foreground")}>{item.label}</p>
          </div>
          {operators[index] && <span className="shrink-0 self-center text-lg font-medium text-slate-400" aria-hidden="true">{operators[index]}</span>}
        </div>
      ))}
    </div>
  </div>
);

export const statusBadgeClass = {
  success: "bg-status-success-bg text-status-success",
  warning: "bg-status-warning-bg text-status-warning",
  danger: "bg-status-danger-bg text-status-danger",
  info: "bg-status-info-bg text-status-info",
  neutral: "bg-status-neutral-bg text-status-neutral",
};

// A dialog is drawn straight into <body>: the pages animate when they open (filter/transform), and inside such an
// element "position: fixed" is measured from the element, not from the window, which pushes the dialog out of view.
// `orig` is repeated because the portal leaves the page that carries it.
export const Portal = ({ children }) => createPortal(<div className="orig">{children}</div>, document.body);
