import React, { useCallback, useEffect, useRef, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { Bell, CheckCircle2, HelpCircle, Clock3, GraduationCap, Loader2, RotateCcw, Send, ClipboardCopy, UserCheck, UserX, X } from "lucide-react";

import api from "../../services/api";
import { copyText, errorText } from "../Analysis/shared";
import { Badge, Button, Portal, cn, formatDay } from "../Analysis/orig";
import { ContactChooser } from "../Analysis/ContactChooser";

// The return 24 hours after the analysis was delivered (matriculou / não se matriculou / reanálise) and the commercial
// proposal, as in the original system. The numbers come from the server; here only the decision of the person is taken.

export const FOLLOW_UP_EVENT = "followups:changed";
export const announceFollowUpChange = () => { try { window.dispatchEvent(new Event(FOLLOW_UP_EVENT)); } catch (e) { /* old browser */ } };

const LABEL = { PENDING: "Aguardando retorno", ENROLLED: "Aluno matriculado", NOT_ENROLLED: "Aluno não se matriculou" };

const since = (value) => {
  if (!value) return "";
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "agora";
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return "há menos de 1 hora";
  if (hours < 48) return `há ${hours} h`;
  return `há ${Math.floor(hours / 24)} dias`;
};

const Modal = ({ title, description, children, onClose }) => {
  const box = useRef(null);
  // the closing function changes at every draw of the parent: keep it in a ref so the window below is set up once
  // (otherwise the focus would jump back to the dialog at every key typed)
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // focus the dialog only when nothing inside it took the focus already (the search field has autofocus)
    if (box.current && !box.current.contains(document.activeElement)) box.current.focus();
    // the contact list (another dialog on top of this one) takes the Escape first
    const onKey = (ev) => { if (ev.key === "Escape" && !document.querySelector(".MuiDialog-root")) closeRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (previous && previous.focus) previous.focus();
    };
  }, []);
  return (
    <Portal><div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[1300] grid place-items-center p-4">
      <button type="button" tabIndex={-1} aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div ref={box} tabIndex={-1} className="relative max-h-[90vh] w-full max-w-md space-y-3 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl outline-none">
        <div><h2 className="text-base font-semibold text-slate-900">{title}</h2>{description && <p className="mt-1 text-sm text-slate-500">{description}</p>}</div>
        {children}
      </div>
    </div></Portal>
  );
};

// ------------------------------------------------------------------ the three decisions

const OutcomeButton = ({ icon: Icon, title, description, tone, active, busy, disabled, onClick }) => {
  const colors = {
    success: "border-status-success/35 text-status-success hover:border-status-success hover:bg-status-success-bg",
    danger: "border-status-danger/35 text-status-danger hover:border-status-danger hover:bg-status-danger-bg",
    info: "border-brand-cyan/40 text-brand-cyan-700 hover:border-brand-cyan hover:bg-brand-cyan-50",
  };
  return (
    <Button variant="outline" disabled={disabled} onClick={onClick} className={cn("h-auto min-h-20 justify-start bg-card px-4 py-3 text-left", colors[tone], active && tone === "danger" && "border-status-danger bg-status-danger-bg")}>
      <Icon className={cn("size-5 shrink-0", busy && "animate-spin")} />
      <span><span className="block font-semibold text-foreground">{title}</span><span className="mt-0.5 block whitespace-normal text-xs font-normal text-muted-foreground">{description}</span></span>
    </Button>
  );
};

