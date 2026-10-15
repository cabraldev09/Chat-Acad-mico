import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { isManager } from "../../utils/access";
import { toast } from "react-toastify";
import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Paper, Switch, TextField, Typography,
} from "@material-ui/core";
import {
  BookOpen, Copy, Download, Eye, FileText, Image as ImageIcon, Layers, Link2, Megaphone, Paperclip, Pencil, Plus, Trash2, Type, Video, Users,
} from "lucide-react";

import GlowCard from "../../components/GlowCard";
import IconAction from "../../components/IconAction";
import ConfirmationModal from "../../components/ConfirmationModal";
import { AuthContext } from "../../context/Auth/AuthContext";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { AudiencePicker, ReleaseDialog } from "./Audience";
import { KINDS, KIND_LABEL, fetchAllUsers, saveBlob, useStyles } from "./shared";

// where the affiliates pick the materials up: every affiliate has a personal link to the Central (no login, no prices)
const CentralLink = ({ affiliates }) => {
  const [id, setId] = useState("");
  const list = affiliates.filter((a) => a.portalUrl);
  const chosen = list.find((a) => a.id === Number(id)) || (list.length === 1 ? list[0] : null);
  const copy = async (text, msg) => {
    try { await navigator.clipboard.writeText(text); toast.success(msg); } catch (e) { toast.error("Não foi possível copiar."); }
  };
  const send = async () => {
    try { await api.post(`/affiliates/${chosen.id}/send-portal`); toast.success("Link enviado pelo WhatsApp."); } catch (e) { toastError(e); }
  };
  return (
    <Paper variant="outlined" style={{ padding: 16, marginBottom: 16, borderRadius: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}><Link2 size={18} /> Central do Afiliado: onde eles pegam os materiais</div>
      <Typography variant="body2" color="textSecondary" style={{ marginTop: 4 }}>
        Cada afiliado tem um link só dele. Ele abre a Central sem precisar de login e mostra apenas o que foi liberado para ele: banners, textos, vídeos e informações dos cursos, sem preços.
      </Typography>
      {list.length === 0 && <Typography variant="body2" style={{ marginTop: 10 }}>Cadastre um afiliado na aba Afiliados para gerar o link dele.</Typography>}
      {list.length > 1 && (
        <TextField select size="small" variant="outlined" label="Afiliado" value={chosen ? chosen.id : ""} onChange={(e) => setId(e.target.value)} style={{ minWidth: 260, marginTop: 12 }}>
          {list.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
        </TextField>
      )}
      {chosen && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
          <code style={{ flex: 1, minWidth: 220, padding: "8px 12px", borderRadius: 10, background: "rgba(127,140,160,.14)", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={chosen.portalUrl}>{chosen.portalUrl}</code>
          <Button size="small" variant="outlined" startIcon={<Copy size={15} />} onClick={() => copy(chosen.portalUrl, "Link da Central copiado.")}>Copiar link</Button>
          <Button size="small" variant="outlined" startIcon={<Eye size={15} />} onClick={() => window.open(chosen.portalUrl, "_blank", "noopener")}>Abrir como o afiliado vê</Button>
          {chosen.phone && <Button size="small" variant="contained" color="primary" onClick={send}>Enviar pelo WhatsApp</Button>}
        </div>
      )}
    </Paper>
  );
};

const ICONS = { banner: ImageIcon, copy: Type, video: Video, course_info: BookOpen, course_list: Layers, campaign: Megaphone, other: Paperclip };

const COLLECTIONS = [["graduacao", "Graduação"], ["pos", "Pós-graduação"], ["tecnico", "Cursos técnicos"], ["programa", "Programa de afiliados"]];
const EMPTY = { title: "", kind: "banner", collection: "", description: "", copyText: "", externalUrl: "", courseId: "", campaignId: "", active: true, audience: "all", ownerIds: [], affiliateIds: [] };

const MaterialForm = ({ open, material, courses, campaigns, consultants, affiliates, isAdmin, onClose, onSaved }) => {
  const [f, setF] = useState(EMPTY);
  const [file, setFile] = useState(null);
  const [removeFile, setRemoveFile] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  useEffect(() => {
    if (!open) return;
    setFile(null);
    setRemoveFile(false);
    setF(material ? { ...EMPTY, ...Object.fromEntries(Object.entries(material).filter(([, v]) => v !== null)) } : EMPTY);
  }, [open, material]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = async () => {
    setBusy(true);
    try {
      const fd = new FormData();
      ["title", "kind", "collection", "description", "copyText", "externalUrl", "courseId", "campaignId", "audience"].forEach((k) => fd.append(k, f[k] ?? ""));
      fd.append("active", String(f.active));
      fd.append("ownerIds", JSON.stringify(f.ownerIds));
      fd.append("affiliateIds", JSON.stringify(f.affiliateIds));
      if (file) fd.append("file", file);
      if (removeFile) fd.append("removeFile", "true");
      if (material) await api.put(`/affiliate-materials/${material.id}`, fd);
      else await api.post("/affiliate-materials", fd);
      toast.success(material ? "Material atualizado." : "Material publicado.");
      onSaved();
    } catch (err) { toastError(err); } finally { setBusy(false); }
  };

  const hasFile = (material && material.hasFile && !removeFile) || file;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{material ? "Editar material" : "Novo material de apoio"}</DialogTitle>
      <DialogContent dividers>
        <TextField label="Título" value={f.title} onChange={set("title")} fullWidth required margin="dense" variant="outlined" autoFocus />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <TextField select label="Tipo" value={f.kind} onChange={set("kind")} margin="dense" variant="outlined">
            {KINDS.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
          </TextField>
          <TextField select label="Coleção na Central do Afiliado" value={f.collection || ""} onChange={set("collection")} margin="dense" variant="outlined">
            <MenuItem value="">Nenhuma (só na lista geral)</MenuItem>
            {COLLECTIONS.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
          </TextField>
          <TextField select label="Curso (opcional)" value={f.courseId || ""} onChange={set("courseId")} margin="dense" variant="outlined">
            <MenuItem value="">Nenhum</MenuItem>
            {courses.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}{c.modality ? ` · ${c.modality}` : ""}</MenuItem>)}
          </TextField>
        </div>
        <TextField label="Descrição" value={f.description || ""} onChange={set("description")} fullWidth multiline rows={2} margin="dense" variant="outlined" />
        <TextField label="Texto pronto para copiar" value={f.copyText || ""} onChange={set("copyText")} fullWidth multiline rows={4} margin="dense" variant="outlined"
          helperText="Sem valores: o sistema recusa R$, preços e descontos." />
        <TextField label="Link (vídeo ou página)" value={f.externalUrl || ""} onChange={set("externalUrl")} fullWidth margin="dense" variant="outlined" placeholder="https://youtube.com/..." helperText="YouTube abre dentro do portal" />
        <div style={{ margin: "8px 0", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <input ref={input} type="file" hidden onChange={(e) => { setFile(e.target.files[0] || null); setRemoveFile(false); }}
            accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.mp4,.webm,.mov,.docx,.xlsx,.pptx,.txt,.zip" />
          <Button variant="outlined" startIcon={<Paperclip size={15} />} onClick={() => input.current.click()}>{hasFile ? "Trocar arquivo" : "Anexar arquivo"}</Button>
          {file && <Typography variant="body2">{file.name}</Typography>}
          {!file && material && material.hasFile && !removeFile && (
            <>
              <Typography variant="body2">{material.originalName}</Typography>
              <Button size="small" onClick={() => setRemoveFile(true)}>Remover</Button>
            </>
          )}
          {removeFile && <Typography variant="body2" color="textSecondary">O arquivo será removido ao salvar.</Typography>}
          <Typography variant="caption" color="textSecondary" style={{ width: "100%" }}>Imagem, PDF, vídeo, Word, Excel, PowerPoint, texto ou ZIP, até 100 MB.</Typography>
        </div>
        {campaigns.length > 0 && (
          <TextField select label="Parte de uma campanha (opcional)" value={f.campaignId || ""} onChange={set("campaignId")} fullWidth margin="dense" variant="outlined"
            helperText="O material só aparece enquanto a campanha estiver valendo">
            <MenuItem value="">Nenhuma</MenuItem>
            {campaigns.map((c) => <MenuItem key={c.id} value={c.id}>{c.title}</MenuItem>)}
          </TextField>
        )}
        <AudiencePicker value={f} onChange={setF} consultants={consultants} affiliates={affiliates} limited={!isAdmin} />
        <FormControlLabel control={<Switch color="primary" checked={!!f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />} label={f.active ? "Publicado" : "Oculto (rascunho)"} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button color="primary" variant="contained" disabled={busy || f.title.trim().length < 2} onClick={save}>{material ? "Salvar" : "Publicar"}</Button>
      </DialogActions>
    </Dialog>
  );
};

const MaterialsTab = () => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);
  const isAdmin = isManager(user);
  const [rows, setRows] = useState([]);
  const [courses, setCourses] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [consultants, setConsultants] = useState([]);
  const [affiliates, setAffiliates] = useState([]);
  const [kind, setKind] = useState("");
  const [form, setForm] = useState(null);
  const [del, setDel] = useState(null);
  const [release, setRelease] = useState(null);

  const load = useCallback(() => {
    api.get("/affiliate-materials").then(({ data }) => setRows(data)).catch(toastError);
  }, []);
  useEffect(() => {
    load();
    api.get("/courses").then(({ data }) => setCourses(data.filter((c) => c.active))).catch(() => undefined);
    api.get("/affiliate-campaigns").then(({ data }) => setCampaigns(data)).catch(() => undefined);
    api.get("/affiliates").then(({ data }) => setAffiliates(data)).catch(() => undefined);
    if (isAdmin) fetchAllUsers().then((l) => setConsultants(l.filter((u) => u.role === "consultor" || u.role === "coordenacao"))).catch(() => undefined);
  }, [load, isAdmin]);

  const shown = rows.filter((m) => !kind || m.kind === kind);

  const open = async (m) => {
    try {
      const r = await api.get(`/affiliate-materials/${m.id}/file`, { responseType: "blob" });
      saveBlob(r.data, m.originalName || m.title);
    } catch (err) { toastError(err); }
  };

  return (
    <div className={classes.page}>
      <CentralLink affiliates={affiliates} />
      <div className={classes.toolbar}>
        <TextField select size="small" variant="outlined" value={kind} onChange={(e) => setKind(e.target.value)} style={{ minWidth: 200 }} label="Tipo">
          <MenuItem value="">Todos os tipos</MenuItem>
          {KINDS.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
        </TextField>
        <span className={classes.grow} />
        <Button variant="contained" color="primary" startIcon={<Plus size={16} />} onClick={() => setForm({})}>Novo material</Button>
      </div>

      <div className={classes.body}>
        {shown.length === 0 && (
          <Paper variant="outlined" className={classes.empty}>
            <FileText size={36} style={{ opacity: 0.6 }} />
            <Typography variant="subtitle1" style={{ fontWeight: 600 }}>Nenhum material {kind ? "desse tipo" : "ainda"}</Typography>
            <Typography variant="body2">{isAdmin ? "Publique banners, textos prontos, vídeos e informações dos cursos. Eles aparecem no portal dos afiliados." : "Publique banners, textos e vídeos para os seus afiliados. Material que o administrador liberar para você também aparece aqui."}</Typography>
          </Paper>
        )}
        <div className={classes.cards}>
          {shown.map((m, i) => {
            const Icon = ICONS[m.kind] || Paperclip;
            return (
              <GlowCard key={m.id} className={classes.card} style={{ animationDelay: `${Math.min(i, 10) * 35}ms`, opacity: m.active ? 1 : 0.6 }}>
                <div className={classes.cardTop}>
                  <span className={classes.kindIcon}><Icon size={20} /></span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className={classes.name}>{m.title}</div>
                    <div className={classes.sub}>{KIND_LABEL[m.kind]}{m.course ? ` · ${m.course.name}` : ""}</div>
                  </div>
                </div>
                {m.description && <Typography variant="body2" color="textSecondary" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{m.description}</Typography>}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span className={classes.chip} style={{ background: m.audience === "all" ? "rgba(22,163,74,.14)" : "rgba(245,158,11,.16)", color: m.audience === "all" ? "#15803d" : "#b45309" }}>
                    <Users size={12} /> {m.audience === "all" ? "Todos" : `Restrito (${(m.ownerIds || []).length + (m.affiliateIds || []).length})`}
                  </span>
                  {!m.active && <span className={classes.chip} style={{ background: "rgba(100,116,139,.18)" }}>Oculto</span>}
                  {m.collection && <span className={classes.chip} style={{ background: "rgba(11,66,121,.12)" }}>{(COLLECTIONS.find((c) => c[0] === m.collection) || [])[1]}</span>}
                  {m.copies > 0 && <span className={classes.chip} style={{ background: "rgba(6,147,227,.12)" }} title="Vezes que a mensagem foi copiada"><Copy size={12} /> {m.copies}</span>}
                  {m.downloads > 0 && <span className={classes.chip} style={{ background: "rgba(6,147,227,.12)" }}><Download size={12} /> {m.downloads}</span>}
                  {m.externalUrl && <span className={classes.chip} style={{ background: "rgba(6,147,227,.12)" }}><Link2 size={12} /> link</span>}
                </div>
                <div className={classes.actions} style={{ marginLeft: 0, justifyContent: "flex-end" }}>
                  {m.hasFile && <IconAction title="Baixar o arquivo" onClick={() => open(m)}><Eye size={16} /></IconAction>}
                  {!isAdmin && m.createdBy !== user.id && <Button size="small" variant="outlined" onClick={() => setRelease(m)}>Liberar aos meus afiliados</Button>}
                  {(isAdmin || m.createdBy === user.id) && <IconAction title="Editar" onClick={() => setForm(m)}><Pencil size={16} /></IconAction>}
                  {(isAdmin || m.createdBy === user.id) && <IconAction title="Excluir" onClick={() => setDel(m)}><Trash2 size={16} /></IconAction>}
                </div>
              </GlowCard>
            );
          })}
        </div>
      </div>

      <MaterialForm open={!!form} material={form && form.id ? form : null} courses={courses} campaigns={campaigns} consultants={consultants} affiliates={affiliates} isAdmin={isAdmin}
        onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); }} />
      {release && <ReleaseDialog open kind="material" item={release} onClose={() => setRelease(null)} onDone={() => { setRelease(null); load(); }} />}
      <ConfirmationModal open={!!del} onClose={() => setDel(null)} title="Excluir material?"
        onConfirm={async () => { try { await api.delete(`/affiliate-materials/${del.id}`); toast.success("Material excluído."); load(); } catch (err) { toastError(err); } }}>
        “{del && del.title}” sai do portal de todos os afiliados e o arquivo é apagado.
      </ConfirmationModal>
    </div>
  );
};

export default MaterialsTab;
