import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHistory, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { ArrowDown, Check, ChevronDown, ClipboardCopy, HelpCircle, Search, SlidersHorizontal, Trash2, X } from "lucide-react";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { errorText } from "../Analysis/shared";
import heroImage from "../../assets/orig/foto-04-cruzeiro.jpg";
import { BackButton, Badge, Button, Card, CardContent, Input, Portal, cn, formatDay, pluralize } from "../Analysis/orig";
import SectionBoundary from "../../components/SectionBoundary";
import { EnrollmentBanner, FollowUpPanel, ProposalCard } from "./FollowUp";

// "Análise curricular", as in the original system: the PDF of the candidate's curricular analysis (SIAA) becomes the
// forecast of the entry, semester by semester, with the text ready for WhatsApp. The numbers come from the academic
// engine, never from an AI.

const RELIABILITY = {
  HIGH: ["Verificada", "bg-status-success-bg text-status-success"],
  REVIEW_RECOMMENDED: ["Verificada com observações", "bg-status-warning-bg text-status-warning"],
  REVIEW_REQUIRED: ["Informações necessárias", "bg-status-danger-bg text-status-danger"],
};
const STATUS_LABEL = { EXEMPTED: "Dispensada", PENDING: "Pendente", REVIEW: "Revisar" };
const STATUS_CLASS = { EXEMPTED: "bg-status-success-bg text-status-success", PENDING: "bg-status-danger-bg text-status-danger", REVIEW: "bg-status-warning-bg text-status-warning" };
const ordinal = (n) => `${n}º`;
const PERIODS = Array.from({ length: 12 }, (_, i) => i + 1);
const MAX_MB = 20;

// the term the forecast starts from while nobody types another one (the same in the server)
const DEFAULT_TERM = "2026.2";

const selectClass = "block h-10 w-full appearance-none whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 pr-10 text-sm font-normal text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-ring";

const Select = ({ children, className, ...props }) => (
  <span className="relative block">
    <select className={cn(selectClass, className)} {...props}>{children}</select>
    <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
  </span>
);

const StatusBadge = ({ status }) => <Badge variant="outline" className={cn("border-transparent font-medium", STATUS_CLASS[status])}>{STATUS_LABEL[status]}</Badge>;
const StatusIcon = ({ status }) => status === "EXEMPTED" ? <Check className="size-4 text-status-success" aria-label="Dispensada" /> : status === "PENDING" ? <X className="size-4 text-status-danger" aria-label="Pendente" /> : <HelpCircle className="size-4 text-status-warning" aria-label="Revisar" />;