export const EnrollmentBanner = ({ analysis, onChanged }) => {
  const e = analysis.enrollment || { status: "PENDING" };
  const due = !!e.due;
  const [editing, setEditing] = useState(e.status === "PENDING" && (!e.reanalysisAt || due));
  const [decision, setDecision] = useState(null);
  const [text, setText] = useState(e.note || "");
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const save = async (status, reanalysis) => {
    if (busy) return;
    setBusy(true);
    try {
      // the reason belongs only to "did not enroll"; a note typed and abandoned must not follow another outcome
      const note = status === "NOT_ENROLLED" && !reanalysis ? text.trim() : "";
      const { data } = await api.put(`/analysis/curricular/${analysis.id}/enrollment`, { status, note, reanalysis: !!reanalysis });
      toast.success(reanalysis ? "Reanálise registrada. Novo retorno em 24 horas." : status === "ENROLLED" ? "Matrícula registrada." : "Não matrícula registrada.");
      onChanged(data);
      announceFollowUpChange();
      // the screen may have been replaced by the new data (it restarts when the outcome changes)
      if (alive.current) { setDecision(null); setEditing(false); }
    } catch (err) { toast.error(errorText(err)); }
    if (alive.current) setBusy(false);
  };

  if (!editing) {
    const positive = e.status === "ENROLLED";
    return (
      <div className={cn("flex flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-center md:justify-between", positive ? "border-status-success/30 bg-status-success-bg" : "border-brand-cyan/30 bg-brand-cyan-50/50")}>
        <div className="flex items-start gap-3">
          {positive ? <UserCheck className="mt-0.5 size-5 shrink-0 text-status-success" /> : <RotateCcw className="mt-0.5 size-5 shrink-0 text-brand-cyan-700" />}
          <div>
            <div className={cn("font-semibold", positive ? "text-status-success" : "text-brand-navy")}>{e.reanalysisAt && e.status === "PENDING" ? "Reanálise registrada" : LABEL[e.status]}</div>
            <p className="text-sm text-muted-foreground">
              {e.reanalysisAt && e.status === "PENDING"
                ? `Novo retorno programado para 24 horas após ${formatDay(e.reanalysisAt)}.`
                : `Informado${e.updatedAt ? ` em ${formatDay(e.updatedAt)}` : ""}${e.note ? ` · ${e.note}` : ""}`}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => setEditing(true)}>Alterar retorno</Button>
      </div>
    );
  }

  return (
    <section aria-label="Resultado do atendimento" className={cn("rounded-2xl border p-4 shadow-sm sm:p-5", due ? "border-status-warning/50 bg-status-warning-bg" : "border-brand-cyan/30 bg-brand-cyan-50/50")}>
      <div className="flex items-start gap-3">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", due ? "bg-status-warning/15 text-status-warning" : "bg-brand-cyan/10 text-brand-cyan-700")}><Clock3 className="size-5" /></span>
        <div>
          <p className={cn("font-semibold", due ? "text-status-warning" : "text-brand-navy")}>{due ? "Ação necessária: registre o resultado do atendimento" : "Resultado do atendimento"}</p>
          <p className="mt-1 text-sm text-muted-foreground">{due ? "Já se passaram 24 horas. Escolha o desfecho abaixo para manter a carteira atualizada." : "Quando houver uma definição, escolha uma das três opções abaixo."}</p>
        </div>
      </div>
      <div className="mt-5 space-y-4">
        <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="Resultado do atendimento">
          <OutcomeButton icon={busy ? Loader2 : CheckCircle2} busy={busy} title="Matriculou" description="Registrar matrícula confirmada" tone="success" disabled={busy} onClick={() => save("ENROLLED", false)} />
          <OutcomeButton icon={UserX} title="Não se matriculou" description="Informar o motivo" tone="danger" active={decision === "NOT_ENROLLED"} disabled={busy} onClick={() => setDecision("NOT_ENROLLED")} />
          <OutcomeButton icon={RotateCcw} title="Reanálise" description="Novo retorno em 24 horas" tone="info" disabled={busy} onClick={() => save("NOT_ENROLLED", true)} />
        </div>
        {decision === "NOT_ENROLLED" && (
          <div className="rounded-xl border border-status-danger/25 bg-card/90 p-3 sm:p-4">
            <div className="flex items-start gap-2">
              <HelpCircle className="mt-0.5 size-4 shrink-0 text-status-danger" />
              <div className="min-w-0 flex-1 space-y-2">
                <label htmlFor={`enrollment-note-${analysis.id}`} className="text-sm font-semibold">Motivo da não matrícula <span className="text-status-danger">*</span></label>
                <textarea id={`enrollment-note-${analysis.id}`} value={text} onChange={(ev) => setText(ev.target.value)} maxLength={300} autoFocus placeholder="Ex.: desistiu, aguardará nova condição comercial…" className="block min-h-20 w-full rounded-md border border-slate-200 bg-white p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => { setDecision(null); setText(e.note || ""); }} disabled={busy}>Cancelar</Button>
                  <Button size="sm" variant="destructive" onClick={() => save("NOT_ENROLLED", false)} disabled={busy || text.trim().length < 3}>{busy && <Loader2 className="size-4 animate-spin" />} Confirmar não matrícula</Button>
                </div>
              </div>
            </div>
          </div>
        )}
        {e.status !== "PENDING" && <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDecision(null); }} disabled={busy}>Cancelar alteração</Button>}
      </div>
    </section>
  );
};

// ------------------------------------------------------------------ commercial proposal

