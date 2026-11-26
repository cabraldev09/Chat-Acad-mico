import React, { useCallback, useEffect, useRef, useState } from "react";
import { noticeDialog } from "../../components/ConfirmDialog";
import { useParams } from "react-router-dom";
import axios from "axios";
import { makeStyles } from "@material-ui/core/styles";
import { Camera, Check, CheckCircle2, FileText, Image as ImageIcon, Lock, ShieldCheck, Trash2, AlertCircle, Loader2 } from "lucide-react";

import { getBackendUrl } from "../../config";
import { i18n } from "../../translate/i18n";

// THE ENROLLMENT FORM OF THE LEAD (its personal link, /ficha/<code>). Made for the phone: one column, big fields, the picture of the ID by the
// camera or the gallery, every change kept at once (the person can stop and come back), the progress always in sight and nothing sent
// without the agreement with the use of the data (LGPD). The pictures go up and are never shown back by this page.

const api = axios.create({ baseURL: getBackendUrl() });
const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
const BLUE = "#0B4279";

const onlyDigits = (v) => String(v || "").replace(/\D/g, "");
const MASKS = {
  cpf: (v) => onlyDigits(v).slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4"),
  cep: (v) => onlyDigits(v).slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2"),
  celular: (v) => {
    let d = onlyDigits(v);
    if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
    d = d.slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  },
};
const shown = (key, value) => (MASKS[key] ? MASKS[key](value) : value || "");
// what goes to the server: the masked fields as digits (the phone with the country code)
const kept = (key, value) => {
  if (key === "celular") { const d = onlyDigits(value); return d.length >= 10 && d.length <= 11 ? `55${d}` : d; }
  return MASKS[key] ? onlyDigits(value) : value;
};

const errorText = (err) => {
  const code = err && err.response && err.response.data && err.response.data.error;
  if (code && i18n.exists(`backendErrors.${code}`)) return i18n.t(`backendErrors.${code}`);
  if (err && !err.response) return "Sem conexão com a internet. O que você preencheu fica salvo assim que a conexão voltar.";
  return "Não foi possível salvar agora. Tente de novo em instantes.";
};

// a picture of the phone is made smaller before going up (fast on a weak connection, sharp enough to read)
const shrink = (file) =>
  new Promise((resolve) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1.2 * 1024 * 1024) return resolve(file);
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      const scale = Math.min(1, 2200 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => resolve(blob && blob.size < file.size ? new File([blob], "documento.jpg", { type: "image/jpeg" }) : file), "image/jpeg", 0.86);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });

