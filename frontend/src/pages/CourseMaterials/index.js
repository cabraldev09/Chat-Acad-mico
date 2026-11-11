import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useHistory, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { ClipboardCopy, GraduationCap, ImagePlus, Search, Send, Trash2 } from "lucide-react";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { copyText, errorText } from "../Analysis/shared";
import { BackButton, Badge, Button, Card, CardContent, Input, Portal, cn } from "../Analysis/orig";
import { ContactChooser } from "../Analysis/ContactChooser";

// THE COMMERCIAL AREA OF THE COURSES. Each course with its format and the practical share that the MEC asks for, the text the institution approved and the prints it
// sent. The management attaches a print, the AI reads it, the management confirms; from then on the agent and the consultants say the same. Whoever sells copies
// the text and sends the print to a lead.
const Modal = ({ title, description, children, onClose, wide }) => (
  <Portal><div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[1300] grid place-items-center p-4">
    <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-black/40" />
    <div className={cn("relative max-h-[92dvh] w-full space-y-3 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl", wide ? "max-w-3xl" : "max-w-md")}>
      <div><h2 className="text-base font-semibold text-slate-900">{title}</h2>{description && <p className="mt-1 text-sm text-slate-500">{description}</p>}</div>
      {children}
    </div>
  </div></Portal>
);

const FORMAT_TONE = { EAD: "bg-status-success-bg text-status-success", Semipresencial: "bg-status-warning-bg text-status-warning", Presencial: "bg-brand-cyan-50 text-brand-cyan-700" };
const STATUS_LABEL = { pending: "Aguardando confirmação", confirmed: "Confirmado" };

// the file of a material is behind the login: it is shown through a blob
const useBlob = (url) => {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let alive = true;
    let made = null;
    api.get(url, { responseType: "blob" }).then(({ data }) => { made = URL.createObjectURL(data); if (alive) setSrc(made); }).catch(() => setSrc(null));
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [url]);
  return src;
};

const Preview = ({ material }) => {
  const src = useBlob(`/course-materials/${material.id}/file`);
  if (!src) return <div className="grid h-48 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">Carregando o print…</div>;
  if (material.mime === "application/pdf") return <a href={src} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-navy underline">Abrir o PDF do print</a>;
  return <a href={src} target="_blank" rel="noopener noreferrer" title="Abrir em tamanho real"><img src={src} alt={`Print do curso: ${material.originalName || ""}`} className="max-h-[60vh] w-full rounded-xl border object-contain" /></a>;
};