export const ProposalCard = ({ analysis, onChanged }) => {
  const [p, setP] = useState(null);
  const [open, setOpen] = useState(false);
  const [contact, setContact] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setP(null);
    api.get(`/analysis/curricular/${analysis.id}/proposal`).then(({ data }) => { if (alive) setP(data && typeof data.message === "string" ? data : null); }).catch(() => { if (alive) setP(null); });
    return () => { alive = false; };
  }, [analysis.id, analysis.updatedAt]);

  if (!p) return null;
  const send = async () => {
    if (!contact || busy) return;
    setBusy(true);
    try {
      await api.post(`/analysis/curricular/${analysis.id}/send-proposal`, { contactId: contact.id });
      toast.success(`Mensagem enviada para ${contact.name}.`);
      setOpen(false);
      setContact(null);
    } catch (err) { toast.error(errorText(err)); setBusy(false); return; }
    // the message is already sent: a failure to refresh the screen must not look like a failure to send
    try { const { data } = await api.get(`/analysis/curricular/${analysis.id}`); onChanged(data); } catch (err) { /* the next visit shows the link */ }
    setBusy(false);
  };

  return (
    <section aria-label="Proposta comercial" className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-navy-50 text-brand-navy"><GraduationCap className="size-5" /></span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-brand-navy">Proposta comercial</h2>
              {p.isHighValue && <Badge variant="outline" className="border-transparent bg-status-success-bg font-medium text-status-success">Lead prioritário</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {p.exemptedPercentage}% da grade aproveitada
              {p.savedTerms ? ` · até ${p.savedTerms} semestre(s) a menos no percurso` : ""}
              {p.highValueReason ? `. ${p.highValueReason}` : "."}
            </p>
            {analysis.contactId ? <p className="mt-1 text-xs text-slate-500">Esta análise está ligada a um contato; o resumo aparece na conversa dele.</p> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-9" onClick={() => copyText(p.message, "Mensagem copiada. É só colar na conversa.")}><ClipboardCopy className="mr-1.5 size-4" />Copiar mensagem</Button>
          <Button className="h-9" onClick={() => setOpen(true)}><Send className="mr-1.5 size-4" />Enviar ao contato</Button>
        </div>
      </div>
      {open && (
        <Modal title="Enviar ao contato" description="A mensagem vai na conversa aberta do contato. Se não houver, abrimos uma." onClose={() => { setOpen(false); setContact(null); }}>
          <ContactChooser autoOpen title="Enviar proposta ao contato" contact={contact} onPick={setContact} />
          <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl border bg-slate-50 p-3 font-sans text-xs leading-5 text-slate-700">{p.message}</pre>
          <p className="text-xs text-slate-500">O texto não promete valor nem condição financeira. As estimativas dependem da oferta de disciplinas e da matrícula.</p>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { setOpen(false); setContact(null); }}>Cancelar</Button><Button disabled={busy || !contact} onClick={send}>{busy ? "Enviando…" : "Enviar"}</Button></div>
        </Modal>
      )}
    </section>
  );
};

// ------------------------------------------------------------------ the bell: returns waiting and, for the management, cases without enrollment

// the sidebar listens to the live event and announces it here (one socket for the whole screen)
export const useFollowUps = () => {
  const [data, setData] = useState(null);
  const load = useCallback(() => {
    api.get("/analysis/follow-ups")
      .then(({ data: d }) => setData({ total: Number(d && d.total) || 0, due: Array.isArray(d && d.due) ? d.due : [], stale: Array.isArray(d && d.stale) ? d.stale : [] }))
      .catch(() => setData((x) => x || { total: 0, due: [], stale: [] }));
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(FOLLOW_UP_EVENT, load);
    return () => window.removeEventListener(FOLLOW_UP_EVENT, load);
  }, [load]);
  return [data, load];
};

const Row = ({ item, note, onOpen }) => (
  <li>
    <button type="button" onClick={() => onOpen(item.id)} className="flex w-full items-center justify-between gap-3 border-b px-4 py-3 text-left text-sm last:border-0 hover:bg-muted/60">
      <span className="min-w-0">
        <strong className="block truncate">{item.candidateName || "Candidato sem nome"}</strong>
        <span className="block truncate text-xs text-slate-500">{[item.courseName, item.ownerName].filter(Boolean).join(" · ")}</span>
      </span>
      <span className="shrink-0 text-xs font-medium text-status-warning">{note}</span>
    </button>
  </li>
);

export const FollowUpPanel = () => {
  const history = useHistory();
  const [data] = useFollowUps();
  if (!data || (!data.due.length && !(data.stale || []).length)) return null;
  const open = (id) => history.push(`/analise-curricular/${id}`);
  return (
    <section aria-label="Retornos pendentes" className="space-y-4">
      {data.due.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-status-warning/40 bg-status-warning-bg/40">
          <div className="flex items-center gap-2 px-4 py-3 font-semibold text-status-warning"><Bell className="size-4" />Retornos para fazer ({data.total})</div>
          <ul className="bg-card">{data.due.map((i) => <Row key={i.id} item={i} onOpen={open} note={new Date(i.dueAt).getTime() > Date.now() ? "" : `${i.reanalysis ? "reanálise " : ""}venceu ${since(i.dueAt)}`} />)}</ul>
          {data.total > data.due.length && <p className="bg-card px-4 py-2 text-xs text-slate-500">Mostrando {data.due.length} de {data.total}.</p>}
        </div>
      )}
      {(data.stale || []).length > 0 && (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="px-4 py-3"><div className="font-semibold text-brand-navy">Sem matrícula há mais de 2 dias úteis</div><p className="text-xs text-slate-500">Análises entregues que ainda não viraram matrícula, das mais antigas para as mais novas.</p></div>
          <ul className="border-t">{data.stale.map((i) => <Row key={i.id} item={i} onOpen={open} note={since(i.deliveredAt)} />)}</ul>
        </div>
      )}
    </section>
  );
};