const useStyles = makeStyles(() => ({
  page: { minHeight: "100vh", background: "#F3F6FA", color: "#0F172A", fontFamily: "inherit", paddingBottom: 120 },
  // the blue of the brand with a soft light in the corner (a static radial glow, no animation)
  top: {
    position: "relative", overflow: "hidden", color: "#fff", padding: "18px 16px 72px",
    background: `radial-gradient(120% 90% at 100% 0%, rgba(56,189,248,.28) 0%, rgba(56,189,248,0) 55%), radial-gradient(80% 60% at 0% 100%, rgba(255,255,255,.08) 0%, rgba(255,255,255,0) 60%), linear-gradient(135deg, ${BLUE} 0%, #0a5ba8 100%)`,
  },
  topIn: { position: "relative", maxWidth: 640, margin: "0 auto" },
  // the brand bar: the logo straight on the blue, in white (any logo the institution sends turns white), and the name of the page
  brandBar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingBottom: 16, marginBottom: 22, borderBottom: "1px solid rgba(255,255,255,.16)" },
  brandImg: { height: 30, width: "auto", maxWidth: "min(58vw, 220px)", display: "block", objectFit: "contain", filter: "brightness(0) invert(1)", "@media (min-width: 600px)": { height: 34 } },
  pill: { flex: "none", fontSize: 12.5, fontWeight: 600, padding: "6px 12px", borderRadius: 999, background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.22)", whiteSpace: "nowrap" },
  h1: { margin: "6px 0 6px", fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.15 },
  lead: { margin: 0, fontSize: 15, lineHeight: 1.5, opacity: 0.92 },
  wrap: { maxWidth: 640, margin: "-52px auto 0", padding: "0 16px" },
  progressCard: { position: "sticky", top: 8, zIndex: 5, background: "#fff", borderRadius: 16, padding: "14px 16px", boxShadow: "0 8px 24px rgba(15,23,42,.10)", border: "1px solid #E2E8F0", marginBottom: 14 },
  progressTop: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  pct: { fontSize: 22, fontWeight: 800, color: BLUE, fontVariantNumeric: "tabular-nums" },
  saved: { fontSize: 12.5, color: "#475569", display: "inline-flex", alignItems: "center", gap: 6 },
  bar: { height: 8, borderRadius: 999, background: "#E2E8F0", marginTop: 8, overflow: "hidden" },
  barIn: { height: "100%", borderRadius: 999, background: "linear-gradient(90deg, #0a5ba8, #16a34a)", transition: "width .35s ease" },
  missing: { marginTop: 8, fontSize: 13, color: "#475569", lineHeight: 1.5 },
  card: { background: "#fff", borderRadius: 16, border: "1px solid #E2E8F0", padding: "18px 16px", marginBottom: 14 },
  cardHead: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 },
  step: { width: 28, height: 28, flex: "none", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 800, background: "#E0ECFA", color: BLUE },
  stepDone: { background: "#DCFCE7", color: "#15803D" },
  cardTitle: { margin: 0, fontSize: 17, fontWeight: 700 },
  cardSub: { margin: "2px 0 0", fontSize: 13, color: "#475569" },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, "@media (max-width: 480px)": { gridTemplateColumns: "1fr" } },
  full: { gridColumn: "1 / -1" },
  label: { display: "block", fontSize: 13.5, fontWeight: 600, color: "#1E293B", marginBottom: 6 },
  opt: { fontWeight: 400, color: "#64748B" },
  input: {
    width: "100%", boxSizing: "border-box", height: 48, padding: "0 14px", borderRadius: 12, border: "1px solid #CBD5E1", background: "#fff", color: "#0F172A",
    fontFamily: "inherit", fontSize: 16, outline: "none", transition: "border-color .15s, box-shadow .15s",
    "&:disabled": { background: "#F1F5F9", color: "#475569" },
  },
  inputBad: { borderColor: "#DC2626", "&:focus": { borderColor: "#DC2626" } },
  problem: { display: "flex", gap: 6, alignItems: "flex-start", marginTop: 6, fontSize: 12.5, color: "#B91C1C" },
  slots: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14, "@media (max-width: 480px)": { gridTemplateColumns: "1fr" } },
  slot: { border: "1.5px dashed #CBD5E1", borderRadius: 14, padding: 12, display: "flex", flexDirection: "column", gap: 10, minHeight: 132, background: "#F8FAFC" },
  slotDone: { borderStyle: "solid", borderColor: "#86EFAC", background: "#F0FDF4" },
  slotTitle: { fontSize: 13.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 },
  preview: { width: "100%", height: 120, objectFit: "cover", borderRadius: 10, background: "#E2E8F0" },
  slotBtns: { display: "flex", gap: 8, flexWrap: "wrap" },
  btn: {
    flex: "1 1 auto", minHeight: 44, padding: "0 14px", borderRadius: 12, border: "1px solid #CBD5E1", background: "#fff", color: "#0F172A",
    fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
    "&:disabled": { opacity: 0.6, cursor: "default" },
  },
  btnMain: { background: BLUE, borderColor: BLUE, color: "#fff" },
  consent: { display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer", fontSize: 14, lineHeight: 1.55, color: "#1E293B" },
  check: { width: 22, height: 22, flex: "none", marginTop: 1, accentColor: BLUE },
  footer: { position: "fixed", left: 0, right: 0, bottom: 0, background: "rgba(255,255,255,.96)", borderTop: "1px solid #E2E8F0", padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", backdropFilter: "blur(6px)" },
  footerIn: { maxWidth: 640, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 },
  footerNote: { flex: 1, fontSize: 13, color: "#475569", lineHeight: 1.4 },
  send: { flex: "none", minHeight: 48, padding: "0 22px", borderRadius: 12, border: 0, background: "#16a34a", color: "#fff", fontFamily: "inherit", fontSize: 15, fontWeight: 700, cursor: "pointer", "&:disabled": { background: "#94A3B8", cursor: "default" } },
  center: { maxWidth: 520, margin: "0 auto", padding: "64px 20px", textAlign: "center" },
  bigIcon: { width: 64, height: 64, borderRadius: "50%", display: "grid", placeItems: "center", margin: "0 auto 16px" },
  privacy: { display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: "#475569", lineHeight: 1.5, margin: "4px 2px 16px" },
  spin: { animation: "fichaSpin 1s linear infinite" },
  "@global": { "@keyframes fichaSpin": { to: { transform: "rotate(360deg)" } } },
}));

