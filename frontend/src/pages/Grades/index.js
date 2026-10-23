import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { Briefcase, ChevronDown, ClipboardCopy, Download, FileText, Filter, GraduationCap, Route, Search, Send, SlidersHorizontal, Trash2, UploadCloud, X } from "lucide-react";

import { AuthContext } from "../../context/Auth/AuthContext";
import { isManager } from "../../utils/access";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { copyText, errorText, openPdf } from "../Analysis/shared";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Portal, cn } from "../Analysis/orig";
import { ContactChooser } from "../Analysis/ContactChooser";

// "Grades": the matrices of the courses, in the look of the original ("Grades comerciais"). The commercial team finds a
// course, copies the summary or sends the PDF to the candidate in the conversation; the management publishes them.

const selectClass = "h-10 w-full appearance-none rounded-md border bg-background px-3 pr-10 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring";

const SelectField = ({ label, value, onChange, emptyLabel, options }) => (
  <label className="grid gap-1 text-xs font-medium text-muted-foreground">{label}
    <span className="relative block">
      <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        <option value="">{emptyLabel}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </span>
  </label>
);

const Modal = ({ title, description, children, onClose }) => (
  <Portal><div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[1300] grid place-items-center p-4">
    <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-black/40" />
    <div className="relative w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-xl">
      <div><h2 className="text-base font-semibold text-slate-900">{title}</h2>{description && <p className="mt-1 text-sm text-slate-500">{description}</p>}</div>
      {children}
    </div>
  </div></Portal>
);

// choose the contact (not a conversation): the open conversation of the person is used, or one is opened
const SendDialog = ({ grade, onClose }) => {
  const [contact, setContact] = useState(null);
  const [summary, setSummary] = useState(true);
  const [pdf, setPdf] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (grade) setContact(null); }, [grade]);

  if (!grade) return null;
  const send = async () => {
    setBusy(true);
    try {
      await api.post(`/grades/${grade.id}/send`, { contactId: contact.id, summary, pdf });
      toast.success(`Grade enviada para ${contact.name}.`);
      onClose();
    } catch (e) { toastError(e); }
    setBusy(false);
  };

  return (
    <Modal title="Enviar para um contato" description={grade.courseName} onClose={onClose}>
      <ContactChooser autoOpen title="Enviar grade ao contato" contact={contact} onPick={setContact} />
      <p className="text-xs text-slate-500">Se o contato já tem uma conversa aberta, o envio vai nela. Se não tem, abrimos uma conversa para você. Com o PDF, o resumo vai como descrição dele, numa mensagem só.</p>
      <div className="grid gap-2 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={summary} onChange={(e) => setSummary(e.target.checked)} className="size-4 accent-[#003B71]" style={{ appearance: "auto" }} />Resumo da grade</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={pdf} onChange={(e) => setPdf(e.target.checked)} className="size-4 accent-[#003B71]" style={{ appearance: "auto" }} />PDF da matriz</label>
      </div>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={send} disabled={busy || !contact || (!summary && !pdf)}>{busy ? "Enviando…" : "Enviar"}</Button></div>
    </Modal>
  );
};

