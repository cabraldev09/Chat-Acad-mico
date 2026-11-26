import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, TextField, Tooltip, Typography } from "@material-ui/core";
import { Search, Trash2 } from "lucide-react";
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

// Propostas avulsas: a proposal for someone who is not a lead of yours (a colleague sends it to a lead of theirs, or a simulation).
// It needs only the name of the person; the CPF and the phone are optional (they help find it again and say who to contact). Each
// person sees their own; they can be looked up again by name or CPF, and deleted.
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
  const remove = async (p) => {
    const ok = await confirmDialog({
      title: "Apagar a proposta?",
      message: `A proposta #${p.id} de ${p.recipientName || "Sem nome"} será apagada.${p.status !== "draft" ? " O link que foi enviado deixa de abrir." : ""}`,
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
  const start = () => setStudio({ name: name.trim(), ...(withContact ? { cpf, phone } : {}) });

  return (
    <>
      <Dialog open={open && !studio} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>Propostas avulsas</DialogTitle>
        <DialogContent style={{ display: "grid", gap: 14 }}>
          <Typography variant="body2" color="textSecondary">
            Para quem não é lead seu: um colega envia ao lead dele, ou uma simulação. Não muda nada no CRM. No fim, copie o link ou baixe o PDF.
          </Typography>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <NameField id="standalone-name" size="small" variant="outlined" label="Nome de quem vai receber" value={name} onChange={setName} style={{ flex: "1 1 240px" }} inputProps={{ maxLength: 120 }} />
              <Button variant="contained" color="primary" disableElevation style={{ height: 40 }} disabled={!name.trim() || cpfBad || phoneBad} onClick={start}>Montar proposta</Button>
            </div>
            <FormControlLabel
              control={<Checkbox color="primary" size="small" checked={withContact} onChange={(e) => { const on = e.target.checked; setWithContact(on); }} />}
              label="Informar CPF e telefone (opcional)" />
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
                    {(p.recipientCpfMasked || p.recipientPhone) && (
                      <div style={{ fontSize: 12.5, opacity: 0.75 }}>{[p.recipientCpfMasked ? `CPF ${p.recipientCpfMasked}` : "", phoneText(p.recipientPhone)].filter(Boolean).join(" · ")}</div>
                    )}
                  </div>
                  {p.status !== "draft" && <Button size="small" onClick={() => copy(p.link)}>Copiar link</Button>}
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
          <ProposalStudio lead={{ id: null, name: studio.name, ...(studio.cpf !== undefined ? { cpf: studio.cpf, phone: studio.phone } : {}) }} proposalId={studio.id} ctx={ctx}
            onSaved={() => load(query)} onClose={() => { setStudio(null); setName(""); setCpf(""); setPhone(""); setWithContact(false); load(query); }} />
        </Suspense>
      )}
    </>
  );
};

export default StandaloneProposals;