const SECTIONS = [
  { title: "Seus dados", sub: "Como está no seu documento.", keys: ["nome", "nascimento", "cpf", "mae"] },
  { title: "Documento de identidade", sub: "RG ou CNH. Foto nítida, sem reflexo, com todos os cantos aparecendo.", keys: ["rgNumero", "rgOrgao", "rgUf"], files: ["doc_frente", "doc_verso"] },
  { title: "Endereço", sub: "Onde você mora hoje.", keys: ["cep", "rua", "numero", "complemento", "bairro", "cidade", "uf"] },
  { title: "Contato", sub: "Para a instituição falar com você.", keys: ["celular", "email"] },
  { title: "Histórico do ensino médio", sub: "Opcional. Se já tiver em mãos, envie agora; se não, você pode entregar depois.", keys: [], files: ["historico"] },
];
const WIDE = ["nome", "mae", "rua", "email"];
const INPUT = {
  nascimento: { type: "date" },
  cpf: { inputMode: "numeric", placeholder: "000.000.000-00", autoComplete: "off" },
  cep: { inputMode: "numeric", placeholder: "00000-000", autoComplete: "postal-code" },
  celular: { inputMode: "tel", placeholder: "(00) 00000-0000", autoComplete: "tel-national" },
  email: { type: "email", inputMode: "email", placeholder: "seuemail@exemplo.com", autoComplete: "email" },
  nome: { autoComplete: "name" },
  rua: { autoComplete: "address-line1" },
  numero: { inputMode: "numeric" },
  cidade: { autoComplete: "address-level2" },
  rgOrgao: { placeholder: "SSP, DETRAN..." },
};

const FileSlot = ({ classes, kind, label, optional, stored, locked, onPick, onRemove, busy }) => {
  const camera = useRef(null);
  const gallery = useRef(null);
  const [local, setLocal] = useState(null);
  useEffect(() => () => { if (local) URL.revokeObjectURL(local); }, [local]);
  const pick = (input) => {
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    if (/^image\/(jpeg|png|webp)$/.test(file.type)) setLocal(URL.createObjectURL(file));
    else setLocal(null);
    onPick(kind, file);
  };
  return (
    <div className={`${classes.slot} ${stored ? classes.slotDone : ""}`}>
      <div className={classes.slotTitle}>
        {stored ? <CheckCircle2 size={18} color="#15803D" /> : <ImageIcon size={18} color="#475569" />}
        <span>{label}{optional && <span className={classes.opt}> (opcional)</span>}</span>
      </div>
      {stored && local && <img src={local} alt={label} className={classes.preview} />}
      {stored && !local && <div style={{ fontSize: 13, color: "#166534", display: "flex", gap: 6, alignItems: "center" }}><FileText size={16} />Enviado: {stored.name}</div>}
      {busy && <div style={{ fontSize: 13, color: "#475569", display: "flex", gap: 6, alignItems: "center" }}><Loader2 size={16} className={classes.spin} />Enviando...</div>}
      {!locked && (
        <div className={classes.slotBtns}>
          <button type="button" className={classes.btn} disabled={busy} onClick={() => camera.current && camera.current.click()}><Camera size={17} />{stored ? "Tirar outra" : "Tirar foto"}</button>
          <button type="button" className={classes.btn} disabled={busy} onClick={() => gallery.current && gallery.current.click()}><ImageIcon size={17} />{stored ? "Trocar" : "Galeria ou PDF"}</button>
          {stored && <button type="button" className={classes.btn} disabled={busy} onClick={() => { setLocal(null); onRemove(kind); }} aria-label={`Remover ${label}`} style={{ flex: "0 0 auto" }}><Trash2 size={17} /></button>}
        </div>
      )}
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target)} />
      <input ref={gallery} type="file" accept="image/*,application/pdf" hidden onChange={(e) => pick(e.target)} />
    </div>
  );
};

