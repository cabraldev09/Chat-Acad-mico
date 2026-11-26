import React, { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from "@material-ui/core";
import { toast } from "react-toastify";

import api from "../../services/api";
import toastError from "../../errors/toastError";

const ProposalStudio = lazy(() => import("./ProposalStudio"));

const STATUS = { draft: "Rascunho", sent: "Gerada" };

// Propostas avulsas: a proposal for someone who is not a lead of yours (a colleague sends it to a lead of theirs, or a simulation).
// It needs only the name of the person; the result is a link (and the PDF) to send by any channel. Each person sees their own.
const StandaloneProposals = ({ open, onClose, ctx }) => {
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);
  const [name, setName] = useState("");
  const [studio, setStudio] = useState(null); // { name, id? }

  const load = useCallback(() => {
    setFailed(false);
    api.get("/proposals", { params: { standalone: 1 } }).then(({ data }) => setRows(data)).catch((e) => { setFailed(true); toastError(e); });
  }, []);
  useEffect(() => { if (open) load(); }, [open, load]);

  const copy = async (link) => {
    try { await navigator.clipboard.writeText(link); toast.success("Link copiado."); } catch (_) { toast.info(link); }
  };

  return (
    <>
      <Dialog open={open && !studio} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>Propostas avulsas</DialogTitle>
        <DialogContent style={{ display: "grid", gap: 14 }}>
          <Typography variant="body2" color="textSecondary">
            Para quem não é lead seu: um colega envia ao lead dele, ou uma simulação. Não muda nada no CRM. No fim, copie o link ou baixe o PDF.
          </Typography>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <TextField size="small" variant="outlined" label="Nome de quem vai receber" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: "1 1 240px" }} inputProps={{ maxLength: 120 }} />
            <Button variant="contained" color="primary" disableElevation style={{ height: 40 }} disabled={!name.trim()} onClick={() => setStudio({ name: name.trim() })}>Montar proposta</Button>
          </div>
          {rows === null && !failed && <CircularProgress size={20} />}
          {failed && <div><Typography variant="body2" color="error">Não foi possível carregar as propostas avulsas.</Typography><Button size="small" onClick={load}>Tentar de novo</Button></div>}
          {rows && rows.length === 0 && <Typography variant="body2" color="textSecondary">Nenhuma proposta avulsa ainda.</Typography>}
          {rows && rows.length > 0 && (
            <div style={{ display: "grid", gap: 6 }}>
              {rows.map((p) => (
                <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid rgba(128,128,128,.2)", paddingTop: 6 }}>
                  <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{p.recipientName || "Sem nome"}</div>
                    <div style={{ fontSize: 12.5, opacity: 0.75 }}>#{p.id} · {p.courseName} · {STATUS[p.status] || p.status}{p.viewedAt ? " · aberta" : ""}{p.author ? ` · ${p.author.name}` : ""}</div>
                  </div>
                  {p.status !== "draft" && <Button size="small" onClick={() => copy(p.link)}>Copiar link</Button>}
                  <Button size="small" variant="outlined" onClick={() => setStudio({ name: p.recipientName || "Candidato", id: p.id })}>Abrir</Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
        <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
      </Dialog>
      {studio && (
        <Suspense fallback={null}>
          <ProposalStudio lead={{ id: null, name: studio.name }} proposalId={studio.id} ctx={ctx}
            onSaved={load} onClose={() => { setStudio(null); setName(""); load(); }} />
        </Suspense>
      )}
    </>
  );
};

export default StandaloneProposals;
