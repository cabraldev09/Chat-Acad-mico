import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { Ban, ChevronDown, Copy, FilePlus2, KeyRound, LineChart, Search, ShieldCheck, UserPlus } from "lucide-react";

import { AuthContext } from "../../context/Auth/AuthContext";
import { isManager } from "../../utils/access";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { copyText, errorText, initialsOf } from "../Analysis/shared";
import { Badge, Button, Card, CardContent, Input, Portal, cn } from "../Analysis/orig";
import { DOC_LABEL, RESULT_LABEL } from "../AcademicAnalysis";

// "Alunos": who has access to the Portal do Aluno, in the look of the original. The tutor registers the student (by RGM),
// sends the invitation (the link goes by e-mail when the account is set up, and can always be copied to send by WhatsApp),
// and follows the versions.

const Modal = ({ title, description, children, onClose, wide }) => (
  <Portal><div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[1300] grid place-items-center p-4">
    <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-black/40" />
    <div className={cn("relative w-full space-y-3 rounded-2xl bg-white p-5 shadow-xl", wide ? "max-w-lg" : "max-w-sm")}>
      <div><h2 className="text-base font-semibold text-slate-900">{title}</h2>{description && <p className="mt-1 text-sm text-slate-500">{description}</p>}</div>
      {children}
    </div>
  </div></Portal>
);

const Field = ({ label, hint, children }) => <label className="block text-xs font-semibold text-slate-600">{label}<span className="mt-1.5 block">{children}</span>{hint && <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span>}</label>;