const PageHeader = ({ eyebrow, title, description }) => (
  <div className="mb-6 flex animate-blur-fade flex-col gap-4 md:flex-row md:items-end md:justify-between">
    <div className="min-w-0 flex-1 space-y-1">
      {eyebrow && <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-cyan-700"><span aria-hidden="true" className="h-px w-6 bg-gradient-to-r from-brand-cyan to-transparent" />{eyebrow}</div>}
      <h1 className="break-words bg-gradient-to-r from-[#003B71] via-[#0a5a9a] to-[#0693e3] bg-clip-text text-2xl font-semibold tracking-tight text-transparent [overflow-wrap:anywhere] sm:text-3xl">{title}</h1>
      {description && <div className="max-w-2xl break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">{description}</div>}
    </div>
  </div>
);

const Modal = ({ title, description, children, onClose }) => (
  <Portal><div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[1300] grid place-items-center p-4">
    <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-black/40" />
    <div className="relative w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 shadow-xl">
      <div><h2 className="text-base font-semibold text-slate-900">{title}</h2>{description && <p className="mt-1 text-sm text-slate-500">{description}</p>}</div>
      {children}
    </div>
  </div></Portal>
);

// ------------------------------------------------------------------ new analysis (page of the original)

const UploadCard = ({ onCreated }) => {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [entry, setEntry] = useState("");
  const [term, setTerm] = useState(DEFAULT_TERM);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const choose = (candidate) => {
    if (!candidate || busy) return;
    if (candidate.type !== "application/pdf" && !candidate.name.toLowerCase().endsWith(".pdf")) { toast.error("Selecione um documento em PDF."); return; }
    if (candidate.size > MAX_MB * 1024 * 1024) { toast.error(`O arquivo excede ${MAX_MB} MB.`); return; }
    setFile(candidate);
  };
  const send = async () => {
    if (!file || busy) return;
    if (!/^\d{4}\.[12]$/.test(term)) { toast.error("Informe o primeiro semestre no formato 2026.2."); return; }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (entry) form.append("entryPeriod", entry);
      form.append("startTerm", term);
      if (name.trim()) form.append("candidateName", name.trim());
      const { data } = await api.post("/analysis/curricular", form);
      toast.success("Análise pronta.");
      onCreated(data);
    } catch (e) { toast.error(errorText(e), { autoClose: 9000 }); }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <div
        role="button" tabIndex={0} aria-label="Selecionar ou arrastar o PDF da análise" aria-busy={busy}
        onClick={() => { if (!busy && inputRef.current) inputRef.current.click(); }}
        onKeyDown={(e) => { if (!busy && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); if (inputRef.current) inputRef.current.click(); } }}
        onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length !== 1) toast.error("Envie apenas 1 documento."); else choose(e.dataTransfer.files[0]); }}
        className={cn("flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center shadow-inner transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 sm:p-10", dragging ? "scale-[1.01] border-brand-cyan bg-gradient-to-br from-brand-cyan-50 to-white" : "border-slate-300 bg-gradient-to-br from-white via-slate-50 to-cyan-50/70 hover:border-brand-cyan/70 hover:from-white hover:to-cyan-50")}
      >
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { if (e.target.files.length === 1) choose(e.target.files[0]); }} />
        <span className="rounded-lg border bg-brand-navy-50 px-3 py-1 text-xs font-bold tracking-[0.16em] text-brand-navy">PDF</span>
        <strong className="mt-3 max-w-full break-all text-base">{file ? file.name : "Envie o PDF da análise curricular"}</strong>
        <span className="mt-1 text-sm text-muted-foreground">{busy ? "Lendo a grade e calculando a previsão…" : file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · clique para trocar` : `Arraste o documento para cá ou selecione um arquivo · até ${MAX_MB} MB`}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-semibold text-slate-600">Nome do candidato (opcional)
          <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 h-10 bg-white" />
        </label>
        <label className="block text-xs font-semibold text-slate-600">Período de ingresso
          <span className="mt-1.5 block"><Select value={entry} onChange={(e) => setEntry(e.target.value)}><option value="">Usar o do PDF</option>{PERIODS.map((n) => <option key={n} value={n}>{n}º período</option>)}</Select></span>
        </label>
        <label className="block text-xs font-semibold text-slate-600">Primeiro semestre letivo
          <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="2026.2" className="mt-1.5 h-10 bg-white" />
        </label>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-xs leading-5 text-slate-600">Em qual semestre da grade o candidato entra. Se ficar em branco, uso o que o PDF informar.</p>
        <Button onClick={send} disabled={!file || busy} className="w-full sm:w-auto">{busy ? "Lendo documento…" : "Gerar análise"}</Button>
      </div>
    </div>
  );
};

const List = () => {
  const history = useHistory();
  const [rows, setRows] = useState(null);
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [onlyDue, setOnlyDue] = useState(false);
  const load = useCallback(() => {
    api.get("/analysis/curricular", { params: { search: applied.trim() || undefined } }).then(({ data }) => setRows(data)).catch((e) => { toastError(e); setRows([]); });
  }, [applied]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="orig mx-auto w-full max-w-[1440px] flex-1 space-y-6 overflow-y-auto p-4 pb-8 sm:p-6 md:space-y-8" style={{ minHeight: 0 }}>
      <section className="relative isolate overflow-hidden rounded-2xl bg-brand-navy shadow-sm md:rounded-3xl">
        <img src={heroImage} alt="Estudante da Cruzeiro do Sul Virtual" className="absolute inset-0 -z-20 size-full object-cover object-[62%_42%]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-brand-navy via-brand-navy/90 to-brand-navy/20" />
        <div className="max-w-xl px-6 py-10 text-white sm:px-10 sm:py-14 lg:px-14 lg:py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold">Nova análise</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Previsão curricular pronta, com poucos passos.</h1>
          <p className="mt-4 max-w-lg text-sm leading-6 text-white/85 sm:text-base">Envie o PDF e informe o ingresso do candidato. O sistema organiza a grade, as pendências e a previsão automaticamente.</p>
        </div>
      </section>
      <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6 lg:p-8">
        <UploadCard onCreated={(a) => history.push(`/analise-curricular/${a.id}`)} />
      </section>

      <SectionBoundary name="Retornos pendentes"><FollowUpPanel /></SectionBoundary>

      <section>
        <PageHeader eyebrow="Análises" title="Análises curriculares" description="As análises feitas por você, da mais recente para a mais antiga." />
        <form onSubmit={(e) => { e.preventDefault(); setApplied(query); }} className="mb-4 flex flex-col gap-2 sm:flex-row">
          <span className="relative block sm:w-80"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar candidato ou curso" className="h-10 bg-white pl-9" /></span>
          <Button type="submit" size="lg" className="h-10"><Search className="mr-2 size-4" />Buscar</Button>
          <label className="flex h-10 items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} className="size-4 accent-[#003B71]" style={{ appearance: "auto" }} />Só retornos vencidos</label>
        </form>
        {rows === null ? <p className="text-sm text-slate-500">Carregando…</p> : rows.filter((r) => !onlyDue || (r.enrollment && r.enrollment.due)).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center">{rows.length > 0 && onlyDue ? <p className="font-medium text-slate-800">Nenhum retorno vencido.</p> : <><p className="font-medium text-slate-800">Nenhuma análise curricular ainda.</p><p className="mt-1 text-sm text-slate-500">Envie o PDF do candidato acima: o sistema lê a grade, calcula quantas disciplinas faltam e mostra, semestre a semestre, quando ele termina o curso.</p></>}</div>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] text-left text-sm">
                <thead><tr className="border-b text-xs text-muted-foreground"><th className="px-4 py-3 font-medium">Candidato</th><th className="px-4 py-3 font-medium">Curso</th><th className="px-4 py-3 font-medium">Ingresso</th><th className="px-4 py-3 font-medium">Previsão</th><th className="px-4 py-3 font-medium">Verificação</th><th className="px-4 py-3 font-medium">Retorno</th><th className="px-4 py-3 font-medium">Data</th></tr></thead>
                <tbody>
                  {rows.filter((r) => !onlyDue || (r.enrollment && r.enrollment.due)).map((r) => {
                    const sim = r.result && r.result.simulation;
                    const enr = r.enrollment || { status: "PENDING" };
                    const rel = r.result && RELIABILITY[r.result.reliability];
                    return (
                      <tr key={r.id} onClick={() => history.push(`/analise-curricular/${r.id}`)} className="cursor-pointer border-b last:border-0 hover:bg-muted/50">
                        <td className="px-4 py-3 font-medium text-slate-900">{r.candidateName || "Candidato sem nome"}</td>
                        <td className="px-4 py-3 text-slate-600">{r.courseName || r.originalName}</td>
                        <td className="px-4 py-3">{r.entryPeriod ? ordinal(r.entryPeriod) : <span className="text-status-warning">Pendente</span>}</td>
                        <td className="px-4 py-3 font-semibold text-brand-navy">{sim && sim.estimatedCompletionTerm ? sim.estimatedCompletionTerm : "—"}</td>
                        <td className="px-4 py-3">{rel ? <Badge variant="outline" className={cn("border-transparent font-medium", rel[1])}>{rel[0]}</Badge> : "—"}</td>
                        <td className="px-4 py-3">{enr.status === "ENROLLED" ? <Badge variant="outline" className="border-transparent bg-status-success-bg font-medium text-status-success">Matriculou</Badge> : enr.status === "NOT_ENROLLED" ? <Badge variant="outline" className="border-transparent bg-status-danger-bg font-medium text-status-danger">Não matriculou</Badge> : enr.due ? <Badge variant="outline" className="border-transparent bg-status-warning-bg font-medium text-status-warning">Retorno vencido</Badge> : <Badge variant="outline" className="border-transparent bg-muted font-medium text-muted-foreground">Aguardando</Badge>}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{new Date(r.createdAt).toLocaleString("pt-BR")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>
    </div>
  );
};

// ------------------------------------------------------------------ result page (analysis-view of the original)

const SummaryCards = ({ a }) => {
  const r = a.result || {};
  const totals = r.totals || { total: 0, exempted: 0, pending: 0, review: 0 };
  const sim = r.simulation;
  const rel = RELIABILITY[r.reliability];
  const cards = [
    { label: "Curso", value: a.courseName || "Não identificado", source: "PDF", span: true },
    { label: a.entryPeriodSource === "USER" ? "Cenário de ingresso" : "Período no PDF", value: a.entryPeriod ? ordinal(a.entryPeriod) : "Não identificado", source: a.entryPeriodSource === "USER" ? "Simulação" : "PDF", tone: a.entryPeriod ? "" : "text-status-warning" },
    { label: "Total da grade", value: totals.total, source: "PDF" },
    { label: "Dispensadas", value: totals.exempted, source: "Disciplina utilizada", tone: "text-status-success" },
    { label: "Pendentes", value: totals.pending + totals.review, source: "Disciplina utilizada", tone: "text-status-danger", hint: totals.review ? `${totals.review} a revisar` : undefined },
    { label: "Pendências anteriores", value: r.previousBacklogCount ?? "—", source: "Motor" },
    { label: "Semestres restantes", value: sim ? sim.semestersRemaining ?? sim.semesters.length : "—", source: `Motor v${r.engineVersion || "1"}`, hint: sim && sim.incomplete ? "previsão incompleta" : undefined },
    { label: "Previsão estimada", value: sim && sim.estimatedCompletionTerm ? sim.estimatedCompletionTerm : sim && sim.incomplete ? "Regra pendente" : "—", source: "Regra", tone: sim && sim.estimatedCompletionTerm ? "text-brand-navy" : "text-status-warning" },
    { label: "Verificação", value: rel ? <Badge variant="outline" className={cn("border-transparent font-medium", rel[1])}>{rel[0]}</Badge> : "—", hint: r.reviewItemsCount ? pluralize(r.reviewItemsCount, "observação registrada", "observações registradas") : "Sem observações" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {cards.map((c, index) => (
        <Card key={c.label} className={cn("animate-blur-fade shadow-sm", c.span && "col-span-2 md:col-span-1")} style={{ animationDelay: `${index * 45}ms` }}>
          <CardContent className="space-y-1.5">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{c.label}</div>
            <div className={cn("min-w-0 break-words text-xl font-semibold tracking-tight", c.tone)} title={typeof c.value === "string" ? c.value : undefined}>{c.value}</div>
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              {c.source ? <span className="inline-flex items-center rounded border border-dashed px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{c.source}</span> : <span />}
              {c.hint && <span className="min-w-0 text-[11px] text-muted-foreground">{c.hint}</span>}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

const GradeByPeriod = ({ subjects, entryPeriod }) => {
  const periods = [...new Set(subjects.map((s) => s.period))].sort((a, b) => a - b);
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {periods.map((p) => {
        const list = subjects.filter((s) => s.period === p);
        const exempted = list.filter((s) => s.status === "EXEMPTED").length;
        const isBefore = entryPeriod !== null && entryPeriod !== undefined && p < entryPeriod;
        const isEntry = entryPeriod === p;
        return (
          <div key={p} className={cn("rounded-xl border bg-card shadow-sm", isEntry && "ring-2 ring-brand-cyan")}>
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <div className="font-semibold">{p}º PERÍODO</div>
              <div className="text-xs text-muted-foreground">
                {exempted}/{list.length} dispensadas
                {isEntry && <span className="ml-2 rounded bg-brand-cyan-50 px-1.5 py-0.5 text-brand-cyan-700">ingresso</span>}
                {isBefore && <span className="ml-2 rounded bg-status-neutral-bg px-1.5 py-0.5">anterior</span>}
              </div>
            </div>
            <ul className="divide-y">
              {list.map((s) => (
                <li key={s.id} className="flex items-start gap-3 px-4 py-2.5">
                  <div className="mt-0.5"><StatusIcon status={s.status} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium leading-tight">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{STATUS_LABEL[s.status]} · {s.workload}h{s.usedSubject && <> · Utilizada: <span className="text-foreground">{s.usedSubject}</span></>}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
};

const GradeTable = ({ subjects, onStatus }) => {
  const [filter, setFilter] = useState("ALL");
  const [period, setPeriod] = useState("ALL");
  const [q, setQ] = useState("");
  const periods = [...new Set(subjects.map((s) => s.period))].sort((a, b) => a - b);
  const rows = subjects.filter((s) => (filter === "ALL" || s.status === filter) && (period === "ALL" || String(s.period) === period) && (!q.trim() || String(s.name || "").toLowerCase().includes(q.trim().toLowerCase())));
  const FILTERS = [["ALL", "Todas"], ["EXEMPTED", "Dispensadas"], ["PENDING", "Pendentes"], ["REVIEW", "Revisar"]];
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(([v, label]) => (
            <button key={v} type="button" onClick={() => setFilter(v)} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", filter === v ? "border-brand-navy bg-brand-navy text-white" : "bg-card hover:bg-muted")}>
              {label}<span className="ml-1 opacity-70">{v === "ALL" ? subjects.length : subjects.filter((s) => s.status === v).length}</span>
            </button>
          ))}
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-40"><option value="ALL">Todos os períodos</option>{periods.map((p) => <option key={p} value={p}>{p}º período</option>)}</Select>
          <span className="relative block w-full sm:w-56"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar disciplina" className="h-10 bg-white pl-9" /></span>
        </div>
      </div>
      <div className="max-h-[calc(100dvh-21rem)] min-h-72 overflow-y-auto rounded-xl border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--border)]"><tr className="text-xs text-muted-foreground"><th className="w-10 p-3" /><th className="p-3 font-medium">Disciplina</th><th className="w-20 p-3 font-medium">C.H.</th><th className="w-24 p-3 font-medium">Período</th><th className="p-3 font-medium">Disciplina utilizada</th><th className="w-44 p-3 font-medium">Situação (corrigir)</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Nenhuma disciplina para este filtro.</td></tr>}
            {rows.map((s) => (
              <tr key={s.id} className="border-t align-top hover:bg-muted/40">
                <td className="p-3"><StatusIcon status={s.status} /></td>
                <td className="p-3 font-medium">{s.name}{s.code && <span className="ml-2 font-mono text-[11px] font-normal text-muted-foreground">#{s.code}</span>}</td>
                <td className="p-3">{s.workload}h</td>
                <td className="p-3">{s.period}º</td>
                <td className="p-3 text-muted-foreground">{s.usedSubject || "—"}</td>
                <td className="p-3"><Select value={s.status} onChange={(e) => onStatus(s, e.target.value)} className="h-9">{Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const PendingTab = ({ subjects, entryPeriod }) => {
  const needs = subjects.filter((s) => s.status === "PENDING" || s.status === "REVIEW");
  const backlog = entryPeriod === null || entryPeriod === undefined ? [] : needs.filter((s) => s.period < entryPeriod).sort((a, b) => a.period - b.period);
  const regular = entryPeriod === null || entryPeriod === undefined ? needs : needs.filter((s) => s.period >= entryPeriod);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-4 py-3"><h3 className="font-semibold">Pendências anteriores ao ingresso (backlog)</h3><p className="text-xs text-muted-foreground">Ordem de alocação: período mais antigo primeiro; dentro do período, ordem do documento.</p></div>
        {entryPeriod === null || entryPeriod === undefined ? <div className="p-6 text-sm text-muted-foreground">O PDF não informou o período de ingresso. Use “Simular outro período” para separar o backlog.</div>
          : backlog.length === 0 ? <div className="p-6 text-sm text-muted-foreground">Nenhuma pendência de períodos anteriores.</div> : (
            <ol className="divide-y">
              {backlog.map((s, i) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-6 text-right font-mono text-xs text-muted-foreground">{i + 1}</span>
                  <div className="min-w-0 flex-1"><div className="text-sm font-medium">{s.name}</div><div className="text-xs text-muted-foreground">{s.period}º período · {s.workload}h</div></div>
                  <StatusBadge status={s.status} />
                </li>
              ))}
            </ol>
          )}
      </section>
      <section className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-4 py-3"><h3 className="font-semibold">A cursar como regulares</h3><p className="text-xs text-muted-foreground">Pendentes do período de ingresso em diante — cursadas no próprio período.</p></div>
        {regular.length === 0 ? <div className="p-6 text-sm text-muted-foreground">Nenhuma.</div> : (
          <ul className="divide-y">
            {regular.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1"><div className="text-sm font-medium">{s.name}</div><div className="text-xs text-muted-foreground">{s.period}º período · {s.workload}h</div></div>
                <StatusBadge status={s.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

const renderBold = (line) => String(line).split(/(\*[^*]+\*)/g).map((p, i) => (p.startsWith("*") && p.endsWith("*") ? <strong key={i}>{p.slice(1, -1)}</strong> : <span key={i}>{p}</span>));

const Stat = ({ label, value, tone }) => (
  <div><div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div><div className={cn("text-lg font-semibold", tone)}>{value}</div></div>
);

const SemesterCard = ({ s, byId }) => {
  const [open, setOpen] = useState(false);
  const full = s.semesterLoad >= s.maximumCapacity;
  const cap = Math.max(1, s.maximumCapacity);
  const SubjectList = ({ title, ids, accent }) => (
    <div>
      <div className={cn("mb-1.5 text-xs font-semibold uppercase tracking-wider", accent ? "text-brand-cyan-700" : "text-muted-foreground")}>{title} ({ids.length})</div>
      {ids.length === 0 ? <div className="text-sm text-muted-foreground">—</div> : (
        <ul className="space-y-1 text-sm">{ids.map((id) => { const x = byId.get(id); return <li key={id} className="flex justify-between gap-2"><span>{x ? x.name : id}</span><span className="shrink-0 text-xs text-muted-foreground">{x ? `${x.period}º · ${x.workload}h` : ""}</span></li>; })}</ul>
      )}
    </div>
  );
  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
        <div className="min-w-[110px]"><div className="text-xl font-semibold tracking-tight">{s.term}</div><div className="text-xs text-muted-foreground">{s.isAdditional ? "Semestre adicional" : `${s.periodNumber}º período`}</div></div>
        <Stat label="Regulares" value={s.regularSubjectsToTake} />
        <Stat label="Adaptações" value={s.subjectsFromBacklog} tone="text-brand-cyan-700" />
        <Stat label="Total" value={`${s.semesterLoad} / ${s.maximumCapacity}`} tone={full ? "text-brand-navy" : undefined} />
        <Stat label="Pendências restantes" value={s.remainingBacklog} tone={s.remainingBacklog ? "text-status-danger" : "text-status-success"} />
        <div className="ml-auto"><Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>{open ? "Ocultar disciplinas" : "Ver disciplinas"}</Button></div>
      </div>
      <div className="h-1.5 w-full bg-muted">
        <div className="h-full bg-brand-navy transition-all" style={{ width: `${Math.min(100, (s.regularSubjectsToTake / cap) * 100)}%` }} />
        <div className="-mt-1.5 h-1.5 bg-brand-cyan transition-all" style={{ marginLeft: `${Math.min(100, (s.regularSubjectsToTake / cap) * 100)}%`, width: `${Math.min(100, (s.subjectsFromBacklog / cap) * 100)}%` }} />
      </div>
      {open && (
        <div className="grid gap-4 border-t px-5 py-4 md:grid-cols-2">
          <SubjectList title="Regulares" ids={s.regularSubjectIds || []} />
          <SubjectList title="Adaptações (pendências anteriores)" ids={s.backlogSubjectIds || []} accent />
        </div>
      )}
    </div>
  );
};

const Timeline = ({ a, byId }) => {
  const r = a.result || {};
  const sim = r.simulation;
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); toast.success("Previsão copiada."); } catch (e) { toast.error("Não foi possível copiar."); } };
  if (a.entryPeriod === null || a.entryPeriod === undefined) return <p className="text-sm text-muted-foreground">O PDF não informou o período de ingresso. Use “Simular outro período” apenas se quiser comparar cenários.</p>;
  if (!sim || !sim.semesters.length) return <p className="text-sm text-muted-foreground">Nenhuma disciplina a cursar: todas as disciplinas estão dispensadas.</p>;
  const n = r.narrative;
  return (
    <div className="space-y-2">
      {n && (
        <div className="mb-4 rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Previsão em texto</div>
              <ul className="mt-2 space-y-0.5 text-sm">{(n.headerLines || []).map((l) => <li key={l}>{renderBold(l)}</li>)}</ul>
            </div>
            <Button variant="outline" size="sm" onClick={() => copy(n.text)}><ClipboardCopy className="size-4" /> Copiar</Button>
          </div>
          <div className="mt-3 text-sm font-medium">A previsão fica assim:</div>
          <ul className="mt-1 space-y-1 text-sm">{(n.bulletLines || []).map((l) => <li key={l}>{renderBold(l)}</li>)}</ul>
          {n.conclusionLine && <p className={cn("mt-3 text-sm", sim.incomplete ? "text-status-warning" : "font-medium text-brand-navy")}>{renderBold(n.conclusionLine)}</p>}
        </div>
      )}
      {sim.semesters.map((s, i) => (
        <div key={s.index}>
          <SemesterCard s={s} byId={byId} />
          {i < sim.semesters.length - 1 && <div className="flex justify-center py-1 text-muted-foreground/50"><ArrowDown className="size-4" /></div>}
        </div>
      ))}
      {sim.incomplete && <div className="rounded-xl border border-dashed border-status-warning/40 bg-status-warning-bg p-4 text-sm text-status-warning">Restam <strong>{pluralize((sim.remainingBacklogIds || []).length, "disciplina", "disciplinas")}</strong> sem semestre definido. A previsão será concluída após configurar a regra de semestre adicional.</div>}
      {sim.estimatedCompletionTerm && (
        <div className="rounded-xl bg-brand-navy p-4 text-white">
          <div className="text-xs uppercase tracking-wider opacity-70">Previsão estimada de conclusão</div>
          <div className="text-2xl font-semibold">{sim.estimatedCompletionTerm}</div>
          <div className="text-xs opacity-70">{pluralize(sim.semestersRemaining ?? sim.semesters.length, "semestre previsto", "semestres previstos")}</div>
        </div>
      )}
    </div>
  );
};

const Audit = ({ a }) => {
  const r = a.result || {};
  const warnings = r.warnings || [];
  return (
    <div className="space-y-4">
      {r.reviewReasons && r.reviewReasons.length > 0 && (
        <div className="rounded-xl border bg-card p-4 shadow-sm"><h3 className="font-semibold">Motivos de revisão</h3><ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-700">{r.reviewReasons.map((m) => <li key={m}>{m}</li>)}</ul></div>
      )}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-4 py-3"><h3 className="font-semibold">Avisos da leitura</h3></div>
        {warnings.length === 0 ? <div className="p-6 text-sm text-muted-foreground">Nenhum aviso. A leitura do documento confere com os totais calculados.</div> : (
          <ul className="divide-y">
            {warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-3 px-4 py-3 text-sm">
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", w.severity === "CRITICAL" ? "bg-status-danger" : "bg-status-warning")} aria-hidden="true" />
                <span>{w.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

const TABS = [["summary", "Resumo"], ["grade", "Grade curricular"], ["pending", "Pendências"], ["projection", "Previsão"], ["audit", "Conferência"]];

const Detail = ({ id }) => {
  const history = useHistory();
  const [a, setA] = useState(null);
  const [tab, setTab] = useState("summary");
  const [modal, setModal] = useState(null);
  const [entry, setEntry] = useState("");
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState(false);

  const apply = useCallback((data) => { setA(data); setEntry(data.entryPeriod || ""); setTerm(data.startTerm || ""); }, []);
  useEffect(() => { api.get(`/analysis/curricular/${id}`).then(({ data }) => apply(data)).catch((e) => { toastError(e); history.replace("/analise-curricular"); }); }, [id, apply, history]);

  const save = async (patch, ok) => {
    setBusy(true);
    try { const { data } = await api.put(`/analysis/curricular/${id}`, patch); apply(data); toast.success(ok); setModal(null); } catch (e) { toast.error(errorText(e)); }
    setBusy(false);
  };
  const setStatus = async (s, status) => {
    try { const { data } = await api.put(`/analysis/curricular/${id}/subject/${s.id}`, { status }); apply(data); toast.success("Linha corrigida. A previsão foi recalculada."); } catch (e) { toast.error(errorText(e)); }
  };
  const remove = async () => { try { await api.delete(`/analysis/curricular/${id}`); toast.success("Análise excluída."); history.replace("/analise-curricular"); } catch (e) { toastError(e); } };
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); toast.success("Texto copiado. É só colar na conversa."); } catch (e) { toast.error("Não foi possível copiar."); } };

  const byId = useMemo(() => new Map((a ? a.subjects || [] : []).map((s) => [s.id, s])), [a]);
  if (!a) return <div className="orig flex-1 p-8 text-sm text-slate-500">Carregando…</div>;
  const r = a.result || {};
  const subjects = a.subjects || [];
  const warningsCount = (r.warnings || []).length;
  const ready = a.status ? a.status === "COMPLETED" || a.status === "DONE" || a.status === "READY" : true;

  return (
    <div className="orig flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
      <div className="mx-auto w-full max-w-[1440px] space-y-6 p-4 pb-10 sm:p-6">
        <div>
          <BackButton to="/analise-curricular" label="Voltar às análises" className="mb-4" />
          <PageHeader
            eyebrow={<span className="inline-flex items-center gap-2">Análise curricular {ready && <Badge variant="outline" className="border-transparent bg-status-success-bg font-medium text-status-success">Pronta</Badge>}</span>}
            title={a.candidateName || a.courseName || "Análise curricular"}
            description={<>
              {a.candidateName && a.courseName && <span className="block font-medium text-foreground">{a.courseName}{a.modality ? ` · ${a.modality}` : ""}</span>}
              {(a.matrixLabel || a.campus) && <span className="block">{[a.matrixLabel, a.campus].filter(Boolean).join(" · ")}</span>}
              {a.originalName && <span className="break-all">{a.originalName}</span>} · enviado em {formatDay(a.createdAt)}
            </>}
          />
        </div>

        {a.headerEntryPeriod && a.entryPeriod && a.headerEntryPeriod !== a.entryPeriod && (
          <div className="rounded-xl border border-status-warning/30 bg-status-warning-bg p-4 text-sm text-status-warning">O PDF indica o {a.headerEntryPeriod}º período; a análise está simulando o {a.entryPeriod}º.</div>
        )}

        {a.status === "COMPLETED" && a.enrollment && (
          <SectionBoundary name="Resultado do atendimento">
            <EnrollmentBanner key={`${a.enrollment.status}-${a.enrollment.reanalysisAt}-${a.enrollment.updatedAt}`} analysis={a} onChanged={apply} />
          </SectionBoundary>
        )}

        {subjects.length > 0 ? <SummaryCards a={a} /> : (
          <div className="rounded-xl border border-status-warning/30 bg-status-warning-bg p-5"><div className="font-semibold text-status-warning">Ainda não há disciplinas disponíveis nesta análise</div><p className="mt-1 text-sm text-status-warning/90">Envie o PDF atualizado para criar uma nova análise.</p></div>
        )}

        {a.status === "COMPLETED" && subjects.length > 0 && <SectionBoundary name="Proposta comercial"><ProposalCard key={a.id} analysis={a} onChanged={apply} /></SectionBoundary>}

        <div className="flex flex-wrap items-center gap-2">
          {r.narrative && <Button variant="outline" className="h-9" onClick={() => copy(r.narrative.text)}><ClipboardCopy className="mr-1.5 size-4" />Gerar resumo para candidato</Button>}
          <Button variant="outline" className="h-9" onClick={() => setModal("term")}>Início da previsão: {a.startTerm}</Button>
          <Button variant="outline" className="h-9" onClick={() => setModal("entry")}><SlidersHorizontal className="mr-1.5 size-4" />Simular outro período</Button>
          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:justify-end">
            <Button variant="outline" className="h-9 border-status-danger/30 text-status-danger hover:bg-status-danger-bg" onClick={() => setModal("delete")}><Trash2 className="mr-1.5 size-4" />Excluir análise</Button>
          </div>
        </div>

        {subjects.length > 0 && (
          <div>
            <div role="tablist" className="flex h-auto w-full flex-nowrap justify-start gap-1 overflow-x-auto rounded-xl bg-muted p-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
              {TABS.map(([v, label]) => (
                <button key={v} role="tab" aria-selected={tab === v} type="button" onClick={() => setTab(v)} className={cn("shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition sm:flex-1", tab === v ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  {label}
                  {v === "audit" && warningsCount > 0 && <span className="ml-1.5 rounded-full bg-status-warning px-1.5 text-[10px] font-semibold text-white">{warningsCount}</span>}
                </button>
              ))}
            </div>
            <div className="mt-4">
              {tab === "summary" && (
                <div className="space-y-6">
                  <div className="rounded-xl border bg-card p-4 shadow-sm">
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Início da previsão</div>
                    <div className="mt-1 text-2xl font-semibold">{a.startTerm}</div>
                    <div className="text-xs text-muted-foreground">Primeiro semestre da projeção {a.entryPeriod ? `(período do PDF: ${a.headerEntryPeriod || a.entryPeriod}º)` : ""}.</div>
                  </div>
                  <GradeByPeriod subjects={subjects} entryPeriod={a.entryPeriod} />
                </div>
              )}
              {tab === "grade" && <GradeTable subjects={subjects} onStatus={setStatus} />}
              {tab === "pending" && <PendingTab subjects={subjects} entryPeriod={a.entryPeriod} />}
              {tab === "projection" && <Timeline a={a} byId={byId} />}
              {tab === "audit" && <Audit a={a} />}
            </div>
          </div>
        )}
      </div>

      {modal === "term" && (
        <Modal title="Início da previsão" description="Escolha em qual semestre-calendário a projeção deve começar. O período acadêmico continua sendo lido do PDF." onClose={() => setModal(null)}>
          <label className="block text-xs font-semibold text-slate-600">Primeiro semestre projetado<Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="2026.2" className="mt-1.5 h-10 bg-white" /></label>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setModal(null)}>Cancelar</Button><Button disabled={busy || !/^\d{4}\.[12]$/.test(term)} onClick={() => save({ startTerm: term }, "Previsão recalculada.")}>Salvar</Button></div>
        </Modal>
      )}
      {modal === "entry" && (
        <Modal title="Simular outro período" description="Compare cenários: em qual período da grade o candidato entraria." onClose={() => setModal(null)}>
          <label className="block text-xs font-semibold text-slate-600">Período de ingresso<span className="mt-1.5 block"><Select value={entry} onChange={(e) => setEntry(e.target.value)}><option value="">Não informado</option>{PERIODS.map((n) => <option key={n} value={n}>{n}º período</option>)}</Select></span></label>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setModal(null)}>Cancelar</Button><Button disabled={busy} onClick={() => save({ entryPeriod: entry === "" ? null : Number(entry) }, "Previsão recalculada.")}>Simular</Button></div>
        </Modal>
      )}
      {modal === "delete" && (
        <Modal title="Excluir esta análise?" description={`A análise de ${a.candidateName || "este candidato"} sai da lista. O PDF não é guardado pelo sistema.`} onClose={() => setModal(null)}>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setModal(null)}>Cancelar</Button><Button onClick={remove}>Excluir</Button></div>
        </Modal>
      )}
    </div>
  );
};

const CurricularAnalysis = () => {
  const { id } = useParams();
  return id ? <Detail key={id} id={id} /> : <List />;
};

export default CurricularAnalysis;
