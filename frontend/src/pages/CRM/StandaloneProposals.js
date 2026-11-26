import React, { Suspense, lazy, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem, TextField, Tooltip, Typography } from "@material-ui/core";
import { ClipboardList, Search, Trash2 } from "lucide-react";
import { AuthContext } from "../../context/Auth/AuthContext";
import { isManager } from "../../utils/access";
import { CpfField, NameField, PhoneField } from "../../components/MaskedFields";
import { confirmDialog } from "../../components/ConfirmDialog";
import { toast } from "react-toastify";

import api from "../../services/api";
import toastError from "../../errors/toastError";

const ProposalStudio = lazy(() => import("./ProposalStudio"));

const STATUS = { draft: "Rascunho", sent: "Gerada" };

// +55 69 99366-7971, as people read a phone
const phoneText = (digits) => {
  const d = String(digits || "").replace(/\D/g, "");
  if (/^55\d{10,11}$/.test(d)) {
    const rest = d.slice(4);
    return `+55 ${d.slice(2, 4)} ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
  }
  if (/^\d{10,11}$/.test(d)) return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
  return d ? `+${d}` : "";
};

// the people of the team who can take a lead (the commercial side), sorted by name; who is using it comes first
export const teamForOwner = (users, me) => {
  const list = (users || []).filter((u) => u && u.id && !["tutor", "academico", "relacionamento"].includes(u.role));
  const mine = list.find((u) => u.id === (me && me.id)) || (me && me.id ? { id: me.id, name: me.name } : null);
  const others = list.filter((u) => !mine || u.id !== mine.id).sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR"));
  return mine ? [mine, ...others] : others;
};

// Propostas avulsas: a proposal for someone who is not a lead of yours yet (a simulation, or a friend's lead).
// It needs only the name of the person; the CPF and the phone are optional (they help find it again, and the CRM does not double
// the person). When the link or the PDF is generated, the person goes to the CRM in "Proposta", in the name of who made it or of the
// colleague chosen here; from there the enrollment form is sent. Each person sees their own; they can be looked up again and deleted.
const StandaloneProposals = ({ open, onClose, ctx }) => {
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);
  const [name, setName] = useState("");
  const [withContact, setWithContact] = useState(false);
  const [cpf, setCpf] = useState("");
  const [phone, setPhone] = useState("");
  const [query, setQuery] = useState("");
  const [studio, setStudio] = useState(null); // { name, cpf?, phone?, id? }
  const [deleting, setDeleting] = useState(null);
  const [formBusy, setFormBusy] = useState(null);
  const { user } = useContext(AuthContext) || {};
  const team = useMemo(() => teamForOwner(ctx && ctx.users, user), [ctx, user]);
  const [ownerId, setOwnerId] = useState("");
  const owner = ownerId || (user && user.id) || "";
  const asked = useRef(0);

  const load = useCallback((q = "") => {
    setFailed(false);
    const n = ++asked.current;
    api.get("/proposals", { params: { standalone: 1, ...(q.trim() ? { q: q.trim() } : {}) } })
      .then(({ data }) => { if (n === asked.current) setRows(data); })
      .catch((e) => { if (n === asked.current) { setFailed(true); toastError(e); } });
  }, []);
  useEffect(() => { if (open) load(""); }, [open, load]);
  // the search goes to the server a moment after the person stops typing
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => load(query), 300);
    return () => clearTimeout(t);
  }, [query, open, load]);

  const copy = async (link) => {
    try { await navigator.clipboard.writeText(link); toast.success("Link copiado."); } catch (_) { toast.info(link); }
  };
  // the enrollment form of the person, now a lead: its personal link is copied (the one who has the lead, or the management)
  const enrollmentForm = async (p) => {
    setFormBusy(p.id);
    try {
      const { data } = await api.post(`/leads/${p.crm.leadId}/enrollment-form`);
      try { await navigator.clipboard.writeText(data.link); toast.success("Link da ficha de matrícula copiado. Envie ao candidato."); } catch (_) { toast.info(data.link); }
    } catch (err) {
      toastError(err);
    }
    setFormBusy(null);
  };
  const remove = async (p) => {
    const ok = await confirmDialog({
      title: "Apagar a proposta?",
      message: `A proposta #${p.id} de ${p.recipientName || "Sem nome"} será apagada.${p.status !== "draft" ? " O link que foi enviado deixa de abrir." : ""}${p.crm ? " O lead continua no CRM." : ""}`,
      confirmText: "Apagar",
      tone: "danger",
    });
    if (!ok) return;
    setDeleting(p.id);
    try {
      await api.delete(`/proposals/${p.id}`);
      setRows((list) => (list || []).filter((x) => x.id !== p.id));
      toast.success("Proposta apagada.");
    } catch (err) {
      toastError(err);
    }
    setDeleting(null);
  };

  const cpfBad = withContact && cpf && cpf.length !== 11;
  const phoneBad = withContact && phone && (phone.length < 10 || phone.length > 13);
  const start = () => setStudio({ name: name.trim(), ownerId: Number(owner) || null, ...(withContact ? { cpf, phone } : {}) });

  return (
    <>
      <Dialog open={open && !studio} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>Propostas avulsas</DialogTitle>
        <DialogContent style={{ display: "grid", gap: 14 }}>
          <Typography variant="body2" color="textSecondary">
            Para quem ainda não é lead. Ao gerar o link ou o PDF, a pessoa vai para o CRM na etapa Proposta, com o responsável escolhido abaixo. De lá sai a ficha de matrícula.
          </Typography>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <NameField id="standalone-name" size="small" variant="outlined" label="Nome de quem vai receber" value={name} onChange={setName} style={{ flex: "1 1 240px" }} inputProps={{ maxLength: 120 }} />
              <Button variant="contained" color="primary" disableElevation style={{ height: 40 }} disabled={!name.trim() || cpfBad || phoneBad} onClick={start}>Montar proposta</Button>
            </div>
            <FormControlLabel
              control={<Checkbox color="primary" size="small" checked={withContact} onChange={(e) => { const on = e.target.checked; setWithContact(on); }} />}
              label="Informar CPF e telefone (opcional)" />
            <TextField select size="small" variant="outlined" label="Responsável no CRM" value={owner} onChange={(e) => { const v = e.target.value; setOwnerId(v); }}
              helperText="Quem atende o lead. Escolha um colega se a proposta for para um lead dele." SelectProps={{ MenuProps: { disablePortal: false } }}>
              {team.map((u) => (<MenuItem key={u.id} value={u.id}>{u.id === (user && user.id) ? `${u.name} (você)` : u.name}</MenuItem>))}
            </TextField>
            {withContact && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <CpfField id="standalone-cpf" size="small" variant="outlined" label="CPF" value={cpf} onChange={setCpf} style={{ flex: "1 1 180px" }} />
                <PhoneField id="standalone-phone" size="small" variant="outlined" label="Telefone com DDD" value={phone} onChange={setPhone} style={{ flex: "1 1 180px" }} />
              </div>
            )}
          </div>
          <TextField size="small" variant="outlined" placeholder="Buscar por nome, CPF ou telefone" value={query}
            onChange={(e) => { const v = e.target.value; setQuery(v); }} inputProps={{ "aria-label": "Buscar propostas avulsas" }}
            InputProps={{ startAdornment: <Search size={16} style={{ marginRight: 8, opacity: 0.6, flex: "none" }} /> }} />
          {rows === null && !failed && <CircularProgress size={20} />}
          {failed && <div><Typography variant="body2" color="error">Não foi possível carregar as propostas avulsas.</Typography><Button size="small" onClick={() => load(query)}>Tentar de novo</Button></div>}
          {rows && rows.length === 0 && <Typography variant="body2" color="textSecondary">{query.trim() ? "Nenhuma proposta com esse nome, CPF ou telefone." : "Nenhuma proposta avulsa ainda."}</Typography>}
          {rows && rows.length > 0 && (
            <div style={{ display: "grid", gap: 6 }}>
              {rows.map((p) => (
                <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid rgba(128,128,128,.2)", paddingTop: 6 }}>
                  <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{p.recipientName || "Sem nome"}</div>
                    <div style={{ fontSize: 12.5, opacity: 0.75 }}>#{p.id} · {p.courseName} · {STATUS[p.status] || p.status}{p.viewedAt ? " · aberta" : ""}{p.author ? ` · ${p.author.name}` : ""}</div>
                    {p.crm && (
                      <div style={{ fontSize: 12.5, color: "#00a884", fontWeight: 600 }}>No CRM{p.crm.ownerName ? ` · com ${p.crm.ownerName}` : ""}</div>
                    )}
                    {(p.recipientCpfMasked || p.recipientPhone) && (
                      <div style={{ fontSize: 12.5, opacity: 0.75 }}>{[p.recipientCpfMasked ? `CPF ${p.recipientCpfMasked}` : "", phoneText(p.recipientPhone)].filter(Boolean).join(" · ")}</div>
                    )}
                  </div>
                  {p.status !== "draft" && <Button size="small" onClick={() => copy(p.link)}>Copiar link</Button>}
                  {p.crm && (p.crm.ownerId === (user && user.id) || isManager(user)) && (
                    <Button size="small" startIcon={formBusy === p.id ? <CircularProgress size={14} /> : <ClipboardList size={15} />} disabled={formBusy === p.id} onClick={() => enrollmentForm(p)}>Ficha de matrícula</Button>
                  )}
                  <Button size="small" variant="outlined" onClick={() => setStudio({ name: p.recipientName || "Candidato", id: p.id })}>Abrir</Button>
                  <Tooltip title="Apagar">
                    <span>
                      <IconButton size="small" aria-label={`Apagar a proposta de ${p.recipientName || "Sem nome"}`} disabled={deleting === p.id} onClick={() => remove(p)}>
                        {deleting === p.id ? <CircularProgress size={16} /> : <Trash2 size={17} />}
                      </IconButton>
                    </span>
                  </Tooltip>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
        <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
      </Dialog>
      {studio && (
        <Suspense fallback={null}>
          <ProposalStudio lead={{ id: null, name: studio.name, ...(studio.ownerId ? { ownerId: studio.ownerId } : {}), ...(studio.cpf !== undefined ? { cpf: studio.cpf, phone: studio.phone } : {}) }} proposalId={studio.id} ctx={ctx}
            onSaved={() => load(query)} onClose={() => { setStudio(null); setName(""); setCpf(""); setPhone(""); setWithContact(false); setOwnerId(""); load(query); }} />
        </Suspense>
      )}
    </>
  );
};

export default StandaloneProposals;