const StudentDialog = ({ onClose, onSaved, users, manager }) => {
  const [f, setF] = useState({ rgm: "", name: "", email: "", phone: "", courseName: "", responsibleUserId: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    try { const { data } = await api.post("/students", { ...f, responsibleUserId: f.responsibleUserId || undefined }); toast.success("Aluno cadastrado."); onSaved(data); } catch (e) { toast.error(errorText(e)); }
    setBusy(false);
  };
  return (
    <Modal title="Novo aluno" onClose={busy ? () => undefined : onClose}>
      <Field label="RGM"><Input autoFocus value={f.rgm} onChange={set("rgm")} className="h-10 bg-white" /></Field>
      <Field label="Nome completo"><Input value={f.name} onChange={set("name")} className="h-10 bg-white" /></Field>
      <Field label="E-mail (para o convite)"><Input value={f.email} onChange={set("email")} className="h-10 bg-white" /></Field>
      <Field label="WhatsApp (opcional)"><Input value={f.phone} onChange={set("phone")} className="h-10 bg-white" /></Field>
      <Field label="Curso (opcional)" hint="O documento enviado tem de ser deste curso. Em branco, vale o do primeiro documento."><Input value={f.courseName} onChange={set("courseName")} className="h-10 bg-white" /></Field>
      {manager && (
        <Field label="Tutor responsável">
          <span className="relative block">
            <select value={f.responsibleUserId} onChange={set("responsibleUserId")} className="h-10 w-full appearance-none rounded-md border border-slate-200 bg-white px-3 pr-10 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="">Eu mesmo</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          </span>
        </Field>
      )}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button><Button onClick={save} disabled={busy || !f.rgm.trim() || !f.name.trim()}>{busy ? "Cadastrando…" : "Cadastrar"}</Button></div>
    </Modal>
  );
};

const Students = () => {
  const history = useHistory();
  const { user } = useContext(AuthContext);
  const manager = isManager(user);
  const [rows, setRows] = useState(null);
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [portal, setPortal] = useState("");
  const [invite, setInvite] = useState(null);
  const [uploadFor, setUploadFor] = useState(null);
  const fileInput = useRef(null);

  const load = useCallback(() => {
    api.get("/students", { params: { search: applied.trim() || undefined } }).then(({ data }) => setRows(data)).catch((e) => { toastError(e); setRows([]); });
  }, [applied]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get("/students/portal-url").then(({ data }) => setPortal(data.url)).catch(() => undefined);
    if (manager) api.get("/users", { params: { pageNumber: 1 } }).then(({ data }) => setUsers((data.users || []).filter((u) => u.role === "tutor" || u.role === "coordenacao"))).catch(() => undefined);
  }, [manager]);

  const sendInvite = async (s) => {
    try { const { data } = await api.post(`/students/${s.id}/invite`, {}); setInvite({ student: s, ...data }); load(); } catch (e) { toast.error(errorText(e)); }
  };
  const block = async (s) => {
    try { await api.put(`/students/${s.id}`, { blocked: !s.blocked }); toast.success(s.blocked ? "Acesso liberado. Envie um novo convite." : "Acesso bloqueado."); load(); } catch (e) { toast.error(errorText(e)); }
  };
  const upload = async (file) => {
    const s = uploadFor;
    setUploadFor(null);
    if (!file || !s) return;
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post(`/students/${s.id}/upload`, form);
      toast.success(data.reused ? "Este documento não mudou nada na análise." : "Análise atualizada.");
      load();
    } catch (e) { toast.error(errorText(e), { autoClose: 9000 }); }
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <div className="orig mx-auto w-full max-w-[1440px] flex-1 overflow-y-auto p-4 pb-10 sm:p-6" style={{ minHeight: 0 }}>
      <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => upload(e.target.files[0])} />
      <div className="mb-6 flex animate-blur-fade flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-cyan-700"><span aria-hidden="true" className="h-px w-6 bg-gradient-to-r from-brand-cyan to-transparent" />Portal do aluno</div>
          <h1 className="break-words bg-gradient-to-r from-[#003B71] via-[#0a5a9a] to-[#0693e3] bg-clip-text text-2xl font-semibold tracking-tight text-transparent sm:text-3xl">Alunos</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">Quem tem acesso ao Portal do Aluno: cadastre pelo RGM, envie o convite e acompanhe as versões da análise.</p>
        </div>
        <Button size="lg" className="h-10 px-4" onClick={() => setOpen(true)}><UserPlus className="mr-2 size-4" />Novo aluno</Button>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); setApplied(query); }} className="mb-4 flex flex-col gap-2 rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50/90 via-white to-slate-50 p-3 sm:flex-row sm:items-end sm:p-4">
        <label className="block min-w-0 flex-1 text-xs font-semibold text-slate-600">Buscar aluno
          <span className="relative mt-1.5 block"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome, RGM ou e-mail" className="h-10 border-slate-200 bg-white pl-9" /></span>
        </label>
        <Button type="submit" size="lg" className="h-10"><Search aria-hidden="true" className="mr-2 size-4" />Buscar</Button>
      </form>

      {portal && (
        <p className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">Endereço do portal para os alunos: <strong className="break-all text-foreground">{portal}</strong>
          <Button variant="outline" size="sm" onClick={() => copyText(portal, "Endereço copiado.")}><Copy className="size-3.5" /> Copiar</Button>
        </p>
      )}

      {rows === null ? <p className="text-sm text-muted-foreground">Carregando…</p> : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center">
          <p className="font-medium text-slate-800">Nenhum aluno cadastrado</p>
          <p className="mx-auto mt-1 max-w-xl text-sm text-slate-500">Cadastre o aluno pelo RGM e envie o convite. Ele escolhe a própria senha, vê a situação acadêmica e a previsão de formatura e pode enviar um extrato novo quando quiser.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((s) => {
            const res = s.current && RESULT_LABEL[s.current.status];
            const state = s.blocked ? ["Bloqueado", "bg-status-danger-bg text-status-danger"] : s.activated ? ["Acesso ativo", "bg-status-success-bg text-status-success"] : ["Convite pendente", "bg-status-warning-bg text-status-warning"];
            return (
              <Card key={s.id} className="h-full border-l-4 border-l-sky-500 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg">
                <CardContent className="flex h-full flex-col gap-3 p-4 sm:p-5">
                  <div className="flex items-center gap-3">
                    <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-cyan-50 font-semibold text-brand-cyan-700">{initialsOf(s.name)}</span>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-900">{s.name}</div>
                      <div className="truncate text-sm text-slate-600">RGM {s.rgm}{s.courseName ? ` · ${s.courseName}` : ""}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={cn("border-transparent font-medium", state[1])}>{state[0]}</Badge>
                    {s.current && <Badge variant="outline" className="border-slate-300 bg-slate-50">{DOC_LABEL[s.current.documentType] || "Documento"} · v{s.current.version}</Badge>}
                    {s.current && s.current.currentPeriod && <Badge variant="outline" className="border-slate-300 bg-slate-50">{s.current.currentPeriod}º período</Badge>}
                    {res && <Badge variant={res[1] === "bad" ? "destructive" : "secondary"}>{res[0]}</Badge>}
                  </div>
                  <p className="text-xs leading-5 text-slate-600">{s.responsibleName ? `Tutor: ${s.responsibleName} · ` : ""}{s.email || "sem e-mail"}{s.lastLoginAt ? ` · último acesso ${new Date(s.lastLoginAt).toLocaleDateString("pt-BR")}` : ""}</p>
                  <div className="mt-auto flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                    <Button className="h-8 gap-1.5 px-2.5" onClick={() => sendInvite(s)} disabled={s.blocked}><KeyRound className="size-3.5" />{s.activated ? "Nova senha" : "Convite"}</Button>
                    <Button variant="outline" className="h-8 gap-1.5 px-2.5" onClick={() => { setUploadFor(s); setTimeout(() => fileInput.current && fileInput.current.click(), 0); }}><FilePlus2 className="size-3.5" />Enviar PDF</Button>
                    {s.current && <Button variant="outline" className="h-8 gap-1.5 px-2.5" onClick={() => history.push(`/analise-academica/${s.current.id}`)}><LineChart className="size-3.5" />Análise</Button>}
                    <Button variant="ghost" className="h-8 gap-1.5 px-2.5" onClick={() => block(s)}>{s.blocked ? <ShieldCheck className="size-3.5" /> : <Ban className="size-3.5" />}{s.blocked ? "Liberar" : "Bloquear"}</Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {open && <StudentDialog onClose={() => setOpen(false)} users={users} manager={manager} onSaved={(s) => { setOpen(false); load(); sendInvite(s); }} />}
      {invite && (
        <Modal wide title={invite.student.activated ? "Link para criar uma nova senha" : "Convite para o portal"} onClose={() => setInvite(null)}>
          <p className="text-sm text-slate-600">{invite.emailed ? `Enviamos o link por e-mail para ${invite.student.email}.` : invite.student.email ? "O e-mail do sistema ainda não está configurado (Configurações → E-mail): copie o link e mande pelo WhatsApp." : "O aluno não tem e-mail cadastrado: copie o link e mande pelo WhatsApp."}</p>
          <textarea readOnly value={invite.link} rows={3} className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs outline-none" />
          <p className="text-xs text-slate-500">O link vale por {invite.expires} e só pode ser usado uma vez.</p>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setInvite(null)}>Fechar</Button><Button onClick={() => copyText(invite.link, "Link copiado.")}><Copy className="mr-1.5 size-4" />Copiar o link</Button></div>
        </Modal>
      )}
    </div>
  );
};

export default Students;
