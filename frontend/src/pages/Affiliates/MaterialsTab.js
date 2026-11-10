import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { isManager } from "../../utils/access";
import { toast } from "react-toastify";
import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Paper, Switch, TextField, Typography,
} from "@material-ui/core";
import {
  BookOpen, Copy, Download, Eye, FileText, Image as ImageIcon, Layers, Link2, Megaphone, Paperclip, Pencil, Play, Plus, Trash2, Type, Video, Users,
} from "lucide-react";

import GlowCard from "../../components/GlowCard";
import IconAction from "../../components/IconAction";
import ConfirmationModal from "../../components/ConfirmationModal";
import { AuthContext } from "../../context/Auth/AuthContext";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { AudiencePicker, ReleaseDialog } from "./Audience";
import { KINDS, KIND_LABEL, fetchAllUsers, saveBlob, useStyles } from "./shared";

const sizeOf = (bytes) => (bytes ? (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`) : "");
const hostOf = (url) => { try { return new URL(url).host; } catch (e) { return String(url || ""); } };
const isImage = (m) => m.hasFile && /^image\//.test(m.mimeType || "");
const isVideo = (m) => m.hasFile && /^video\//.test(m.mimeType || "");
const isPdf = (m) => m.hasFile && /pdf/.test(m.mimeType || "");

// loads the file of a material (with the login of the team) as an address the page can show; only when `want` is true
const useFileUrl = (m, want) => {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!want || !m.hasFile) return undefined;
    let off = false;
    let made = "";
    api.get(`/affiliate-materials/${m.id}/file`, { responseType: "blob" })
      .then((r) => { if (off) return; made = URL.createObjectURL(r.data); setUrl(made); })
      .catch(() => undefined);
    return () => { off = true; if (made) URL.revokeObjectURL(made); };
  }, [m.id, m.hasFile, want]);
  return url;
};

// the picture of the card: what the material is, before opening it. Images load when they come near the screen.
const Thumb = ({ m, onOpen, Icon }) => {
  const ref = useRef(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (!isImage(m)) return undefined;
    if (typeof IntersectionObserver === "undefined") { setNear(true); return undefined; }
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: "200px" });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, [m]);
  const url = useFileUrl(m, near && isImage(m));
  const base = { height: 150, borderRadius: 12, overflow: "hidden", position: "relative", cursor: "pointer", display: "grid", placeItems: "center", border: "1px solid rgba(128,128,128,.2)" };
  let body;
  if (isImage(m)) {
    body = url
      ? <img src={url} alt={m.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      : <ImageIcon size={30} style={{ opacity: 0.4 }} />;
  } else if (isVideo(m)) {
    body = (
      <div style={{ ...base, border: 0, width: "100%", background: "linear-gradient(135deg,#0b4279,#0693e3)", color: "#fff" }}>
        <span style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(255,255,255,.22)", display: "grid", placeItems: "center" }}><Play size={24} fill="#fff" /></span>
        <span style={{ position: "absolute", left: 10, bottom: 8, fontSize: 12, fontWeight: 600, opacity: 0.9 }}>Vídeo · {sizeOf(m.fileSize)}</span>
      </div>
    );
  } else if (isPdf(m)) {
    body = (
      <div style={{ textAlign: "center", color: "#b91c1c" }}>
        <FileText size={38} />
        <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 4 }}>PDF · {sizeOf(m.fileSize)}</div>
      </div>
    );
  } else if (m.copyText) {
    body = (
      <div style={{ padding: 14, fontSize: 13, lineHeight: 1.45, width: "100%", height: "100%", overflow: "hidden", textAlign: "left", background: "rgba(6,147,227,.07)", position: "relative" }}>
        <Type size={14} style={{ opacity: 0.5, marginBottom: 4 }} />
        <div style={{ display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{m.copyText}</div>
      </div>
    );
  } else if (m.externalUrl) {
    body = (
      <div style={{ textAlign: "center", padding: 10 }}>
        <Link2 size={30} style={{ opacity: 0.7 }} />
        <div style={{ fontSize: 12.5, marginTop: 6, fontWeight: 600, wordBreak: "break-all" }}>{hostOf(m.externalUrl)}</div>
      </div>
    );
  } else if (m.hasFile) {
    body = (
      <div style={{ textAlign: "center" }}>
        <Paperclip size={32} style={{ opacity: 0.6 }} />
        <div style={{ fontSize: 12.5, marginTop: 4, opacity: 0.8 }}>{m.originalName || "Arquivo"} · {sizeOf(m.fileSize)}</div>
      </div>
    );
  } else {
    body = <Icon size={34} style={{ opacity: 0.45 }} />;
  }
  return (
    <div ref={ref} role="button" tabIndex={0} aria-label={`Ver a prévia de ${m.title}`} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      style={isVideo(m) ? { cursor: "pointer", borderRadius: 12, overflow: "hidden" } : base}>
      {body}
    </div>
  );
};

// the preview in full size: the image, the video, the PDF or the text, with a button to download
const PreviewDialog = ({ m, onClose, onDownload }) => {
  const url = useFileUrl(m, !!m);
  if (!m) return null;
  let content;
  if (isImage(m)) content = url ? <img src={url} alt={m.title} style={{ maxWidth: "100%", maxHeight: "70vh", display: "block", margin: "0 auto", borderRadius: 8 }} /> : <Typography>Carregando...</Typography>;
  else if (isVideo(m)) content = url ? <video src={url} controls style={{ maxWidth: "100%", maxHeight: "70vh", display: "block", margin: "0 auto", borderRadius: 8 }} /> : <Typography>Carregando...</Typography>;
  else if (isPdf(m)) content = url ? <iframe title={m.title} src={url} style={{ width: "100%", height: "70vh", border: 0, borderRadius: 8 }} /> : <Typography>Carregando...</Typography>;
  else if (m.copyText) content = <Typography style={{ whiteSpace: "pre-wrap" }}>{m.copyText}</Typography>;
  else if (m.externalUrl) content = <Typography>Link: <a href={m.externalUrl} target="_blank" rel="noopener noreferrer">{m.externalUrl}</a></Typography>;
  else content = <Typography color="textSecondary">{m.description || "Este material não tem prévia."}</Typography>;
  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{m.title}</DialogTitle>
      <DialogContent dividers>
        {m.description && (isImage(m) || isVideo(m) || isPdf(m)) && <Typography variant="body2" color="textSecondary" gutterBottom>{m.description}</Typography>}
        {content}
      </DialogContent>
      <DialogActions>
        {m.hasFile && <Button startIcon={<Download size={16} />} onClick={() => onDownload(m)}>Baixar o arquivo</Button>}
        <Button variant="contained" color="primary" onClick={onClose}>Fechar</Button>
      </DialogActions>
    </Dialog>
  );
};

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
  const set = (k) => (e) => { e && e.persist && e.persist(); return (setF((x) => ({ ...x, [k]: e.target.value }))); };

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
    api.get("/affiliate-materials").then(({ data }) => setRows(Array.isArray(data) ? data : [])).catch(toastError);
  }, []);
  useEffect(() => {
    load();
    api.get("/courses").then(({ data }) => setCourses(data.filter((c) => c.active))).catch(() => undefined);
    api.get("/affiliate-campaigns").then(({ data }) => setCampaigns(data)).catch(() => undefined);
    api.get("/affiliates").then(({ data }) => setAffiliates(data)).catch(() => undefined);
    if (isAdmin) fetchAllUsers().then((l) => setConsultants(l.filter((u) => u.role === "consultor" || u.role === "coordenacao"))).catch(() => undefined);
  }, [load, isAdmin]);

  const shown = rows.filter((m) => !kind || m.kind === kind);

  const [preview, setPreview] = useState(null);
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
                <Thumb m={m} Icon={Icon} onOpen={() => setPreview(m)} />
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
                  <IconAction title="Ver a prévia" onClick={() => setPreview(m)}><Eye size={16} /></IconAction>
                  {m.hasFile && <IconAction title="Baixar o arquivo" onClick={() => open(m)}><Download size={16} /></IconAction>}
                  {!isAdmin && m.createdBy !== user.id && <Button size="small" variant="outlined" onClick={() => setRelease(m)}>Liberar aos meus afiliados</Button>}
                  {(isAdmin || m.createdBy === user.id) && <IconAction title="Editar" onClick={() => setForm(m)}><Pencil size={16} /></IconAction>}
                  {(isAdmin || m.createdBy === user.id) && <IconAction title="Excluir" onClick={() => setDel(m)}><Trash2 size={16} /></IconAction>}
                </div>
              </GlowCard>
            );
          })}
        </div>
      </div>

      {preview && <PreviewDialog m={preview} onClose={() => setPreview(null)} onDownload={open} />}
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
