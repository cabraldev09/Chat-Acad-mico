import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { isManager } from "../../utils/access";
import { toast } from "react-toastify";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Paper, Switch, TextField, Typography } from "@material-ui/core";
import { CalendarDays, Gift, ImagePlus, Megaphone, Pencil, Plus, Trash2, Users } from "lucide-react";

import GlowCard from "../../components/GlowCard";
import IconAction from "../../components/IconAction";
import ConfirmationModal from "../../components/ConfirmationModal";
import { AuthContext } from "../../context/Auth/AuthContext";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { AudiencePicker, ReleaseDialog } from "./Audience";
import { brl, day, fetchAllUsers, useStyles } from "./shared";

const EMPTY = { title: "", description: "", startsAt: "", endsAt: "", bonusValue: "", active: true, audience: "all", ownerIds: [], affiliateIds: [] };
const dateInput = (v) => { const d = v ? new Date(v) : null; return d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : ""; };

const CampaignForm = ({ open, campaign, consultants, affiliates, isAdmin, onClose, onSaved }) => {
  const [f, setF] = useState(EMPTY);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  useEffect(() => {
    if (!open) return;
    setFile(null);
    setF(campaign ? { ...EMPTY, ...Object.fromEntries(Object.entries(campaign).filter(([, v]) => v !== null)), startsAt: dateInput(campaign.startsAt), endsAt: dateInput(campaign.endsAt) } : EMPTY);
  }, [open, campaign]);
  const set = (k) => (e) => { e && e.persist && e.persist(); return (setF((x) => ({ ...x, [k]: e.target.value }))); };

  const save = async () => {
    setBusy(true);
    try {
      const fd = new FormData();
      ["title", "description", "bonusValue", "audience"].forEach((k) => fd.append(k, f[k] ?? ""));
      // end of day in local time, so “até 30/11” includes the 30th
      fd.append("startsAt", f.startsAt ? new Date(`${f.startsAt}T00:00:00`).toISOString() : "");
      fd.append("endsAt", f.endsAt ? new Date(`${f.endsAt}T23:59:59`).toISOString() : "");
      fd.append("active", String(f.active));
      fd.append("ownerIds", JSON.stringify(f.ownerIds));
      fd.append("affiliateIds", JSON.stringify(f.affiliateIds));
      if (file) fd.append("file", file);
      if (campaign) await api.put(`/affiliate-campaigns/${campaign.id}`, fd);
      else await api.post("/affiliate-campaigns", fd);
      toast.success(campaign ? "Campanha atualizada." : "Campanha publicada.");
      onSaved();
    } catch (err) { toastError(err); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{campaign ? "Editar campanha" : "Nova campanha"}</DialogTitle>
      <DialogContent dividers>
        <TextField label="Título" value={f.title} onChange={set("title")} fullWidth required margin="dense" variant="outlined" autoFocus />
        <TextField label="O que o afiliado precisa saber" value={f.description || ""} onChange={set("description")} fullWidth multiline rows={4} margin="dense" variant="outlined"
          helperText="Regras, prazos, o que divulgar. Não coloque o valor das mensalidades." />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <TextField label="Começa em" type="date" value={f.startsAt} onChange={set("startsAt")} margin="dense" variant="outlined" InputLabelProps={{ shrink: true }} />
          <TextField label="Termina em" type="date" value={f.endsAt} onChange={set("endsAt")} margin="dense" variant="outlined" InputLabelProps={{ shrink: true }} />
        </div>
        {isAdmin && (
          <TextField label="Bonificação por matrícula nesta campanha (R$)" type="number" value={f.bonusValue ?? ""} onChange={set("bonusValue")} fullWidth margin="dense" variant="outlined"
            helperText="Opcional. Enquanto a campanha valer, substitui o valor padrão para quem a vê." />
        )}
        <div style={{ margin: "8px 0", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input ref={input} type="file" hidden accept=".png,.jpg,.jpeg,.webp,.gif" onChange={(e) => setFile(e.target.files[0] || null)} />
          <Button variant="outlined" startIcon={<ImagePlus size={15} />} onClick={() => input.current.click()}>{campaign && campaign.hasCover ? "Trocar imagem de capa" : "Imagem de capa"}</Button>
          {file && <Typography variant="body2">{file.name}</Typography>}
        </div>
        <AudiencePicker value={f} onChange={setF} consultants={consultants} affiliates={affiliates} limited={!isAdmin} />
        <FormControlLabel control={<Switch color="primary" checked={!!f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />} label={f.active ? "Publicada" : "Oculta"} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button color="primary" variant="contained" disabled={busy || f.title.trim().length < 2} onClick={save}>{campaign ? "Salvar" : "Publicar"}</Button>
      </DialogActions>
    </Dialog>
  );
};

const state = (c) => {
  const now = Date.now();
  if (!c.active) return ["Oculta", "rgba(100,116,139,.18)", "inherit"];
  if (c.startsAt && new Date(c.startsAt).getTime() > now) return ["Agendada", "rgba(6,147,227,.16)", "#0b4279"];
  if (c.endsAt && new Date(c.endsAt).getTime() < now) return ["Encerrada", "rgba(220,38,38,.12)", "#b91c1c"];
  return ["No ar", "rgba(22,163,74,.16)", "#15803d"];
};

const CampaignsTab = () => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);
  const isAdmin = isManager(user);
  const [rows, setRows] = useState([]);
  const [consultants, setConsultants] = useState([]);
  const [affiliates, setAffiliates] = useState([]);
  const [form, setForm] = useState(null);
  const [del, setDel] = useState(null);
  const [release, setRelease] = useState(null);

  const load = useCallback(() => { api.get("/affiliate-campaigns").then(({ data }) => setRows(Array.isArray(data) ? data : [])).catch(toastError); }, []);
  useEffect(() => {
    load();
    api.get("/affiliates").then(({ data }) => setAffiliates(Array.isArray(data) ? data : [])).catch(() => undefined);
    if (isAdmin) fetchAllUsers().then((l) => setConsultants(l.filter((u) => u.role === "consultor" || u.role === "coordenacao"))).catch(() => undefined);
  }, [load, isAdmin]);

  return (
    <div className={classes.page}>
      <div className={classes.toolbar}>
        <Typography variant="body2" color="textSecondary" className={classes.grow}>
          Campanhas que a instituição faz (ou que o administrador libera) aparecem no portal dos afiliados enquanto estiverem valendo.
        </Typography>
        <Button variant="contained" color="primary" startIcon={<Plus size={16} />} onClick={() => setForm({})}>Nova campanha</Button>
      </div>
      <div className={classes.body}>
        {rows.length === 0 && (
          <Paper variant="outlined" className={classes.empty}>
            <Megaphone size={36} style={{ opacity: 0.6 }} />
            <Typography variant="subtitle1" style={{ fontWeight: 600 }}>Nenhuma campanha</Typography>
            <Typography variant="body2">{isAdmin ? "Crie uma campanha com datas, regras e, se quiser, uma bonificação maior por matrícula." : "Crie campanhas para os seus afiliados, com datas e regras. As que o administrador liberar para você também aparecem aqui."}</Typography>
          </Paper>
        )}
        <div className={classes.cards}>
          {rows.map((c, i) => {
            const [label, bg, color] = state(c);
            return (
              <GlowCard key={c.id} className={classes.card} style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}>
                <div className={classes.cardTop}>
                  <span className={classes.kindIcon}><Megaphone size={20} /></span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className={classes.name}>{c.title}</div>
                    <div className={classes.sub}><CalendarDays size={12} style={{ verticalAlign: -1 }} /> {c.startsAt ? day(c.startsAt) : "já"} até {c.endsAt ? day(c.endsAt) : "sem data final"}</div>
                  </div>
                  <span className={classes.chip} style={{ background: bg, color }}>{label}</span>
                </div>
                {c.description && <Typography variant="body2" color="textSecondary" style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{c.description}</Typography>}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {c.bonusValue ? <span className={classes.chip} style={{ background: "#FEF84C", color: "#3a3300" }}><Gift size={12} /> {brl(c.bonusValue)} por matrícula</span> : null}
                  <span className={classes.chip} style={{ background: c.audience === "all" ? "rgba(22,163,74,.14)" : "rgba(245,158,11,.16)", color: c.audience === "all" ? "#15803d" : "#b45309" }}>
                    <Users size={12} /> {c.audience === "all" ? "Todos" : `Restrita (${(c.ownerIds || []).length + (c.affiliateIds || []).length})`}
                  </span>
                </div>
                <div className={classes.actions} style={{ marginLeft: 0, justifyContent: "flex-end" }}>
                  {!isAdmin && c.createdBy !== user.id && <Button size="small" variant="outlined" onClick={() => setRelease(c)}>Liberar aos meus afiliados</Button>}
                  {(isAdmin || c.createdBy === user.id) && <IconAction title="Editar" onClick={() => setForm(c)}><Pencil size={16} /></IconAction>}
                  {(isAdmin || c.createdBy === user.id) && <IconAction title="Excluir" onClick={() => setDel(c)}><Trash2 size={16} /></IconAction>}
                </div>
              </GlowCard>
            );
          })}
        </div>
      </div>
      <CampaignForm open={!!form} campaign={form && form.id ? form : null} consultants={consultants} affiliates={affiliates} isAdmin={isAdmin}
        onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); }} />
      {release && <ReleaseDialog open kind="campaign" item={release} onClose={() => setRelease(null)} onDone={() => { setRelease(null); load(); }} />}
      <ConfirmationModal open={!!del} onClose={() => setDel(null)} title="Excluir campanha?"
        onConfirm={async () => { try { await api.delete(`/affiliate-campaigns/${del.id}`); toast.success("Campanha excluída."); load(); } catch (err) { toastError(err); } }}>
        “{del && del.title}” sai do portal. Os materiais ligados a ela continuam, sem campanha.
      </ConfirmationModal>
    </div>
  );
};

export default CampaignsTab;