const SendDialog = ({ material, courseName, onClose }) => {
  const [contact, setContact] = useState(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState(null);
  const [whatsappId, setWhatsappId] = useState("");
  const send = async () => {
    setBusy(true);
    try {
      await api.post(`/course-materials/${material.id}/send`, { contactId: contact.id, caption, ...(whatsappId ? { whatsappId: Number(whatsappId) } : {}) });
      toast.success(`Print enviado para ${contact.name}.`);
      onClose();
    } catch (e) {
      const body = e && e.response && e.response.data;
      if (body && body.error === "ERR_CHOOSE_CONNECTION" && body.data) { setChoice(body.data); setWhatsappId(body.data.connections && body.data.connections.length === 1 ? String(body.data.connections[0].id) : ""); } else toastError(e);
    }
    setBusy(false);
  };
  const options = (choice && choice.connections) || [];
  return (
    <Modal title="Enviar o print para um contato" description={courseName} onClose={onClose}>
      <ContactChooser autoOpen allowGroups title="Enviar print" contact={contact} onPick={(c) => { setContact(c); setChoice(null); setWhatsappId(""); }} />
      <label className="block text-xs font-semibold text-slate-600">Mensagem junto com o print (opcional)<textarea value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={900} rows={3} className="mt-1.5 w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>
      {choice && (
        <div role="alert" className="grid gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <span>{choice.message}</span>
          {options.length > 0 && <select value={whatsappId} onChange={(e) => setWhatsappId(e.target.value)} className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm"><option value="">Escolha a conexão</option>{options.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>}
        </div>
      )}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={send} disabled={busy || !contact || (!!choice && !whatsappId)}>{busy ? "Enviando…" : "Enviar"}</Button></div>
    </Modal>
  );
};

// one print: what the AI read, side by side with the picture; the management corrects and confirms
const MaterialCard = ({ m, canManage, courseName, onChanged }) => {
  const [text, setText] = useState(m.reading.text || "");
  const [percent, setPercent] = useState(m.reading.percent === null || m.reading.percent === undefined ? "" : String(m.reading.percent));
  const [sync, setSync] = useState(m.reading.syncPercent === null || m.reading.syncPercent === undefined ? "" : String(m.reading.syncPercent));
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const confirm = async () => {
    setBusy(true);
    try {
      await api.put(`/course-materials/${m.id}/confirm`, { text, percent: percent === "" ? null : Number(percent.replace(",", ".")), syncPercent: sync === "" ? null : Number(sync.replace(",", ".")) });
      toast.success("Confirmado. A IA e os consultores já usam este texto e este percentual.");
      onChanged();
    } catch (e) { toast.error(errorText(e)); }
    setBusy(false);
  };
  const remove = async () => {
    if (!window.confirm("Excluir este print?")) return;
    try { await api.delete(`/course-materials/${m.id}`); onChanged(); } catch (e) { toastError(e); }
  };
  return (
    <Card className="overflow-hidden">
      <CardContent className="grid gap-4 p-4 md:grid-cols-2">
        <div className="space-y-2">
          <Preview material={m} />
          <div className="text-xs text-muted-foreground">{m.originalName} · enviado por {m.uploadedBy || "—"} em {new Date(m.createdAt).toLocaleString("pt-BR")}</div>
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn("border-transparent", m.status === "confirmed" ? "bg-status-success-bg text-status-success" : "bg-status-warning-bg text-status-warning")}>{STATUS_LABEL[m.status] || m.status}</Badge>
            {m.reading.format && <Badge variant="outline" className={cn("border-transparent", FORMAT_TONE[m.reading.format])}>{m.reading.format}</Badge>}
            {m.confirmedBy && <span className="text-xs text-muted-foreground">confirmado por {m.confirmedBy}</span>}
          </div>
          {m.readNote && <p className="rounded-lg bg-status-warning-bg p-2 text-xs text-status-warning">{m.readNote}</p>}
          {canManage ? (
            <>
              <label className="block text-xs font-semibold text-slate-600">Texto aprovado (o que a IA e o consultor dizem sobre o formato)<textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} maxLength={2000} className="mt-1.5 w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-slate-600">% presencial (prática)<Input value={percent} onChange={(e) => setPercent(e.target.value)} placeholder="ex.: 40" className="mt-1.5 h-10 bg-white" /></label>
                <label className="block text-xs font-semibold text-slate-600">% ao vivo (síncrona)<Input value={sync} onChange={(e) => setSync(e.target.value)} placeholder="ex.: 20" className="mt-1.5 h-10 bg-white" /></label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={confirm} disabled={busy}>{m.status === "confirmed" ? "Salvar alterações" : "Confirmar e usar"}</Button>
                <Button variant="outline" onClick={() => setSending(true)}><Send className="mr-1.5 size-4" />Enviar a um contato</Button>
                <Button variant="outline" onClick={remove} className="text-status-danger"><Trash2 className="mr-1.5 size-4" />Excluir</Button>
              </div>
            </>
          ) : (
            <>
              {m.reading.text && <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">{m.reading.text}</p>}
              <div className="flex flex-wrap gap-2">
                {m.reading.text && <Button variant="outline" onClick={() => copyText(m.reading.text)}><ClipboardCopy className="mr-1.5 size-4" />Copiar o texto</Button>}
                <Button onClick={() => setSending(true)}><Send className="mr-1.5 size-4" />Enviar a um contato</Button>
              </div>
            </>
          )}
        </div>
      </CardContent>
      {sending && <SendDialog material={m} courseName={courseName} onClose={() => setSending(false)} />}
    </Card>
  );
};

const CourseDetail = ({ id }) => {
  const [data, setData] = useState(null);
  const [uploading, setUploading] = useState(false);
  const load = useCallback(() => api.get(`/courses/${id}/materials`).then(({ data: d }) => setData(d)).catch((e) => { toastError(e); setData({ course: null, materials: [] }); }), [id]);
  useEffect(() => { load(); }, [load]);
  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await api.post(`/courses/${id}/materials`, form);
      toast.success("Print anexado. Confira o que a IA leu e confirme.");
      load();
    } catch (e) { toast.error(errorText(e)); }
    setUploading(false);
  };
  if (!data) return <p className="p-6 text-sm text-slate-500">Carregando…</p>;
  const c = data.course;
  if (!c) return <p className="p-6 text-sm text-slate-500">Curso não encontrado.</p>;
  return (
    <div className="space-y-5">
      <BackButton to="/cursos" label="Voltar aos cursos" />
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900"><GraduationCap className="size-6 text-brand-cyan-700" />{c.name}</h1>
        <p className="mt-1 text-sm text-slate-600">{[c.semesters ? `${c.semesters} semestres` : null, c.modality].filter(Boolean).join(" · ")}</p>
      </div>
      <div className={cn("rounded-xl border px-4 py-3 text-sm", c.mec.semPratica ? "border-status-success/30 bg-status-success-bg" : "border-status-warning/40 bg-status-warning-bg")}>
        <b>Exigência do MEC:</b> {c.mec.resumo} <span className="text-xs text-muted-foreground">({c.mec.fonte})</span>
      </div>
      <div className="rounded-xl border bg-card p-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Texto em uso pela IA e pelos consultores</div>
        {c.approvedText ? (
          <div className="mt-2 space-y-2"><p className="whitespace-pre-wrap text-sm">{c.approvedText}</p><Button variant="outline" className="h-9" onClick={() => copyText(c.approvedText)}><ClipboardCopy className="mr-1.5 size-4" />Copiar</Button></div>
        ) : <p className="mt-2 text-sm text-muted-foreground">Nenhum texto aprovado ainda: a IA usa o texto padrão do formato do curso.</p>}
      </div>
      {data.canManage && (
        <label className={cn("flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center text-sm", uploading && "opacity-60")}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files && e.dataTransfer.files[0]); }}>
          <ImagePlus className="size-7 text-brand-cyan-700" />
          <b>{uploading ? "Lendo o print…" : "Anexar print do curso"}</b>
          <span className="text-muted-foreground">Arraste a imagem aqui ou clique. PNG, JPG, WEBP ou PDF, até 8 MB. A IA lê o texto e o percentual; você confere e confirma.</span>
          <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" disabled={uploading} onChange={(e) => { upload(e.target.files && e.target.files[0]); e.target.value = ""; }} />
        </label>
      )}
      {data.materials.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum print anexado para este curso.</p> : data.materials.map((m) => <MaterialCard key={`${m.id}-${m.status}`} m={m} canManage={data.canManage} courseName={c.name} onChanged={load} />)}
    </div>
  );
};

