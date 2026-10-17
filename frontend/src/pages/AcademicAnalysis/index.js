import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHistory, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { ChevronDown, Search, Trash2 } from "lucide-react";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { errorText } from "../Analysis/shared";
import { AcademicReportOverlay } from "../Analysis/Report";
import heroImage from "../../assets/orig/formatura-portal-2026.jpg";
import {
  AcademicDashboardOverview, AcademicPeriodJourney, Badge, Button, Card, CardContent, CardHeader, CardTitle, ConclusionPath, FormulaFlow, Input,
  BackButton, PendingDistribution, Portal, StudentMessagePreview, cn, completionOf, readableName,
} from "../Analysis/orig";

// "Análise acadêmica", as in the original system: the banner, the card to send a document, the history of analyses with
// filters, and the result page (dashboard, journey by period, forecast, rules, message for the student, manual review).
// Deterministic: no AI decides anything.

export const DOC_LABEL = {
  OFFICIAL_ACADEMIC_HISTORY: "Histórico oficial",
  SIMPLE_ACADEMIC_HISTORY: "Histórico simples (conferência)",
  CURRICULAR_EXTRACT: "Extrato curricular",
  UNKNOWN_ACADEMIC_DOCUMENT: "Documento não identificado",
};
export const RESULT_LABEL = { NO_PENDING: ["Sem pendências", "good"], CAN_ADD: ["Pode incluir disciplinas", "good"], NEAR_LIMIT: ["Perto do limite", "warn"], LIMIT_REACHED: ["Limite atingido", "warn"], MANUAL_REVIEW_REQUIRED: ["Precisa de conferência", "bad"], ENROLLMENT_INACTIVE: ["Matrícula não ativa", "bad"] };

const STATUS_FILTER = {
  NO_PENDING: "Sem pendências",
  CAN_ADD: "Há vagas",
  NEAR_LIMIT: "Próximo do limite",
  LIMIT_REACHED: "Limite atingido",
  MANUAL_REVIEW_REQUIRED: "Revisão manual",
  ENROLLMENT_INACTIVE: "Matrícula não ativa",
};
const SITUATIONS = [["", "Não informada"], ["ACTIVE", "Ativa"], ["CANCELLED", "Cancelada"], ["LOCKED", "Trancada"], ["GRADUATED", "Concluída (formado)"], ["TRANSFERRED", "Transferida"]];
const ACADEMIC_STATUS_OPTIONS = [
  ["A CURSAR", "A cursar"], ["CURSANDO", "Cursando"], ["AE", "Dispensa (AE)"], ["AE*", "Dispensa (AE*)"], ["APROVADO", "Aprovado"], ["REPROVADO", "Reprovado"],
  ["REPROVADO POR NOTA", "Reprovado por nota"], ["REPROVADO POR FALTA", "Reprovado por falta"], ["CONCLUIDO", "Concluído"], ["DISPENSADO", "Dispensado"], ["S", "Satisfatório (S)"],
];
const PERIODS = Array.from({ length: 20 }, (_, i) => i + 1);
const MAX_MB = 20;

const selectClass = "block h-10 w-full appearance-none whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 pr-10 text-sm font-normal text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-ring";

// ------------------------------------------------------------------ the banner and the card to send a document

const Hero = () => (
  <section className="relative isolate overflow-hidden rounded-2xl bg-brand-navy shadow-sm sm:rounded-3xl md:min-h-[260px] lg:min-h-[280px]">
    <div className="relative aspect-[16/7] w-full md:absolute md:inset-0 md:aspect-auto">
      <img src={heroImage} alt="" className="absolute inset-0 z-0 size-full object-cover object-[70%_30%] md:object-center" />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-b from-transparent to-brand-navy md:hidden" />
      <div aria-hidden="true" className="absolute inset-0 hidden bg-[linear-gradient(90deg,rgba(7,53,99,0.98)_0%,rgba(7,53,99,0.96)_28%,rgba(7,53,99,0.86)_38%,rgba(7,53,99,0.68)_48%,rgba(7,53,99,0.42)_58%,rgba(7,53,99,0.16)_68%,rgba(7,53,99,0.04)_76%,transparent_84%)] md:block" />
    </div>
    <div className="relative z-10 flex px-5 pb-6 text-white sm:px-8 md:min-h-[260px] md:items-center md:px-10 md:py-10 lg:min-h-[280px] lg:px-14">
      <div className="w-full max-w-xl text-left">
        <p className="shimmer-text text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-gold sm:text-xs">Acompanhamento acadêmico</p>
        <h1 className="mt-2 text-[clamp(1.45rem,6.4vw,2.25rem)] font-semibold leading-[1.1] tracking-tight md:mt-3 md:text-4xl"><span className="block whitespace-nowrap">Uma jornada mais clara</span><span className="block whitespace-nowrap">até a formatura.</span></h1>
        <p className="mt-3 max-w-lg text-sm leading-6 text-white/85 md:mt-4 md:text-base">Organize a trajetória do aluno com uma leitura objetiva do documento acadêmico, das disciplinas e das próximas etapas.</p>
      </div>
    </div>
  </section>
);