const GradeCard = ({ g, manager, onSend, onDelete }) => {
  const [busy, setBusy] = useState(false);
  const copy = async () => {
    setBusy(true);
    try {
      const { data } = await api.get(`/grades/${g.id}`);
      await copyText(data.whatsappSummary, "Resumo copiado. É só colar na conversa.");
    } catch (e) { toastError(e); }
    setBusy(false);
  };
  const hasInternship = Boolean(g.internshipInfo);
  const tracks = g.courseTracks || [];
  const decisionSemester = tracks.map((t) => t.decisionSemester).find(Boolean);
  return (
    <Card className="flex h-full min-h-[25rem] flex-col overflow-hidden shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="min-h-24">
        <CardTitle className="flex items-start gap-2 text-base">
          <GraduationCap className="mt-0.5 size-4 shrink-0 text-brand-cyan-700" />
          <span className="line-clamp-2">{g.courseName}</span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">{[g.modality, g.curriculumTerm && `Matriz ${g.curriculumTerm}`].filter(Boolean).join(" · ") || "Modalidade não informada"}</p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <span className={cn("rounded-full px-2 py-1 text-xs font-medium", g.hasTcc ? "bg-status-success-bg text-status-success" : "bg-muted text-muted-foreground")}>{g.hasTcc ? "Possui TCC" : "Sem TCC informado"}</span>
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium", hasInternship ? "bg-brand-cyan-50 text-brand-cyan-700" : "bg-status-warning-bg text-status-warning")}>
            <Briefcase className="size-3" />
            {hasInternship ? (g.totalInternshipHours ? `${g.totalInternshipHours.toLocaleString("pt-BR")}h de estágio` : "Possui estágio obrigatório") : "Não tem estágio obrigatório"}
          </span>
          <span className="rounded-full bg-muted px-2 py-1 text-xs"><FileText className="mr-1 inline size-3" /> PDF</span>
          {!g.complete && <span title="O PDF não trouxe todos os dados (curso, carga horária ou duração). Confira antes de enviar." className="rounded-full bg-status-warning-bg px-2 py-1 text-xs font-medium text-status-warning">Conferir dados</span>}
        </div>
        {(g.degree || g.knowledgeArea || g.durationSemesters) && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{g.degree || "Grau não identificado"}</span>
            {g.knowledgeArea && <span>• {g.knowledgeArea}</span>}
            {g.durationSemesters && <span>• {g.durationSemesters} semestres</span>}
          </div>
        )}
        {tracks.length > 1 && (
          <div className="rounded-lg border border-brand-cyan/30 bg-brand-cyan-50/60 p-3">
            <div className="flex items-center gap-2 font-medium text-brand-navy"><Route className="size-4" /> Duas formações disponíveis</div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{decisionSemester ? `O aluno define entre Bacharelado e Licenciatura no ${decisionSemester}º semestre.` : "O PDF apresenta Bacharelado e Licenciatura."}</p>
          </div>
        )}
        <div className="line-clamp-3 min-h-[4.5rem] whitespace-pre-line text-sm leading-6 text-muted-foreground">{g.internshipInfo || "Esta matriz não prevê estágio obrigatório."}</div>
        {g.totalCourseHours ? <p className="text-xs text-muted-foreground">Carga horária total: {g.totalCourseHours.toLocaleString("pt-BR")}h.</p> : null}
        <div className="mt-auto space-y-3 pt-2">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => onSend(g)} className="h-9 gap-2 px-3"><Send className="size-4" /> Enviar ao contato</Button>
            <Button variant="outline" onClick={copy} disabled={busy} className="h-9 gap-2 px-3"><ClipboardCopy className="size-4" /> Copiar resumo</Button>
          </div>
          <div className="border-t pt-3 text-xs text-muted-foreground">Atualizada em {new Date(g.updatedAt).toLocaleString("pt-BR")}</div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => openPdf(`/grades/${g.id}/file`)} className="inline-flex h-9 items-center gap-2 rounded-md bg-brand-navy px-3 text-sm font-medium text-white transition-opacity hover:opacity-90"><Download className="size-4" /> Baixar PDF</button>
            {manager && <Button variant="ghost" onClick={() => onDelete(g)} className="h-9 gap-1.5 px-2 text-status-danger hover:bg-status-danger-bg"><Trash2 className="size-4" /> Excluir</Button>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const Grades = () => {
  const { user } = useContext(AuthContext);
  const manager = isManager(user);
  const [data, setData] = useState(null);
  const [search, setSearch] = useState("");
  const [degree, setDegree] = useState("");
  const [area, setArea] = useState("");
  const [duration, setDuration] = useState("");
  const [sendFor, setSendFor] = useState(null);
  const [delFor, setDelFor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef(null);
  const timer = useRef(null);

  const load = useCallback(() => {
    api.get("/grades", { params: { search: search.trim() || undefined, degree: degree || undefined, area: area || undefined } })
      .then(({ data: d }) => setData(d)).catch((e) => { toastError(e); setData({ grades: [], degrees: [], areas: [], modalities: [] }); });
  }, [search, degree, area]);
  useEffect(() => { clearTimeout(timer.current); timer.current = setTimeout(load, 250); return () => clearTimeout(timer.current); }, [load]);

  const upload = async (files) => {
    const list = Array.from(files || []).filter((f) => /\.pdf$/i.test(f.name));
    if (!list.length) { toast.error("Escolha arquivos PDF."); return; }
    setBusy(true);
    try {
      const form = new FormData();
      list.forEach((f) => form.append("files", f));
      form.append("mode", "upsert");
      const { data: r } = await api.post("/grades", form);
      toast.success(`${r.created} nova(s), ${r.updated} atualizada(s), ${r.unchanged} sem mudança${r.failed ? `, ${r.failed} com problema` : ""}.`);
      const problems = (r.results || []).filter((x) => !x.ok);
      if (problems.length) toast.warn(`${problems[0].name}: ${problems[0].message}`, { autoClose: 9000 });
      load();
    } catch (e) {
      const results = e.response && e.response.data && e.response.data.results;
      toast.error(results && results[0] ? `${results[0].name}: ${results[0].message}` : errorText(e));
    }
    setBusy(false);
    if (fileInput.current) fileInput.current.value = "";
  };
  const remove = async () => {
    try { await api.delete(`/grades/${delFor.id}`); toast.success("Grade excluída."); setDelFor(null); load(); } catch (e) { toastError(e); }
  };

  const durations = useMemo(() => [...new Set((data ? data.grades : []).map((g) => g.durationSemesters).filter(Boolean))].sort((a, b) => a - b), [data]);
  const visible = (data ? data.grades : []).filter((g) => !duration || g.durationSemesters === Number(duration));
  const active = Boolean(degree || area || duration);

  return (
    <div className="orig mx-auto w-full max-w-[1440px] flex-1 overflow-y-auto p-4 pb-10 sm:p-6" style={{ minHeight: 0 }}>
      <div className="mb-6 flex animate-blur-fade flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-cyan-700"><span aria-hidden="true" className="h-px w-6 bg-gradient-to-r from-brand-cyan to-transparent" />Material comercial</div>
          <h1 className="break-words bg-gradient-to-r from-[#003B71] via-[#0a5a9a] to-[#0693e3] bg-clip-text text-2xl font-semibold tracking-tight text-transparent sm:text-3xl">Grades curriculares</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">Biblioteca de PDFs com informações objetivas para orientar a conversa e o envio ao candidato.</p>
        </div>
      </div>

      {manager && (
        <div
          role="button" tabIndex={0} aria-label="Selecionar ou arrastar os PDFs das matrizes curriculares" aria-busy={busy}
          onClick={() => { if (!busy && fileInput.current) fileInput.current.click(); }}
          onKeyDown={(e) => { if (!busy && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); if (fileInput.current) fileInput.current.click(); } }}
          onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); if (!busy) upload(e.dataTransfer.files); }}
          className={cn("mb-6 flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center shadow-inner transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 sm:p-8", dragging ? "scale-[1.01] border-brand-cyan bg-gradient-to-br from-brand-cyan-50 to-white" : "border-slate-300 bg-gradient-to-br from-white via-slate-50 to-cyan-50/70 hover:border-brand-cyan/70 hover:from-white hover:to-cyan-50", busy && "cursor-wait opacity-80")}
        >
          <input ref={fileInput} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
          <span className={cn("grid size-12 place-items-center rounded-2xl border bg-white text-brand-navy shadow-sm transition", dragging && "-translate-y-1 border-brand-cyan text-brand-cyan-700")}><UploadCloud className="size-6" aria-hidden="true" /></span>
          <strong className="mt-3 text-base">{busy ? "Lendo os PDFs…" : dragging ? "Solte para enviar" : "Anexar matrizes curriculares"}</strong>
          <span className="mt-1 max-w-xl text-sm text-muted-foreground">{busy ? "O sistema lê grau, área, duração, estágios e TCC e confere com o documento." : "Arraste os PDFs para cá ou clique para selecionar (vários de uma vez, se quiser). O sistema lê grau, área, duração, estágios e TCC e confere com o documento."}</span>
          {!busy && <span className="mt-3 rounded-lg border bg-white px-3 py-1 text-xs font-bold tracking-[0.16em] text-brand-navy">PDF</span>}
        </div>
      )}

      <div className="relative mb-4">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar curso, área ou tipo" className="h-11 bg-card pl-9" />
      </div>

      <div className="mb-6 rounded-xl border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium"><SlidersHorizontal className="size-4 text-brand-cyan-700" /> Organizar catálogo</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField label="Grau" value={degree} onChange={setDegree} emptyLabel="Todos os graus" options={(data ? data.degrees : []).map((d) => ({ value: d, label: d }))} />
          <SelectField label="Área" value={area} onChange={setArea} emptyLabel="Todas as áreas" options={(data ? data.areas : []).map((d) => ({ value: d, label: d }))} />
          <SelectField label="Duração" value={duration} onChange={setDuration} emptyLabel="Todas as durações" options={durations.map((d) => ({ value: String(d), label: `${d} semestres` }))} />
          <div className="flex items-end gap-2">
            <Button className="h-8 flex-1" onClick={load}><Filter className="mr-1.5 size-4" /> Filtrar</Button>
            {(active || search) && <Button variant="ghost" className="h-8" onClick={() => { setSearch(""); setDegree(""); setArea(""); setDuration(""); }}><X className="mr-1 size-4" /> Limpar</Button>}
          </div>
        </div>
      </div>

      <p className="mb-4 text-sm text-muted-foreground">{visible.length} {visible.length === 1 ? "grade encontrada" : "grades encontradas"}{search || active ? " com os filtros atuais." : "."}</p>
      {!data ? <p className="text-sm text-muted-foreground">Carregando…</p> : (
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.length === 0 ? (
            <Card className="md:col-span-2 xl:col-span-3"><CardContent className="py-12 text-center text-sm text-muted-foreground">{manager && !search && !active ? "Nenhuma grade ainda. Arraste os PDFs das matrizes para a área acima." : "Nenhuma grade corresponde aos filtros selecionados."}</CardContent></Card>
          ) : visible.map((g) => <GradeCard key={g.id} g={g} manager={manager} onSend={setSendFor} onDelete={setDelFor} />)}
        </div>
      )}

      <SendDialog grade={sendFor} onClose={() => setSendFor(null)} />
      {delFor && (
        <Modal title="Excluir a grade?" description={`“${delFor.courseName}” e o PDF dela saem do catálogo. Para trazer de volta é preciso enviar o PDF de novo.`} onClose={() => setDelFor(null)}>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDelFor(null)}>Cancelar</Button><Button onClick={remove}>Excluir</Button></div>
        </Modal>
      )}
    </div>
  );
};

export default Grades;