const CourseList = () => {
  const history = useHistory();
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const [only, setOnly] = useState("");
  useEffect(() => { api.get("/course-materials").then(({ data: d }) => setData(d)).catch((e) => { toastError(e); setData({ courses: [] }); }); }, []);
  const list = useMemo(() => (data ? data.courses : []).filter((c) => (!q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase())) && (!only || (only === "waiting" ? c.waiting > 0 : only === "noText" ? !c.approvedText : c.mec.formato === only))), [data, q, only]);
  const waiting = data ? data.courses.filter((c) => c.waiting > 0).length : 0;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Cursos e materiais</h1>
        <p className="mt-1 text-sm text-slate-600">O formato de cada curso, a prática que o MEC exige, o texto aprovado pela instituição e os prints para enviar ao aluno.{waiting ? ` ${waiting} curso(s) com print aguardando confirmação.` : ""}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="relative block w-full sm:w-80"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar curso" aria-label="Buscar curso" className="h-10 bg-white pl-9" /></span>
        <select value={only} onChange={(e) => setOnly(e.target.value)} aria-label="Filtrar" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm">
          <option value="">Todos os cursos</option><option value="EAD">EAD</option><option value="Semipresencial">Semipresencial</option><option value="Presencial">Presencial</option>
          <option value="waiting">Com print a confirmar</option><option value="noText">Sem texto aprovado</option>
        </select>
      </div>
      {!data ? <p className="text-sm text-slate-500">Carregando…</p> : (
        <Card className="overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead><tr className="border-b text-xs text-muted-foreground"><th className="px-4 py-3 font-medium">Curso</th><th className="px-4 py-3 font-medium">Formato</th><th className="px-4 py-3 font-medium">Prática exigida</th><th className="px-4 py-3 font-medium">Texto aprovado</th><th className="px-4 py-3 font-medium">Prints</th></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} onClick={() => history.push(`/cursos/${c.id}`)} className="cursor-pointer border-b last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3 font-medium text-slate-900">{c.name}{c.semesters ? <span className="ml-2 text-xs font-normal text-muted-foreground">{c.semesters} sem.</span> : null}</td>
                  <td className="px-4 py-3"><Badge variant="outline" className={cn("border-transparent", FORMAT_TONE[c.mec.formato])}>{c.mec.formato}</Badge></td>
                  <td className="px-4 py-3 text-slate-600">{c.mec.semPratica ? "Sem aulas práticas" : `${c.mec.percentualPresencial}% presencial`}</td>
                  <td className="px-4 py-3 text-slate-600">{c.approvedText ? "Confirmado" : "Padrão do formato"}</td>
                  <td className="px-4 py-3">{c.prints}{c.waiting ? <span className="ml-2 rounded bg-status-warning-bg px-1.5 py-0.5 text-xs text-status-warning">{c.waiting} a confirmar</span> : null}</td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Nenhum curso para este filtro.</td></tr>}
            </tbody>
          </table>
        </div></Card>
      )}
    </div>
  );
};

const CourseMaterials = () => {
  const { id } = useParams();
  return (
    <div className="orig mx-auto w-full max-w-[1200px] flex-1 overflow-y-auto p-4 pb-10 sm:p-6" style={{ minHeight: 0 }}>
      {id ? <CourseDetail id={id} /> : <CourseList />}
    </div>
  );
};

export default CourseMaterials;