const UploadForm = ({ onCreated }) => {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [students, setStudents] = useState([]);
  const [studentId, setStudentId] = useState("");
  useEffect(() => { api.get("/students").then(({ data }) => setStudents(data)).catch(() => setStudents([])); }, []);

  const choose = (candidate) => {
    if (!candidate || sending) return;
    if (candidate.type !== "application/pdf" && !candidate.name.toLowerCase().endsWith(".pdf")) { toast.error("Selecione um documento em PDF."); return; }
    if (candidate.size > MAX_MB * 1024 * 1024) { toast.error(`O arquivo excede ${MAX_MB} MB.`); return; }
    setFile(candidate);
    setConfirmed(false);
  };
  const submit = async () => {
    if (!file || sending) return;
    if (!confirmed) { toast.error("Confirme que o documento está atualizado antes de iniciar a análise."); return; }
    setSending(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (studentId) form.append("studentId", studentId);
      const { data } = await api.post("/analysis/academic", form);
      toast.success(data.reused ? "Este documento já estava analisado: nada mudou." : "Análise pronta.");
      onCreated(data);
    } catch (e) { toast.error(errorText(e), { autoClose: 9000 }); }
    setSending(false);
  };

  return (
    <div className="space-y-4">
      <div
        role="button" tabIndex={0} aria-label="Selecionar ou arrastar documento acadêmico" aria-busy={sending} aria-disabled={sending}
        onClick={() => { if (!sending && inputRef.current) inputRef.current.click(); }}
        onKeyDown={(e) => { if (!sending && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); if (inputRef.current) inputRef.current.click(); } }}
        onDragOver={(e) => { e.preventDefault(); if (!sending) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length !== 1) toast.error("Envie apenas 1 documento."); else choose(e.dataTransfer.files[0]); }}
        className={cn("flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center shadow-inner transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 motion-reduce:transition-none sm:min-h-64 sm:p-10", dragging ? "scale-[1.01] border-brand-cyan bg-gradient-to-br from-brand-cyan-50 to-white" : "border-slate-300 bg-gradient-to-br from-white via-slate-50 to-cyan-50/70 hover:border-brand-cyan/70 hover:from-white hover:to-cyan-50")}
      >
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { if (e.target.files.length !== 1) toast.error("Envie apenas 1 documento."); else choose(e.target.files[0]); }} />
        <span className="rounded-lg border bg-brand-navy-50 px-3 py-1 text-xs font-bold tracking-[0.16em] text-brand-navy">PDF</span>
        <strong className="mt-3 max-w-full break-all text-base">{file ? file.name : "Envie 1 documento acadêmico"}</strong>
        <span aria-live="polite" className="mt-1 text-sm text-muted-foreground">{sending ? "Documento recebido · extraindo e analisando as páginas…" : file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · clique para trocar` : `Arraste o documento para cá ou selecione um arquivo · até ${MAX_MB} MB`}</span>
        {sending && (
          <div className="mt-5 w-full max-w-sm text-left" role="status" aria-live="polite" aria-label="Análise do documento em andamento">
            <div className="flex items-center justify-between text-xs font-medium text-slate-600"><span>Leitura do extrato</span><span>Processando páginas</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Processamento do documento em andamento"><div className="h-full w-2/5 rounded-full bg-gradient-to-r from-[#003B71] to-[#0693E3] motion-safe:animate-pulse" /></div>
            <p className="mt-2 text-center text-xs text-slate-500">Isso pode levar alguns instantes.</p>
          </div>
        )}
      </div>
      {file && <Button variant="ghost" disabled={sending} onClick={() => { setFile(null); setConfirmed(false); if (inputRef.current) inputRef.current.value = ""; }}>Remover arquivo</Button>}
      {students.length > 0 && (
        <label className="block text-xs font-semibold text-slate-600">Aluno do portal (opcional)
          <span className="relative mt-1.5 block">
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className={selectClass}>
              <option value="">Sem aluno (análise avulsa)</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.name} · RGM {s.rgm}</option>)}
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          </span>
          <span className="mt-1 block text-xs font-normal text-slate-500">Ligando a um aluno, a análise entra no histórico dele e aparece no Portal do Aluno.</span>
        </label>
      )}
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-sky-200 bg-sky-50/80 p-4 text-sm leading-5 text-slate-700">
        <input type="checkbox" checked={confirmed} disabled={!file || sending} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[#003B71]" style={{ appearance: "auto" }} />
        <span>
          <span className="font-semibold text-slate-900">Confirmação necessária</span>
          <span className="mt-1 block">Confirmo que este é o documento acadêmico atualizado, com identificação do aluno, curso e histórico completo, e autorizo iniciar a análise curricular. Se o período atual não estiver legível, vou informá-lo na conferência.</span>
        </span>
      </label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-xs leading-5 text-slate-600">Envie 1 documento em PDF: Histórico Oficial, Histórico Simples para Conferência ou Extrato/Grade Curricular · até {MAX_MB} MB.</p>
        <Button onClick={submit} disabled={!file || !confirmed || sending} className="w-full sm:w-auto">{sending ? "Lendo documento…" : "Analisar documento"}</Button>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ the list (page of the original)

const List = () => {
  const history = useHistory();
  const [rows, setRows] = useState(null);
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [period, setPeriod] = useState("");
  const [status, setStatus] = useState("");
  const load = useCallback(() => {
    api.get("/analysis/academic", { params: { search: applied.trim() || undefined } }).then(({ data }) => setRows(data)).catch((e) => { toastError(e); setRows([]); });
  }, [applied]);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => (rows || []).filter((r) => (!period || String(r.currentPeriod) === period) && (!status || r.status === status)), [rows, period, status]);
  const hasFilters = Boolean(applied || period || status);

  return (
    <div className="orig academic-analysis-shell mx-auto w-full max-w-[1440px] flex-1 space-y-6 overflow-y-auto p-4 pb-8 sm:p-6" style={{ minHeight: 0 }}>
      <Hero />
      <section className="shine-border animate-blur-fade rounded-2xl border bg-card p-4 shadow-[0_24px_50px_-36px_rgba(0,59,113,0.55)] sm:p-6 lg:p-8">
        <div className="mb-4">
          <h2 className="text-base font-semibold tracking-tight text-slate-900">Nova análise acadêmica</h2>
          <p className="mt-1 text-sm text-slate-600">Envie um Histórico Oficial, Histórico Simples ou Extrato/Grade Curricular em PDF para organizar as disciplinas, identificar pendências e estimar os próximos passos do aluno.</p>
        </div>
        <UploadForm onCreated={(a) => history.push(`/analise-academica/${a.id}`)} />
      </section>

      <details open className="rounded-2xl border border-slate-300/70 bg-white/75 p-4 shadow-[0_18px_45px_-40px_rgba(15,42,66,0.55)] backdrop-blur-sm sm:p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-2 py-1 [&::-webkit-details-marker]:hidden">
          <span><span className="block text-lg font-semibold tracking-tight text-slate-900">Histórico de análises</span><span className="mt-0.5 block text-sm text-slate-600">Os dados e correções ficam vinculados ao responsável pela análise.</span></span>
          <span className="shrink-0 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700">{filtered.length} {filtered.length === 1 ? "registro" : "registros"}</span>
        </summary>
        <section className="mt-4 border-t border-slate-200/80 pt-4">
          <form onSubmit={(e) => { e.preventDefault(); setApplied(query); }} className="mb-5 rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50/90 via-white to-slate-50 p-3 sm:p-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(240px,1.6fr)_minmax(175px,.8fr)_minmax(205px,1fr)_auto]">
              <label className="block min-w-0 text-xs font-semibold text-slate-600">Buscar aluno
                <span className="relative mt-1.5 block"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome, RGM ou curso" className="h-10 border-slate-200 bg-white pl-9" /></span>
              </label>
              <label className="block min-w-0 text-xs font-semibold text-slate-600">Período
                <span className="relative mt-1.5 block"><select value={period} onChange={(e) => setPeriod(e.target.value)} className={selectClass}><option value="">Todos os períodos</option>{PERIODS.map((p) => <option key={p} value={p}>{p}º período</option>)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /></span>
              </label>
              <label className="block min-w-0 text-xs font-semibold text-slate-600">Situação
                <span className="relative mt-1.5 block"><select value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass}><option value="">Todas as situações</option>{Object.entries(STATUS_FILTER).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /></span>
              </label>
              <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-1">
                <Button type="submit" size="lg" className="h-10 flex-1 xl:flex-none"><Search aria-hidden="true" className="mr-2 size-4" />Buscar</Button>
                {hasFilters && <button type="button" onClick={() => { setQuery(""); setApplied(""); setPeriod(""); setStatus(""); }} className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50">Limpar</button>}
              </div>
            </div>
            <p className="mt-2 px-1 text-xs text-slate-500">Pesquise e filtre as análises pelo aluno, período ou situação. Exibindo as 100 mais recentes.</p>
          </form>

          {rows === null ? <p className="text-sm text-slate-500">Carregando…</p> : filtered.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((r) => {
                const accent = r.status === "MANUAL_REVIEW_REQUIRED" || r.status === "ENROLLMENT_INACTIVE" ? "border-l-amber-500" : r.status === "LIMIT_REACHED" ? "border-l-rose-500" : "border-l-sky-500";
                return (
                  <Card key={r.id} className={cn("group relative h-full overflow-hidden rounded-2xl border border-slate-200 border-l-4 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-t-sky-200 hover:shadow-lg", accent)}>
                    <CardContent className="flex h-full flex-col p-4 sm:p-5">
                      <button type="button" onClick={() => history.push(`/analise-academica/${r.id}`)} className="group/link min-w-0 flex-1 rounded-lg text-left focus:outline-none focus:ring-2 focus:ring-ring">
                        <div className="truncate font-semibold text-slate-900 group-hover/link:text-brand-navy">{r.studentName || "Aluno sem nome"}</div>
                        <div className="mt-1 truncate text-sm text-slate-600">{r.courseName || "Curso não identificado"}{r.rgm ? ` · RGM ${r.rgm}` : ""}</div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="border-slate-300 bg-slate-50">{r.currentPeriod ? `${r.currentPeriod}º período${r.currentPeriodConfirmed ? "" : " (a confirmar)"}` : "Período a confirmar"}</Badge>
                          <Badge variant={r.status === "MANUAL_REVIEW_REQUIRED" || r.status === "ENROLLMENT_INACTIVE" ? "destructive" : "secondary"}>{STATUS_FILTER[r.status] || r.status}</Badge>
                        </div>
                        <div className="mt-3 text-xs leading-5 text-slate-600">{DOC_LABEL[r.documentType] || "Documento"}{r.studentId ? ` · Portal v${r.version}` : ""} · {new Date(r.updatedAt).toLocaleString("pt-BR")}</div>
                        <span className="mt-3 inline-block text-sm font-semibold text-brand-navy">{r.status === "MANUAL_REVIEW_REQUIRED" ? "Abrir conferência →" : "Abrir análise →"}</span>
                      </button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center">
              <p className="font-medium text-slate-800">{hasFilters ? "Nenhum aluno encontrado com esses filtros." : "Nenhuma análise acadêmica registrada ainda."}</p>
              {hasFilters && <p className="mt-1 text-sm text-slate-500">Experimente buscar pelo nome completo, RGM ou limpar os filtros.</p>}
            </div>
          )}
        </section>
      </details>
    </div>
  );
};

// ------------------------------------------------------------------ the result page (workspace of the original)

const formatDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Porto_Velho" }).format(d);
};

const EditableDiscipline = ({ index, discipline, busy, onSave }) => {
  const [isOpen, setIsOpen] = useState(false);
  const periodLabel = discipline.period ? `${discipline.period}º período` : "Período a identificar";
  const statusLabel = discipline.originalStatus || "Status a identificar";
  const summary = [discipline.code, periodLabel, statusLabel].filter(Boolean).join(" · ");
  const known = ACADEMIC_STATUS_OPTIONS.some(([v]) => v === discipline.normalizedStatus);
  const uncertain = discipline.period === null || discipline.period === undefined;
  const field = "block h-9 min-w-0 w-full rounded-md border bg-card px-2 text-sm text-foreground";
  return (
    <div id={`academic-discipline-${index}`} className={cn("group min-w-0 overflow-hidden rounded-xl border bg-white", uncertain ? "border-amber-300" : discipline.manualEdited && "border-brand-cyan/50")}>
      <button type="button" aria-expanded={isOpen} onClick={() => setIsOpen((v) => !v)} className="flex w-full min-w-0 flex-wrap items-center justify-between gap-3 px-5 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{String(discipline.name || "").trim() || "Nova disciplina (rascunho)"}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{summary}</span></span>
        <span className="flex shrink-0 items-center gap-2"><span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", uncertain ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-600")}>{uncertain ? "Revisar" : isOpen ? "Recolher" : "Editar"}</span><span aria-hidden="true" className={cn("text-base leading-none text-slate-500 transition-transform", isOpen && "rotate-180")}>⌄</span></span>
      </button>
      {isOpen && (
        <div className="grid min-w-0 grid-cols-1 gap-3 border-t bg-slate-50/50 p-3 md:grid-cols-2 md:items-end xl:grid-cols-[minmax(12rem,2.3fr)_7rem_minmax(10rem,1.1fr)_6rem_minmax(9rem,1fr)]">
          <label className="min-w-0 space-y-1 text-[11px] font-medium text-muted-foreground">Componente<input aria-label={`Componente, linha ${index + 1}`} className={field} defaultValue={discipline.name} onBlur={(e) => { if (e.currentTarget.value.trim() && e.currentTarget.value !== discipline.name) onSave({ name: e.currentTarget.value }); }} disabled={busy} /></label>
          <label className="min-w-0 space-y-1 text-[11px] font-medium text-muted-foreground">Período
            <select aria-label={`Período, componente ${index + 1}`} className={field} value={discipline.period === null || discipline.period === undefined ? "" : String(discipline.period)} onChange={(e) => onSave({ period: e.currentTarget.value ? Number(e.currentTarget.value) : null })} disabled={busy}>
              <option value="">Selecionar</option>{PERIODS.map((p) => <option key={p} value={p}>{p}º</option>)}
            </select>
          </label>
          <label className="min-w-0 space-y-1 text-[11px] font-medium text-muted-foreground">Status
            <select aria-label={`Status, componente ${index + 1}`} className={field} value={discipline.normalizedStatus || ""} onChange={(e) => onSave({ normalizedStatus: e.currentTarget.value })} disabled={busy}>
              <option value="">Selecionar status</option>
              {!known && discipline.normalizedStatus && <option value={discipline.normalizedStatus}>Atual: {discipline.originalStatus} · revisar</option>}
              {ACADEMIC_STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="min-w-0 space-y-1 text-[11px] font-medium text-muted-foreground">C.H.<input aria-label={`Carga horária, componente ${index + 1}`} type="number" min={0} max={2000} className={field} defaultValue={discipline.workload ?? ""} onBlur={(e) => { const next = e.currentTarget.value ? Number(e.currentTarget.value) : null; if (next !== (discipline.workload ?? null)) onSave({ workload: next }); }} disabled={busy} /></label>
          <label className={cn("flex min-w-0 min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-semibold", discipline.inMainCurriculum ? "border-sky-200 bg-sky-50 text-[#003B71]" : "border-slate-200 bg-slate-50 text-slate-600")}>
            <input type="checkbox" checked={!!discipline.inMainCurriculum} onChange={(e) => onSave({ inMainCurriculum: e.currentTarget.checked })} disabled={busy} className="size-4 shrink-0 accent-brand-navy" style={{ appearance: "auto" }} />
            <span className="min-w-0 break-words">{discipline.inMainCurriculum ? "Incluir nos cálculos" : "Fora da grade principal"}</span>
          </label>
          <div className="min-w-0 break-words text-[10px] text-muted-foreground md:col-span-2 xl:col-span-full">Original: “{discipline.originalStatus}” · normalizado: “{discipline.normalizedStatus}” · período original: “{discipline.rawPeriod || "não identificado"}” · pág. {discipline.sourcePage || "manual"}</div>
        </div>
      )}
    </div>
  );
};

const Detail = ({ id }) => {
  const history = useHistory();
  const [a, setA] = useState(null);
  const [periodText, setPeriodText] = useState("");
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  const [editingMessage, setEditingMessage] = useState(false);
  const [report, setReport] = useState(false);
  const [messageOverride, setMessageOverride] = useState(null);
  const reviewRef = useRef(null);

  const apply = useCallback((d) => { setA((old) => ({ ...(old || {}), ...d })); setPeriodText(d.currentPeriod ? String(d.currentPeriod) : ""); setMessageOverride(null); }, []);
  const load = useCallback(() => api.get(`/analysis/academic/${id}`).then(({ data }) => apply(data)).catch((e) => { toastError(e); history.replace("/analise-academica"); }), [id, apply, history]);
  useEffect(() => { load(); }, [load]);

  // a correction can create a new version for a student of the portal: the screen follows it
  const change = async (body) => {
    setBusy(true);
    try {
      const { data } = await api.put(`/analysis/academic/${a.id}`, body);
      if (data.id !== a.id) history.replace(`/analise-academica/${data.id}`);
      else await load();
      toast.success("Pronto. A previsão foi recalculada.");
    } catch (e) { toast.error(errorText(e)); }
    setBusy(false);
  };
  const remove = async () => { try { await api.delete(`/analysis/academic/${a.id}`); toast.success("Análise excluída."); history.replace("/analise-academica"); } catch (e) { toast.error(errorText(e)); } };
  const copyMessage = async (text) => {
    try { await navigator.clipboard.writeText(text); toast.success("Mensagem copiada."); } catch (e) { toast.error("Não foi possível copiar; selecione o texto manualmente."); }
  };

  if (!a || !a.snapshot) return <div className="orig flex-1 p-8 text-sm text-slate-500">Carregando…</div>;
  const s = a.snapshot;
  const result = s.result || {};
  const forecast = a.forecast;
  const periodConfirmed = a.currentPeriod !== null && a.currentPeriod !== undefined && !!a.currentPeriodConfirmed;
  const disciplines = s.disciplines || [];
  const unmapped = disciplines.filter((d) => d.inMainCurriculum && (d.period === null || d.period === undefined)).length;
  const mappingRequired = !periodConfirmed || unmapped > 0;
  const completion = completionOf(forecast);
  const message = messageOverride !== null ? messageOverride : a.message;
  const inactive = result.status === "ENROLLMENT_INACTIVE";
  const periodChanged = (periodText.trim() ? Number(periodText) : null) !== (a.currentPeriod ?? null);

  return (
    <div className="orig flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
      <div className="academic-report-page mx-auto min-w-0 max-w-[1440px] space-y-5 p-4 pb-10 sm:space-y-6 sm:p-6 sm:pb-10 lg:p-8 lg:pb-10">
        <p className="text-xs text-slate-500">Análise baseada em: {DOC_LABEL[a.documentType] || "Documento"}</p>

        {mappingRequired && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">MAPEAMENTO CURRICULAR NECESSÁRIO. O semestre letivo não representa o período curricular por si só.</p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              {!periodConfirmed && <li>Período atual ainda não confirmado.</li>}
              {unmapped > 0 && <li>{unmapped} disciplina(s) da grade principal sem período mapeado.</li>}
            </ul>
            {s.periodSuggestion && s.periodSuggestion.note && !periodConfirmed && <p className="mt-2 text-sm">{s.periodSuggestion.note}</p>}
            <p className="mt-2 text-xs leading-5 text-amber-900/80">Enquanto essas pendências existirem, vagas e prazo de conclusão não são calculados.</p>
          </div>
        )}

        {inactive && s.enrollmentSituation && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            <p className="font-semibold">Matrícula {s.enrollmentSituation.label.toLowerCase()} no SIAA.</p>
            <p className="mt-1">{(result.warnings || [])[0]}</p>
          </div>
        )}

        <header className="mb-6 grid min-w-0 gap-5 border-b border-slate-200/80 pb-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            <BackButton to="/analise-academica" label="Voltar às análises" className="mb-4" />
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-cyan-700">Análise acadêmica</p>
            <h1 className="mt-1 break-words text-2xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-3xl">{a.studentName || "Análise do extrato"}</h1>
            <p className="mt-2 break-words text-sm font-medium text-slate-600 sm:text-base">{a.courseName || "Curso não identificado"}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
              {a.rgm && <span className="rounded-md border border-slate-200 bg-white/80 px-2.5 py-1">RGM {a.rgm}</span>}
              {a.originalName && <span className="max-w-full truncate rounded-md border border-slate-200 bg-white/80 px-2.5 py-1" title={a.originalName}>{a.originalName}</span>}
              <span className="rounded-md border border-slate-200 bg-white/80 px-2.5 py-1">Análise de {formatDate(a.createdAt)}</span>
              {a.studentId && <span className="rounded-md border border-slate-200 bg-white/80 px-2.5 py-1">Portal · versão {a.version}{a.isCurrent ? " (atual)" : ""}</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <Button size="lg" onClick={() => setReport(true)}>Gerar relatório do aluno</Button>
            <Button size="lg" variant="outline" onClick={() => copyMessage(message)}>Copiar mensagem</Button>
            {!a.studentId && <Button size="lg" variant="outline" onClick={() => setDel(true)}><Trash2 className="mr-1.5 size-4" />Excluir</Button>}
          </div>
        </header>

        {!periodConfirmed && (
          <aside id="confirmar-periodo" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-2xl border border-amber-300 bg-white p-4 shadow-[0_18px_60px_-18px_rgba(15,42,66,0.35)] sm:inset-x-auto sm:bottom-5 sm:right-5 sm:p-5" aria-live="polite" aria-labelledby="confirm-period-title">
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className="mt-1 size-2.5 shrink-0 rounded-full bg-amber-500 ring-4 ring-amber-100" />
              <div className="min-w-0 flex-1">
                <p id="confirm-period-title" className="text-sm font-semibold text-slate-900">Confirme o período para calcular a previsão</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">Não identificamos essa informação com segurança no extrato. Selecione o período atual; o sistema recalcula o resultado automaticamente.</p>
                <div className="mt-3 flex items-end gap-2">
                  <label htmlFor="current-period" className="min-w-0 flex-1 text-xs font-medium text-slate-700">Período atual
                    <Input id="current-period" type="number" min={1} max={20} value={periodText} onChange={(e) => setPeriodText(e.target.value)} placeholder="Ex.: 7" aria-label="Período atual do aluno" className="mt-1 h-10" />
                  </label>
                  <Button size="sm" className="h-10 shrink-0" onClick={() => change({ currentPeriod: Number(periodText) })} disabled={busy || !periodText.trim() || !periodChanged && periodConfirmed}>{busy ? "Salvando…" : "Confirmar"}</Button>
                </div>
              </div>
            </div>
          </aside>
        )}

        <AcademicDashboardOverview
          mappingRequired={mappingRequired}
          workloadProgress={s.documentType !== "CURRICULAR_EXTRACT" && s.plannedWorkload && s.integralizedWorkload != null ? { planned: s.plannedWorkload, integralized: s.integralizedWorkload } : undefined}
          disciplines={disciplines}
          currentPeriod={result.currentPeriod ?? null}
          currentPeriodConfirmed={periodConfirmed}
          pending={(forecast && forecast.knownBacklog) ?? result.previousPending ?? 0}
          inProgress={result.previousAlreadyAdded ?? 0}
          currentAE={result.currentPeriodAE ?? 0}
          availableSlots={result.remainingExtraSlots ?? 0}
          completionTerm={completion}
          needsReview={Boolean(forecast && forecast.incomplete)}
        />

        <AcademicPeriodJourney disciplines={disciplines} currentPeriod={result.currentPeriod ?? null} />

        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Período atual do aluno</CardTitle><p className="text-sm text-muted-foreground">Confira a série do aluno no SIAA (Consulta Acadêmica › Matrícula › Série).</p></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-end gap-2">
                <label className="min-w-0 flex-1 text-xs font-medium text-slate-700">Período
                  <span className="relative mt-1 block"><select value={periodText} onChange={(e) => setPeriodText(e.target.value)} className={selectClass}><option value="">Não confirmado</option>{PERIODS.map((p) => <option key={p} value={p}>{p}º período</option>)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /></span>
                </label>
                <Button className="h-10" onClick={() => change({ currentPeriod: Number(periodText) })} disabled={busy || !periodText || (periodConfirmed && !periodChanged)}>Confirmar período</Button>
              </div>
              <p className="text-xs text-muted-foreground">{periodConfirmed ? "Período confirmado." : "A previsão só aparece depois de confirmar o período."}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Situação da matrícula no SIAA</CardTitle><p className="text-sm text-muted-foreground">Só uma matrícula ativa pode incluir disciplinas e ter previsão de formatura.</p></CardHeader>
            <CardContent className="space-y-2">
              <label className="block text-xs font-medium text-slate-700">Situação
                <span className="relative mt-1 block"><select value={(s.enrollmentSituation && s.enrollmentSituation.code) || ""} onChange={(e) => change({ enrollmentSituation: e.target.value })} className={selectClass}>{SITUATIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /></span>
              </label>
              <p className="text-xs text-muted-foreground">{s.enrollmentSituation ? (s.enrollmentSituation.source === "DOCUMENT" ? "Lida do documento." : "Informada pela equipe.") : "Confira em Consulta Acadêmica › Matrícula › Situação."}</p>
            </CardContent>
          </Card>
        </div>

        {forecast && !inactive && (
          <Card className="border-brand-cyan/30">
            <CardHeader>
              <CardTitle className="text-base">Previsão automática de conclusão</CardTitle>
              <p className="text-sm text-muted-foreground">Estimativa automática com base nos dados identificados. O prazo pode mudar conforme aprovação, rematrícula, oferta e pré-requisitos.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {forecast.incomplete && <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm leading-5 text-amber-950"><span className="font-semibold">Projeção automática com ressalvas.</span> {forecast.uncertainRows > 0 ? `${forecast.uncertainRows} linha(s) têm dados incompletos ou não identificados; foi incluída uma margem adicional.` : "O prazo depende das regras e da capacidade acadêmica cadastradas."} A estimativa é exibida sem exigir confirmação manual.</div>}
              {(forecast.plan || []).length ? <ConclusionPath showLoad steps={forecast.plan} allOfficial={forecast.calendarConfidence === "OFFICIAL"} completion={completion} /> : <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Não foi possível calcular etapas com os dados disponíveis.</div>}
            </CardContent>
          </Card>
        )}

        <details className="rounded-xl border bg-card p-4">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-2 font-semibold [&::-webkit-details-marker]:hidden">
            <span>Orientações para tutores</span>
            {forecast && forecast.uncertainRows ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">{forecast.uncertainRows} item(ns) incerto(s)</span> : <span className="text-xs font-normal text-slate-500">Como interpretar a estimativa automática</span>}
          </summary>
          <div className="mt-4 space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Como esta análise é feita</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm leading-6 text-slate-700">
                <p>O sistema usa as disciplinas e situações lidas do extrato, o período atual e as regras acadêmicas cadastradas. Ao corrigir um dado na revisão, a análise e a previsão são recalculadas automaticamente.</p>
                <p className="text-xs leading-5 text-muted-foreground">A projeção pressupõe aprovação e rematrícula no prazo. Oferta de disciplinas e pré-requisitos podem alterar a conclusão. AE/AE* liberam vagas no semestre em que aparecem; o sistema não presume oferta nem pré-requisitos.</p>
                {forecast && forecast.incomplete && (forecast.reasons || []).length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-amber-950"><ul className="list-inside list-disc space-y-1 text-sm">{forecast.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Regras de vagas do período atual</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <FormulaFlow label="Limite total do período" values={[
                  { value: result.currentPeriodComponents ?? 0, label: "componentes do período" },
                  { value: result.baseExtraAllowance ?? 0, label: "vagas padrão" },
                  { value: result.currentPeriodAE ?? 0, label: "vagas por AE/AE*" },
                  { value: result.semesterMaximum ?? 0, label: "limite máximo" },
                ]} operators={["+", "+", "="]} />
                <FormulaFlow label="Vagas extras ainda disponíveis" values={[
                  { value: result.extraAllowance ?? 0, label: "vagas extras calculadas" },
                  { value: result.usedExtraSlots ?? 0, label: "ocupadas por CURSANDO" },
                  { value: result.remainingExtraSlots ?? 0, label: "vagas livres" },
                ]} operators={["−", "="]} />
                <p className="text-xs text-muted-foreground">Pendência = status normalizado exatamente igual a “A CURSAR”. “CURSANDO”, AE, notas e outros resultados não entram nessa contagem. AE em períodos diferentes do atual não altera o limite.</p>
              </CardContent>
            </Card>
          </div>
        </details>

        <Card>
          <CardHeader><div><CardTitle className="text-base">Pendências por período</CardTitle><p className="mt-1 text-sm text-muted-foreground">Distribuição resumida e lista expansível por semestre.</p></div></CardHeader>
          <CardContent className="space-y-4">
            <PendingDistribution byPeriod={result.pendingByPeriod} totalPending={result.previousPending ?? 0} disciplines={result.pendingDisciplines || []} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Já incluídas neste semestre</CardTitle><p className="text-sm text-muted-foreground">Estas disciplinas têm status CURSANDO em períodos anteriores e já utilizam vagas extras.</p></CardHeader>
          <CardContent>
            {(result.previousCoursesInProgress || []).length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead><tr className="border-b text-xs text-muted-foreground"><th className="p-2">Código</th><th className="p-2">Disciplina</th><th className="p-2">Período</th><th className="p-2">Situação</th><th className="p-2">C.H.</th></tr></thead>
                  <tbody>
                    {result.previousCoursesInProgress.map((item, i) => (
                      <tr key={i} className="border-b last:border-0"><td className="p-2 font-mono text-xs">{item.code || "—"}</td><td className="p-2 font-medium">{readableName(item.name)}</td><td className="p-2">{item.period}º</td><td className="p-2">{item.originalStatus}</td><td className="p-2">{item.workload === null || item.workload === undefined ? "—" : `${item.workload}h`}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="rounded-lg bg-muted/30 p-4 text-sm text-muted-foreground">Nenhuma disciplina anterior aparece como CURSANDO.</p>}
          </CardContent>
        </Card>

        <div className="shine-border w-full rounded-2xl">
          <section className="relative overflow-hidden rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-cyan-50 shadow-[0_18px_44px_-38px_rgba(15,42,66,0.65)]" aria-labelledby="student-message-title">
            <div className="flex flex-col gap-4 border-b border-sky-100 bg-sky-100/55 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.13em] text-brand-cyan-700">Comunicação · acompanha o extrato escolar</p>
                <h2 id="student-message-title" className="mt-1 text-lg font-semibold text-slate-900">Resumo da análise para o aluno</h2>
                <p className="mt-1 text-sm text-slate-600">Mensagem independente do extrato em anexo, pronta para copiar e enviar.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => copyMessage(message)}>Copiar mensagem</Button>
                <Button size="sm" variant="outline" onClick={() => setEditingMessage((v) => !v)}>{editingMessage ? "Concluir edição" : "Personalizar"}</Button>
                {messageOverride !== null && <Button size="sm" variant="ghost" onClick={() => setMessageOverride(null)}>Restaurar sugestão</Button>}
              </div>
            </div>
            <div className="p-4 sm:p-5">
              {editingMessage ? (
                <div className="rounded-xl border border-sky-100 bg-white p-4 shadow-sm sm:p-5"><textarea value={message} onChange={(e) => setMessageOverride(e.target.value)} rows={8} className="min-h-40 w-full resize-y border-0 bg-transparent p-0 leading-6 outline-none" aria-label="Editar mensagem para o aluno" /></div>
              ) : <StudentMessagePreview message={message} />}
            </div>
          </section>
        </div>

        {(s.extractionWarnings || []).length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Conferência da leitura</CardTitle></CardHeader>
            <CardContent><ul className="list-inside list-disc space-y-1 text-sm text-slate-700">{s.extractionWarnings.map((m, i) => <li key={i}>{m}</li>)}</ul></CardContent>
          </Card>
        )}

        <details id="revisar-dados" ref={reviewRef} className="scroll-mt-6">
          <summary className="w-fit cursor-pointer py-2 pl-2 pr-3 font-semibold text-slate-800 underline decoration-slate-300 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Revisar ou corrigir os dados extraídos</summary>
          <div className="mt-4 space-y-4">
            <Card>
              <CardHeader><div><CardTitle className="text-base">Revisão manual dos componentes</CardTitle><p className="text-sm text-muted-foreground">Abra uma disciplina para conferir ou corrigir os dados. Corrigir recalcula tudo{a.studentId ? " e cria uma nova versão no histórico do aluno" : ""}.</p></div></CardHeader>
              <CardContent className="space-y-3">
                {disciplines.map((item, index) => <EditableDiscipline key={`${index}-${item.sourcePage}-${item.sourceRow}`} index={index} discipline={item} busy={busy} onSave={(patch) => change({ discipline: { index, ...patch } })} />)}
              </CardContent>
            </Card>
          </div>
        </details>

        {(a.versions || []).length > 1 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Histórico do aluno</CardTitle><p className="text-sm text-muted-foreground">Somente as mudanças na situação acadêmica aparecem aqui.</p></CardHeader>
            <CardContent>
              <ol className="divide-y">
                {a.versions.map((v) => (
                  <li key={v.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <span className="font-medium text-[#003B71]">Versão {v.version}</span>
                        {v.isCurrent && <span className="ml-3 rounded-full bg-brand-cyan px-2 py-1 text-xs font-semibold text-white">Atual</span>}
                        <p className="mt-1 text-sm text-slate-500">{new Date(v.createdAt).toLocaleString("pt-BR")} · {v.origin === "STUDENT_UPLOAD" ? "enviado pelo aluno" : v.origin === "CORRECTION" ? "correção da equipe" : "enviado pela equipe"}</p>
                      </div>
                      {v.id !== a.id && <button type="button" onClick={() => history.push(`/analise-academica/${v.id}`)} className="min-h-9 rounded-lg border border-brand-cyan/30 px-4 py-2 text-sm text-brand-cyan-700 hover:bg-brand-cyan-50">Ver análise</button>}
                    </div>
                    {(v.changeSummary || []).length > 0 && <ul className="mt-2 space-y-1 border-l-2 border-brand-cyan/20 pl-4 text-sm text-slate-600">{v.changeSummary.map((m, i) => <li key={i}>{m}</li>)}</ul>}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}
      </div>

      {report && <AcademicReportOverlay a={a} onClose={() => setReport(false)} />}
      {del && (
        <Portal><div role="dialog" aria-modal="true" aria-labelledby="del-title" className="fixed inset-0 z-[1300] grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h2 id="del-title" className="text-base font-semibold text-slate-900">Excluir esta análise?</h2>
            <p className="mt-2 text-sm text-slate-600">A análise de {a.studentName || "este aluno"} sai da lista. O PDF não é guardado pelo sistema.</p>
            <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setDel(false)}>Cancelar</Button><Button onClick={remove}>Excluir</Button></div>
          </div>
        </div></Portal>
      )}
    </div>
  );
};

const AcademicAnalysis = () => {
  const { id } = useParams();
  return id ? <Detail key={id} id={id} /> : <List />;
};

export default AcademicAnalysis;