const EnrollmentForm = () => {
  const classes = useStyles();
  const { token } = useParams();
  const [view, setView] = useState(null);
  const [failure, setFailure] = useState(null);
  const [data, setData] = useState({});
  const [touched, setTouched] = useState({});
  const [status, setStatus] = useState("idle");
  const [savedAt, setSavedAt] = useState(null);
  const [uploading, setUploading] = useState({});
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(false);
  const pending = useRef({});
  const timer = useRef(null);

  const apply = (v) => {
    setView(v);
    return v;
  };
  useEffect(() => {
    api.get(`/ficha-publica/${token}`)
      .then(({ data: v }) => { apply(v); setData(v.data || {}); })
      .catch((err) => setFailure(errorText(err)));
  }, [token]);

  // each change waits a moment and goes up with the others typed meanwhile
  const flush = useCallback(async (extra) => {
    const patch = pending.current;
    pending.current = {};
    if (!Object.keys(patch).length && !extra) return;
    setStatus("saving");
    try {
      const { data: v } = await api.put(`/ficha-publica/${token}`, { data: patch, ...(extra || {}) });
      apply(v);
      setStatus("saved");
      setSavedAt(new Date());
    } catch (err) {
      // a link that expired or no longer exists is not a connection problem: say what to do
      const code = err && err.response && err.response.status;
      if (code === 404 || code === 410) { setView(null); setFailure(errorText(err)); return; }
      pending.current = { ...patch, ...pending.current };
      setStatus("error");
    }
  }, [token]);
  useEffect(() => () => clearTimeout(timer.current), []);
  // leaving the page sends what is still waiting
  useEffect(() => {
    const out = () => { if (Object.keys(pending.current).length) flush(); };
    window.addEventListener("pagehide", out);
    return () => window.removeEventListener("pagehide", out);
  }, [flush]);

  const change = (key, raw) => {
    const value = key === "rgUf" || key === "uf" ? raw.toUpperCase() : raw;
    setData((d) => ({ ...d, [key]: kept(key, value) }));
    pending.current[key] = kept(key, value);
    setStatus("typing");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(), 700);
  };

  const upload = async (kind, file) => {
    setUploading((u) => ({ ...u, [kind]: true }));
    try {
      if (Object.keys(pending.current).length) await flush();
      const small = await shrink(file);
      const body = new FormData();
      body.append("file", small, small.name || "documento");
      const { data: v } = await api.post(`/ficha-publica/${token}/files/${kind}`, body);
      apply(v);
      setSavedAt(new Date());
      setStatus("saved");
    } catch (err) {
      noticeDialog({ title: "Não foi possível concluir", message: errorText(err) });
    }
    setUploading((u) => ({ ...u, [kind]: false }));
  };
  const removeFile = async (kind) => {
    try {
      const { data: v } = await api.delete(`/ficha-publica/${token}/files/${kind}`);
      apply(v);
    } catch (err) {
      noticeDialog({ title: "Não foi possível concluir", message: errorText(err) });
    }
  };

  const submit = async () => {
    setSending(true);
    try {
      clearTimeout(timer.current);
      await flush();
      const { data: v } = await api.post(`/ficha-publica/${token}/submit`);
      apply(v);
      setEditing(false);
      window.scrollTo(0, 0);
    } catch (err) {
      noticeDialog({ title: "Não foi possível concluir", message: errorText(err) });
    }
    setSending(false);
  };

  if (failure && !view) {
    return (
      <div className={classes.page}>
        <div className={classes.center}>
          <div className={classes.bigIcon} style={{ background: "#FEE2E2", color: "#B91C1C" }}><AlertCircle size={30} /></div>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Não foi possível abrir a ficha</h1>
          <p style={{ color: "#475569", lineHeight: 1.6 }}>{failure}</p>
        </div>
      </div>
    );
  }
  if (!view) {
    return (
      <div className={classes.page}>
        <div className={classes.center} role="status"><Loader2 size={30} className={classes.spin} color={BLUE} /><p style={{ color: "#475569" }}>Abrindo a sua ficha...</p></div>
      </div>
    );
  }

  const labels = Object.fromEntries((view.fields || []).map((f) => [f.key, f]));
  const files = Object.fromEntries((view.files || []).map((f) => [f.kind, f]));
  const locked = !!view.locked;
  const sent = !!view.submittedAt && !editing;
  const sectionDone = (s) => s.keys.every((k) => labels[k] && (labels[k].optional || (data[k] && !(view.problems || {})[k]))) && (s.files || []).every((k) => (view.fileKinds[k] || {}).optional || files[k] || (k === "doc_verso" && files.doc_frente && files.doc_frente.mime === "application/pdf"));

  if (sent || locked) {
    return (
      <div className={classes.page}>
        <div className={classes.center}>
          {view.logo && <img src={view.logo} alt={view.institutionName || "Logo da instituição"} style={{ height: 40, width: "auto", maxWidth: 220, display: "block", margin: "0 auto 18px" }} />}
          <div className={classes.bigIcon} style={{ background: "#DCFCE7", color: "#15803D" }}><CheckCircle2 size={32} /></div>
          <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>{locked ? "Sua matrícula já foi confirmada" : "Recebemos a sua ficha"}</h1>
          <p style={{ color: "#475569", lineHeight: 1.6, margin: "0 0 20px" }}>
            {locked
              ? "Os dados da sua ficha já estão com a instituição. Se precisar corrigir algo, fale com o seu consultor ou a tutoria."
              : `Obrigado${view.firstName ? `, ${view.firstName}` : ""}. O seu consultor já recebeu os dados e o documento e segue com a sua matrícula.`}
          </p>
          {!locked && <button type="button" className={classes.btn} style={{ maxWidth: 260, margin: "0 auto" }} onClick={() => setEditing(true)}>Corrigir algum dado</button>}
        </div>
      </div>
    );
  }

  const bad = (key) => touched[key] && (view.problems || {})[key];
  const savedLabel =
    status === "saving" || status === "typing" ? "Salvando..." : status === "error" ? "Sem conexão: tentando de novo ao continuar" : savedAt ? `Salvo às ${savedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Tudo fica salvo enquanto você preenche";
  const missing = view.missing || [];

  return (
    <div className={classes.page}>
      <header className={classes.top}>
        <div className={classes.topIn}>
          <div className={classes.brandBar}>
            {view.logo ? <img src={view.logo} alt={view.institutionName || "Logo da instituição"} className={classes.brandImg} /> : <span style={{ fontWeight: 700 }}>{view.institutionName || ""}</span>}
            <span className={classes.pill}>Ficha de matrícula</span>
          </div>
          <h1 className={classes.h1}>{view.firstName ? `${view.firstName}, falta pouco para a sua matrícula` : "Falta pouco para a sua matrícula"}</h1>
          <p className={classes.lead}>{view.courseName ? `Curso: ${view.courseName}. ` : ""}Preencha os dados e envie a foto do seu documento. Dá para parar e continuar depois pelo mesmo link.</p>
        </div>
      </header>
      <main className={classes.wrap}>
        <div className={classes.progressCard} role="status" aria-live="polite">
          <div className={classes.progressTop}>
            <span><span className={classes.pct}>{view.progress}%</span> <span style={{ fontSize: 14, color: "#334155", fontWeight: 600 }}>preenchida</span></span>
            <span className={classes.saved}>{status === "saving" || status === "typing" ? <Loader2 size={14} className={classes.spin} /> : <Check size={14} />}{savedLabel}</span>
          </div>
          <div className={classes.bar} aria-hidden><div className={classes.barIn} style={{ width: `${view.progress}%` }} /></div>
          {missing.length > 0 && <div className={classes.missing}>Falta: {missing.slice(0, 4).join(", ")}{missing.length > 4 ? ` e mais ${missing.length - 4}` : ""}.</div>}
        </div>

        <div className={classes.privacy}><Lock size={15} style={{ flex: "none", marginTop: 2 }} />Seus dados e documentos ficam protegidos e só a equipe da instituição tem acesso, apenas para a sua matrícula.</div>

        {SECTIONS.map((s, i) => (
          <section key={s.title} className={classes.card} aria-labelledby={`sec-${i}`}>
            <div className={classes.cardHead}>
              <span className={`${classes.step} ${sectionDone(s) ? classes.stepDone : ""}`}>{sectionDone(s) ? <Check size={15} /> : i + 1}</span>
              <div>
                <h2 id={`sec-${i}`} className={classes.cardTitle}>{s.title}</h2>
                <p className={classes.cardSub}>{s.sub}</p>
              </div>
            </div>
            {s.keys.length > 0 && (
              <div className={classes.grid}>
                {s.keys.map((key) => {
                  const f = labels[key] || { label: key };
                  const id = `ficha-${key}`;
                  const isUf = key === "rgUf" || key === "uf";
                  return (
                    <div key={key} className={WIDE.includes(key) ? classes.full : undefined}>
                      <label htmlFor={id} className={classes.label}>{f.label}{f.optional && <span className={classes.opt}> (opcional)</span>}</label>
                      {isUf ? (
                        <select id={id} className={`${classes.input} ${bad(key) ? classes.inputBad : ""}`} value={data[key] || ""} onChange={(e) => { change(key, e.target.value); setTouched((t) => ({ ...t, [key]: true })); }}>
                          <option value="">Selecione</option>
                          {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                      ) : (
                        <input id={id} className={`${classes.input} ${bad(key) ? classes.inputBad : ""}`} {...(INPUT[key] || {})} value={shown(key, data[key])}
                          onChange={(e) => change(key, e.target.value)} onBlur={() => setTouched((t) => ({ ...t, [key]: true }))} aria-invalid={!!bad(key)} aria-describedby={bad(key) ? `${id}-err` : undefined} />
                      )}
                      {bad(key) && <div id={`${id}-err`} className={classes.problem}><AlertCircle size={14} style={{ flex: "none", marginTop: 1 }} />{view.problems[key]}</div>}
                    </div>
                  );
                })}
              </div>
            )}
            {s.files && (
              <div className={classes.slots}>
                {s.files.map((kind) => (
                  <FileSlot key={kind} classes={classes} kind={kind} label={(view.fileKinds[kind] || {}).label || kind} optional={(view.fileKinds[kind] || {}).optional}
                    stored={files[kind]} locked={locked} busy={!!uploading[kind]} onPick={upload} onRemove={removeFile} />
                ))}
              </div>
            )}
            {s.files && s.files.includes("doc_verso") && <p className={classes.cardSub} style={{ marginTop: 10 }}>Se o seu documento estiver num PDF com frente e verso, envie só no campo da frente.</p>}
          </section>
        ))}

        <section className={classes.card}>
          <div className={classes.cardHead}>
            <span className={`${classes.step} ${view.consent ? classes.stepDone : ""}`}>{view.consent ? <Check size={15} /> : <ShieldCheck size={15} />}</span>
            <div>
              <h2 className={classes.cardTitle}>Uso dos seus dados</h2>
              <p className={classes.cardSub}>Lei Geral de Proteção de Dados (LGPD)</p>
            </div>
          </div>
          <label className={classes.consent}>
            <input type="checkbox" className={classes.check} checked={!!view.consent} onChange={(e) => { const on = e.target.checked; flush({ consent: on }); }} />
            <span>{view.consentText} <a href="/privacidade" target="_blank" rel="noopener noreferrer" style={{ color: BLUE }}>Política de privacidade</a>.</span>
          </label>
        </section>
      </main>
      <footer className={classes.footer}>
        <div className={classes.footerIn}>
          <span className={classes.footerNote}>{view.ready ? "Tudo pronto. Confira e envie." : missing.length === 1 ? "Falta 1 item para enviar." : `Faltam ${missing.length} itens para enviar.`}</span>
          <button type="button" className={classes.send} disabled={!view.ready || sending || status === "saving"} onClick={submit}>{sending ? "Enviando..." : "Enviar ficha"}</button>
        </div>
      </footer>
    </div>
  );
};

export default EnrollmentForm;
