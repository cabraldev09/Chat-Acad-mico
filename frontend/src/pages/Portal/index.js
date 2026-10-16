import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link as RouterLink, useHistory, useParams } from "react-router-dom";
import { toast, ToastContainer } from "react-toastify";
import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, Link, TextField, Tooltip, Typography } from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import { Visibility, VisibilityOff } from "@material-ui/icons";
import { CalendarClock, ChevronDown, KeyRound, Map as MapIcon, Settings, ShieldCheck, UploadCloud, X } from "lucide-react";

import BrandLogo from "../../components/BrandLogo";
import portalApi, { portalToken, setPortalToken } from "../../services/portalApi";
import { NAVY, SKY } from "../Analysis/visual";
import {
  AcademicDashboardOverview, AcademicPeriodJourney, Button as OButton, ConclusionPath, PendingDistribution, Portal as BodyPortal, cn, completionOf, formatDay, readableName,
} from "../Analysis/orig";

// The Portal do Aluno: the student signs in with the RGM (or e-mail) and the password chosen from the invitation, sees
// where they are in the course, what is pending and when the course ends, and can send a newer extract.

const useStyles = makeStyles((theme) => ({
  page: { minHeight: "100vh", background: theme.palette.type === "dark" ? "#0f1520" : "#eef3f9", color: theme.palette.type === "dark" ? "#e8edf5" : "#12202f" },
  // ---- sign in
  split: { minHeight: "100vh", display: "grid", gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 1fr)", [theme.breakpoints.down("sm")]: { gridTemplateColumns: "1fr" } },
  brandSide: { background: NAVY, color: "#fff", padding: "44px 56px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 32, [theme.breakpoints.down("sm")]: { padding: "24px 22px 28px", gap: 18 } },
  headline: { fontSize: 40, lineHeight: 1.08, fontWeight: 800, letterSpacing: "-0.035em", margin: 0, maxWidth: 460, [theme.breakpoints.down("sm")]: { fontSize: 27 } },
  lead: { fontSize: 16, lineHeight: 1.6, color: "#c9dcf2", maxWidth: 440, margin: "14px 0 0", [theme.breakpoints.down("sm")]: { fontSize: 14.5 } },
  points: { display: "grid", gap: 12, margin: 0, padding: 0, listStyle: "none", [theme.breakpoints.down("sm")]: { display: "none" } },
  point: { display: "flex", gap: 12, alignItems: "center", fontSize: 15, color: "#e6f0fb" },
  decor: { [theme.breakpoints.down("sm")]: { display: "none" } },
  formSide: { display: "grid", placeItems: "center", padding: theme.spacing(4, 2), background: theme.palette.type === "dark" ? "#141b27" : "#ffffff" },
  formBox: { width: "100%", maxWidth: 400 },
  h1: { fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 6px" },
  sub: { fontSize: 15, lineHeight: 1.55, color: theme.palette.text.secondary, margin: "0 0 18px" },
  cta: { marginTop: 16, height: 50, borderRadius: 12, fontSize: 16, fontWeight: 700, textTransform: "none", boxShadow: "none", background: NAVY, color: "#fff", "&:hover": { background: "#093663", boxShadow: "none" }, "&.Mui-disabled": { background: theme.palette.action.disabledBackground } },
  // ---- inside
  top: { position: "sticky", top: 0, zIndex: 5, display: "flex", alignItems: "center", gap: 10, padding: "10px 22px", background: NAVY, color: "#fff" },
  wrap: { maxWidth: 1040, margin: "0 auto", padding: theme.spacing(3, 2, 8), display: "grid", gap: theme.spacing(2.5) },
  hero: { borderRadius: 26, background: NAVY, color: "#fff", padding: "28px 30px", display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 24, alignItems: "center", [theme.breakpoints.down("xs")]: { gridTemplateColumns: "1fr", padding: "22px 20px" } },
  eyebrow: { fontSize: 14, color: "#b9d2ee", fontWeight: 600 },
  course: { fontSize: 29, lineHeight: 1.15, fontWeight: 800, letterSpacing: "-0.03em", margin: "4px 0 6px", [theme.breakpoints.down("xs")]: { fontSize: 23 } },
  meta: { fontSize: 14, color: "#c9dcf2" },
  forecast: { marginTop: 18, display: "inline-grid", gap: 2, background: "rgba(255,255,255,.12)", borderRadius: 16, padding: "12px 16px" },
  panel: { borderRadius: 22, padding: theme.spacing(2.5, 2.75), display: "grid", gap: theme.spacing(1.5), [theme.breakpoints.down("xs")]: { padding: theme.spacing(2) } },
  panelTitle: { fontSize: 17, fontWeight: 800, letterSpacing: "-0.015em", display: "flex", alignItems: "center", gap: 8 },
  group: { borderTop: "1px solid", "& > summary": { listStyle: "none", cursor: "pointer", display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", gap: 12, alignItems: "center", padding: "12px 2px", "&::-webkit-details-marker": { display: "none" } }, "&[open] .chev": { transform: "rotate(180deg)" } },
  subject: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "center", padding: "9px 2px 9px 34px", fontSize: 14.5 },
  drop: { border: "2px dashed", borderRadius: 18, padding: "22px 18px", textAlign: "center", cursor: "pointer", display: "grid", gap: 6, justifyItems: "center", transition: "background .15s" },
  timeline: { display: "grid", gap: 0 },
}));

const say = (err) => {
  const d = err && err.response && err.response.data;
  return (d && (d.error || d.message)) || "Algo deu errado. Tente novamente.";
};

// a decorative sample of the trail (not the student's data): it shows what the portal will draw for them
const SAMPLE = [[3, 0, 0], [3, 0, 0], [3, 0, 0], [3, 0, 0], [2, 1, 1], [0, 1, 3], [0, 0, 4], [0, 0, 4]];
const Decor = () => {
  const c = useStyles();
  return (
    <div className={c.decor} aria-hidden="true" style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
      {SAMPLE.map(([done, doing, pending], i) => (
        <div key={i} style={{ display: "grid", gap: 5, justifyItems: "center" }}>
          {Array.from({ length: pending }, (_, k) => <span key={`p${k}`} style={{ width: 22, height: 22, borderRadius: 6, border: "2.5px solid rgba(255,255,255,.55)" }} />)}
          {Array.from({ length: doing }, (_, k) => <span key={`d${k}`} style={{ width: 22, height: 22, borderRadius: 6, background: SKY, boxShadow: `0 0 0 2.5px ${NAVY}, 0 0 0 5px ${SKY}` }} />)}
          {Array.from({ length: done }, (_, k) => <span key={`o${k}`} style={{ width: 22, height: 22, borderRadius: 6, background: "#fff" }} />)}
        </div>
      ))}
    </div>
  );
};

const AuthShell = ({ title, subtitle, children, wide }) => {
  const c = useStyles();
  return (
    <div className={c.page}>
      <div className={c.split}>
        <div className={c.brandSide}>
          <BrandLogo tone="white" height={44} />
          <div>
            <h2 className={c.headline}>Sua trajetória até a formatura, num só lugar.</h2>
            <p className={c.lead}>Veja o que você já concluiu, o que ainda falta cursar e quando o curso termina.</p>
          </div>
          <Decor />
          <ul className={c.points}>
            <li className={c.point}><MapIcon size={20} color="#7cc0ff" />O mapa do seu curso, disciplina por disciplina</li>
            <li className={c.point}><CalendarClock size={20} color="#7cc0ff" />Previsão de formatura sempre atualizada</li>
            <li className={c.point}><ShieldCheck size={20} color="#7cc0ff" />Acesso só seu, com senha que você mesmo cria</li>
          </ul>
        </div>
        <div className={c.formSide}>
          <div className={c.formBox} style={wide ? { maxWidth: 440 } : undefined}>
            <h1 className={c.h1}>{title}</h1>
            {subtitle && <p className={c.sub}>{subtitle}</p>}
            {children}
          </div>
        </div>
      </div>
      <ToastContainer position="top-right" autoClose={4500} />
    </div>
  );
};

const field = { variant: "outlined", margin: "normal", fullWidth: true, InputLabelProps: { shrink: true } };

export const PortalLogin = () => {
  const c = useStyles();
  const history = useHistory();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => { if (portalToken()) history.replace("/portal"); }, [history]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await portalApi.post("/portal/login", { login, password });
      setPortalToken(data.token);
      history.replace("/portal");
    } catch (err) { toast.error(say(err)); }
    setBusy(false);
  };
  const sendForgot = async () => {
    setBusy(true);
    try { await portalApi.post("/portal/forgot", { login }); setSent(true); } catch (err) { toast.error(say(err)); }
    setBusy(false);
  };

  return (
    <AuthShell title="Entrar no portal" subtitle="Use o seu RGM (ou e-mail) e a senha que você criou pelo convite.">
      <form onSubmit={submit} noValidate>
        <TextField {...field} autoFocus label="RGM ou e-mail" placeholder="Ex.: 44868774" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" />
        <TextField {...field} label="Senha" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
          InputProps={{ endAdornment: <InputAdornment position="end"><IconButton size="small" aria-label={show ? "Ocultar a senha" : "Mostrar a senha"} onClick={() => setShow((v) => !v)}>{show ? <VisibilityOff /> : <Visibility />}</IconButton></InputAdornment> }} />
        <Button type="submit" fullWidth variant="contained" className={c.cta} disabled={busy || !login.trim() || !password}>{busy ? <CircularProgress size={22} color="inherit" /> : "Entrar"}</Button>
        <div style={{ marginTop: 20, fontSize: 14.5, display: "grid", gap: 8 }}>
          <Link component="button" type="button" underline="always" style={{ justifySelf: "start", fontWeight: 600 }} onClick={() => { setSent(false); setForgot(true); }}>Esqueci minha senha</Link>
          <span style={{ opacity: 0.75 }}>Ainda não tem acesso? Peça o convite ao seu tutor.</span>
        </div>
      </form>
      <Dialog open={forgot} onClose={() => setForgot(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Esqueci minha senha</DialogTitle>
        <DialogContent>
          {sent ? <Typography variant="body2">Se {login || "esse cadastro"} existe e tem e-mail, enviamos um link para criar uma nova senha. Ele vale por 1 hora.</Typography> : (
            <>
              <Typography variant="body2" gutterBottom>Digite o RGM ou o e-mail do seu cadastro. Enviamos o link para o e-mail do cadastro.</Typography>
              <TextField {...field} autoFocus label="RGM ou e-mail" value={login} onChange={(e) => setLogin(e.target.value)} />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setForgot(false)} variant="outlined" color="secondary">Fechar</Button>
          {!sent && <Button onClick={sendForgot} variant="contained" color="primary" disabled={busy || !login.trim()}>Enviar o link</Button>}
        </DialogActions>
      </Dialog>
    </AuthShell>
  );
};

export const PortalActivate = () => {
  const c = useStyles();
  const { token } = useParams();
  const history = useHistory();
  const [info, setInfo] = useState(null);
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { portalApi.get(`/portal/token/${token}`).then(({ data }) => setInfo(data)).catch(() => setInfo({ valid: false })); }, [token]);
  const ok = password.length >= 8 && password === again;
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await portalApi.post("/portal/activate", { token, password });
      setPortalToken(null);
      toast.success("Senha criada. Agora é só entrar.");
      history.replace("/portal/login");
    } catch (err) { toast.error(say(err)); }
    setBusy(false);
  };
  if (!info) return <AuthShell title="Um instante..."><CircularProgress size={26} /></AuthShell>;
  if (!info.valid) {
    return (
      <AuthShell title="Este link não vale mais" subtitle="Ele já foi usado ou passou do prazo. Peça um novo link ao seu tutor ou use “Esqueci minha senha”.">
        <Button component={RouterLink} to="/portal/login" variant="contained" className={c.cta}>Ir para o login</Button>
      </AuthShell>
    );
  }
  return (
    <AuthShell title={info.name ? `Olá, ${info.name.split(" ")[0]}!` : "Crie a sua senha"} subtitle="Escolha uma senha com pelo menos 8 caracteres. É com ela que você vai entrar no portal.">
      <form onSubmit={submit} noValidate>
        <TextField {...field} autoFocus label="Nova senha" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} helperText={password.length > 0 && password.length < 8 ? "Use 8 ou mais caracteres." : ""} />
        <TextField {...field} label="Repita a senha" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)}
          error={again.length > 0 && again !== password} helperText={again.length > 0 && again !== password ? "As senhas não são iguais." : ""} />
        <Button type="submit" fullWidth variant="contained" className={c.cta} disabled={busy || !ok}>{busy ? <CircularProgress size={22} color="inherit" /> : "Salvar a senha"}</Button>
      </form>
    </AuthShell>
  );
};

// ------------------------------------------------------------------ inside the portal (the original's screen)

const DOC_LABEL = {
  OFFICIAL_ACADEMIC_HISTORY: "Histórico Escolar Oficial",
  SIMPLE_ACADEMIC_HISTORY: "Histórico Escolar — Simples Conferência",
  CURRICULAR_EXTRACT: "Extrato Curricular",
  UNKNOWN_ACADEMIC_DOCUMENT: "Documento acadêmico",
};
const MAX_MB = 15;
const BLOCK = "sm:rounded-2xl sm:border sm:border-slate-200 sm:bg-white sm:p-6 sm:shadow-[0_16px_40px_-36px_rgba(15,42,66,0.62)]";

const gradeOf = (row) => {
  if (row.grade !== null && row.grade !== undefined && row.grade !== "") return String(row.grade);
  return /^\d+(?:[.,]\d+)?$/.test(row.normalizedStatus || "") ? row.normalizedStatus : null;
};

// the right-hand panel of the original ("Configurações"): the account and the password
const SettingsSheet = ({ open, onClose, student, onChangePassword }) => {
  const [pass, setPass] = useState({ password: "", newPassword: "" });
  const [openPw, setOpenPw] = useState(false);
  useEffect(() => { if (!open) { setPass({ password: "", newPassword: "" }); setOpenPw(false); } }, [open]);
  if (!open) return null;
  const rows = [["Nome", student.name], ["E-mail", student.email || "Acesso ainda não criado"], ["RGM", student.rgm]];
  return (
    <BodyPortal><div role="dialog" aria-modal="true" aria-label="Configurações" className="fixed inset-0 z-[1300]">
      <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="absolute inset-y-0 right-0 flex w-full flex-col bg-slate-50 shadow-2xl sm:max-w-md">
        <div className="border-b border-slate-200 bg-gradient-to-br from-brand-cyan-50 via-white to-white px-5 py-5">
          <div className="flex items-center gap-3 pr-8">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#003B71] text-white shadow-[0_10px_24px_-14px_#003B71]"><Settings className="size-5" /></span>
            <div className="min-w-0"><h2 className="text-lg font-semibold text-[#003B71]">Configurações</h2><p className="text-sm text-slate-500">Sua conta e sua senha.</p></div>
          </div>
          <button type="button" aria-label="Fechar" onClick={onClose} className="absolute right-4 top-4 grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><X className="size-4" /></button>
        </div>
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 py-6">
          <section>
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-cyan-50 text-brand-cyan-700"><ShieldCheck className="size-4" /></span>
              <div className="min-w-0"><h3 className="font-semibold text-[#003B71]">Minha conta</h3></div>
            </div>
            <div className="mt-4">
              <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white px-4 text-sm">
                {rows.map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-4 py-3"><dt className="shrink-0 text-slate-500">{label}</dt><dd className="min-w-0 truncate text-right font-medium text-slate-900" title={value}>{value}</dd></div>
                ))}
              </dl>
              <div className="group mt-3 rounded-2xl border border-slate-200 bg-white">
                <button type="button" onClick={() => setOpenPw((v) => !v)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-[#003B71]" aria-expanded={openPw}>
                  <span className="flex items-center gap-2"><KeyRound className="size-4" /> Alterar senha</span>
                  <ChevronDown className={cn("size-4 transition-transform", openPw && "rotate-180")} />
                </button>
                {openPw && (
                  <div className="space-y-3 border-t border-slate-100 p-4">
                    <label className="block text-xs font-medium text-slate-600">Senha atual<input type="password" autoComplete="current-password" value={pass.password} onChange={(e) => setPass({ ...pass, password: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
                    <label className="block text-xs font-medium text-slate-600">Nova senha (8 ou mais caracteres)<input type="password" autoComplete="new-password" value={pass.newPassword} onChange={(e) => setPass({ ...pass, newPassword: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
                    <OButton className="min-h-11 w-full bg-brand-cyan text-white hover:bg-brand-cyan/90" disabled={!pass.password || pass.newPassword.length < 8} onClick={() => onChangePassword(pass)}>Trocar a senha</OButton>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div></BodyPortal>
  );
};

// "Atualizar minha análise": the card that opens the form to send a newer document
const StudentUpload = ({ onSent }) => {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [file, setFile] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState("");
  const inputRef = useRef(null);

  const choose = (files) => {
    if (sending) return;
    if (!files || files.length !== 1) { toast.error("Envie apenas 1 documento em PDF."); return; }
    const candidate = files[0];
    if (!/\.pdf$/i.test(candidate.name) || candidate.size > MAX_MB * 1024 * 1024) { toast.error(`Selecione um documento em PDF de até ${MAX_MB} MB.`); return; }
    setFile(candidate);
    setConfirmed(false);
    setMessage("");
  };
  const submit = async (event) => {
    event.preventDefault();
    if (!file || !confirmed || sending) return;
    setSending(true);
    setMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      const { data: r } = await portalApi.post("/portal/upload", form);
      setMessage(r.reused ? "Nenhuma alteração acadêmica foi identificada. Exibindo seu resultado atual." : "Sua análise foi atualizada. Veja o resultado abaixo.");
      setOpen(false);
      setFile(null);
      setConfirmed(false);
      onSent();
    } catch (err) { setMessage(say(err)); }
    setSending(false);
  };

  return (
    <section className="rounded-2xl border border-brand-cyan/20 bg-white p-5 shadow-[0_16px_40px_-36px_rgba(6,147,227,0.45)] sm:p-6" id="atualizar-analise" aria-labelledby="update-title">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="update-title" className="font-semibold text-[#003B71]">Atualizar minha análise</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Envie um documento acadêmico atualizado para verificarmos se houve mudanças na sua situação.</p>
        </div>
        <OButton className="min-h-11 w-full bg-brand-cyan text-white hover:bg-brand-cyan/90 sm:w-auto" onClick={() => setOpen(!open)} disabled={sending}>
          <UploadCloud className="size-4" />Atualizar minha análise
        </OButton>
      </div>
      {sending && (
        <div role="status" className="mt-5 flex items-center gap-3 rounded-xl bg-brand-cyan-50 p-4 text-sm text-[#003B71]">
          <span className="size-5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <div><strong>Estamos atualizando sua análise.</strong><p className="mt-1">Lendo o documento. Isso pode levar alguns instantes.</p></div>
        </div>
      )}
      {message && <p role="status" className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-6">{message}</p>}
      {open && (
        <form onSubmit={submit} className="mt-5 space-y-4 border-t pt-5">
          <div className="text-sm leading-7 text-slate-600">
            <p className="font-semibold">Documentos aceitos:</p>
            <ul><li>✓ Histórico Escolar Oficial</li><li>✓ Histórico Escolar — Simples Conferência</li><li>✓ Extrato / Grade Curricular</li></ul>
          </div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files); }}
            className={cn("rounded-2xl border-2 border-dashed p-6 text-center transition-colors", dragging ? "border-brand-cyan bg-brand-cyan-50" : "border-brand-cyan/30 bg-brand-cyan-50/50")}
          >
            <UploadCloud className="mx-auto size-8 text-brand-cyan-700" />
            <p className="mt-3 font-semibold text-[#003B71]">Arraste seu documento aqui</p>
            <p className="mt-1 text-sm text-slate-500">1 documento em PDF · até {MAX_MB} MB</p>
            <input ref={inputRef} type="file" accept="application/pdf,.pdf" aria-label="Selecionar documento" disabled={sending} className="mt-4 block w-full min-w-0 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-white file:p-3 file:text-[#003B71]" style={{ appearance: "auto" }} onChange={(e) => choose(e.target.files)} />
            {file && (
              <div className="mt-4 rounded-xl bg-white p-3">
                <p className="break-all text-sm font-medium">{file.name}</p>
                <div className="mt-2 flex justify-center gap-3">
                  <OButton variant="ghost" onClick={() => inputRef.current && inputRef.current.click()}>Substituir arquivo</OButton>
                  <OButton variant="ghost" onClick={() => { setFile(null); setConfirmed(false); setMessage(""); if (inputRef.current) inputRef.current.value = ""; }}>Remover</OButton>
                </div>
              </div>
            )}
          </div>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 size-4 accent-[#003B71]" style={{ appearance: "auto" }} />
            <span>Confirmo que o documento está atualizado, completo e pertence a esta matrícula.</span>
          </label>
          <OButton type="submit" disabled={!file || !confirmed || sending} className="min-h-11 w-full bg-brand-cyan text-white hover:bg-brand-cyan/90 sm:w-auto">Enviar documento</OButton>
        </form>
      )}
    </section>
  );
};

// the analysis itself (student-portal/analysis-view.tsx)
const StudentAnalysisView = ({ cur }) => {
  const snap = cur.snapshot;
  const result = snap.result || {};
  const forecast = cur.forecast;
  const disciplines = snap.disciplines || [];
  const unmapped = disciplines.some((row) => row.inMainCurriculum && (row.period === null || row.period === undefined));
  const mappingRequired = unmapped || !result.currentPeriodConfirmed;
  const inactive = result.status === "ENROLLMENT_INACTIVE";
  const completion = completionOf(forecast);
  const status = {
    NO_PENDING: "Sem pendências de períodos anteriores",
    CAN_ADD: "Há espaço para avançar nas pendências",
    NEAR_LIMIT: "Semestre próximo do limite",
    LIMIT_REACHED: "Semestre com a carga completa",
    MANUAL_REVIEW_REQUIRED: "A equipe precisa conferir alguns dados do documento",
  }[result.status];
  const sit = snap.enrollmentSituation;

  return (
    <div className="space-y-8 sm:space-y-6">
      <p className="text-xs text-slate-500">Análise baseada em: {DOC_LABEL[snap.documentType] || "Documento acadêmico"}</p>
      <AcademicDashboardOverview
        audience="student"
        mappingRequired={mappingRequired}
        workloadProgress={snap.documentType !== "CURRICULAR_EXTRACT" && snap.plannedWorkload && snap.integralizedWorkload != null ? { planned: snap.plannedWorkload, integralized: snap.integralizedWorkload } : undefined}
        disciplines={disciplines}
        currentPeriod={result.currentPeriod ?? null}
        currentPeriodConfirmed={!!result.currentPeriodConfirmed}
        pending={result.previousPending ?? 0}
        inProgress={result.previousAlreadyAdded ?? 0}
        currentAE={result.currentPeriodAE ?? 0}
        availableSlots={result.remainingExtraSlots ?? 0}
        completionTerm={inactive ? null : completion}
        needsReview={result.status === "MANUAL_REVIEW_REQUIRED" || Boolean(forecast && forecast.incomplete)}
      />

      {inactive && sit ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <h2 className="font-semibold text-rose-900">Sua matrícula consta como {sit.label.toLowerCase()}</h2>
          <p className="mt-2 text-sm leading-6 text-rose-900">Enquanto ela não estiver ativa, não é possível incluir disciplinas nem calcular a previsão de formatura. Procure o seu polo ou a secretaria para ver como regularizar.</p>
        </section>
      ) : mappingRequired ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-semibold text-amber-900">Mapeamento curricular necessário</h2>
          <p className="mt-2 text-sm leading-6 text-amber-900">Seu histórico foi recebido. A equipe precisa confirmar o período atual e a posição das disciplinas na grade antes de calcular a previsão de conclusão. As notas, situações e cargas horárias já estão disponíveis abaixo.</p>
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 to-white p-5 sm:p-6">
            <p className="text-xs font-semibold tracking-[0.13em] text-brand-cyan-700 uppercase">Entenda sua situação</p>
            <h2 className="mt-1 text-lg font-semibold text-[#003B71]">{status}</h2>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              {result.currentPeriod
                ? `Você está no ${result.currentPeriod}º período${result.previousPending ? ` e tem ${result.previousPending} disciplina(s) de períodos anteriores para cursar` : " e não tem disciplinas de períodos anteriores para cursar"}.`
                : "O período atual precisa ser conferido pela equipe acadêmica."}{" "}
              {result.previousAlreadyAdded > 0 ? `${result.previousAlreadyAdded} delas já estão em andamento neste semestre.` : ""}{" "}
              {result.previousPending > 0
                ? result.remainingExtraSlots === 0
                  ? "Neste semestre a sua carga já está completa; as demais pendências entram nos próximos semestres, como mostra o caminho abaixo."
                  : `Ainda cabe(m) ${result.remainingExtraSlots} disciplina(s) a mais neste semestre. Converse com a equipe sobre oferta e matrícula.`
                : ""}
            </p>
            {result.status === "MANUAL_REVIEW_REQUIRED" && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Alguns dados precisam de conferência. Os indicadores e a previsão podem ser ajustados após a revisão da equipe.</p>}
          </section>
          {forecast && (forecast.plan || []).length > 0 && (
            <section className={BLOCK} aria-labelledby="caminho-conclusao">
              <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-[0.13em] text-brand-cyan-700 uppercase">Planejamento</p>
                  <h2 id="caminho-conclusao" className="mt-1 text-xl font-semibold tracking-tight text-[#003B71]">Seu caminho até a conclusão</h2>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Semestre a semestre, as disciplinas previstas até a sua formatura. A estimativa depende de aprovação, oferta de disciplinas e rematrícula no prazo.{forecast.incomplete ? " Alguns dados ainda precisam de conferência." : ""}</p>
                </div>
                {completion && (
                  <p className="rounded-2xl bg-[#003B71] px-4 py-2.5 text-white">
                    <span className="block text-[10px] font-semibold tracking-[0.14em] text-cyan-100 uppercase">Conclusão prevista</span>
                    <span className="text-lg font-semibold tabular-nums">{completion}</span>
                  </p>
                )}
              </div>
              <ConclusionPath steps={forecast.plan} allOfficial={forecast.calendarConfidence === "OFFICIAL"} completion={completion} />
            </section>
          )}
          <AcademicPeriodJourney disciplines={disciplines} currentPeriod={result.currentPeriod ?? null} />
          <section className={BLOCK}>
            <h2 className="text-lg font-semibold text-[#003B71]">Pendências de períodos anteriores</h2>
            <p className="mt-1 mb-4 text-sm text-slate-500">Disciplinas de períodos que você já passou e que ainda precisam ser cursadas.</p>
            <PendingDistribution byPeriod={result.pendingByPeriod} totalPending={result.previousPending ?? 0} disciplines={result.pendingDisciplines || []} />
          </section>
          {(result.previousCoursesInProgress || []).length > 0 && (
            <section className={BLOCK}>
              <h2 className="text-lg font-semibold text-[#003B71]">Disciplinas anteriores em andamento</h2>
              <p className="mt-1 text-sm text-slate-500">Pendências que você já está cursando neste semestre.</p>
              <ul className="mt-4 grid gap-x-8 sm:grid-cols-2">
                {result.previousCoursesInProgress.map((row, index) => (
                  <li key={index} className="flex items-start gap-2.5 border-b border-slate-100 py-2.5 text-sm">
                    <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-cyan-500" />
                    <span className="min-w-0"><span className="block font-medium text-slate-800">{readableName(row.name)}</span><span className="text-xs text-slate-500">{row.period}º período</span></span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <details className="group rounded-2xl border border-slate-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 font-semibold text-[#003B71] [&::-webkit-details-marker]:hidden">
          <span>Disciplinas e resultados<span className="mt-0.5 block text-xs font-normal text-slate-500">Todas as disciplinas lidas do seu documento</span></span>
          <span aria-hidden="true" className="text-slate-400 transition-transform group-open:rotate-180">⌄</span>
        </summary>
        <ul className="divide-y divide-slate-100 border-t border-slate-100 md:hidden">
          {disciplines.map((row, i) => (
            <li key={i} className="px-5 py-3 text-sm">
              <p className="font-medium text-slate-800">{readableName(row.name)}</p>
              <p className="mt-0.5 text-xs text-slate-500">{[row.period ? `${row.period}º período` : "Período a confirmar", row.originalStatus, gradeOf(row), row.workload ? `${row.workload}h` : null].filter(Boolean).join(" · ")}</p>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto border-t border-slate-100 px-5 pb-5 md:block">
          <table className="w-full text-left text-sm">
            <thead><tr>{["Disciplina", "Período", "Semestre letivo", "Situação", "Nota", "Carga"].map((label) => <th key={label} className="px-2 py-3 text-xs font-medium text-slate-500">{label}</th>)}</tr></thead>
            <tbody>
              {disciplines.map((row, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="min-w-56 px-2 py-2.5 font-medium text-slate-800">{readableName(row.name)}{row.code && <span className="ml-1.5 text-xs font-normal text-slate-400">{row.code}</span>}</td>
                  <td className="px-2 py-2.5">{row.period ? `${row.period}º` : "A confirmar"}</td>
                  <td className="px-2 py-2.5">{row.academicTerm ?? "—"}</td>
                  <td className="px-2 py-2.5">{row.originalStatus}</td>
                  <td className="px-2 py-2.5">{gradeOf(row) ?? "—"}</td>
                  <td className="px-2 py-2.5">{row.workload ?? "—"}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
};

const Portal = () => {
  const history = useHistory();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(false);

  const logout = useCallback(() => { setPortalToken(null); history.replace("/portal/login"); }, [history]);
  const load = useCallback(() => {
    portalApi.get("/portal/me").then(({ data: d }) => setData(d)).catch((err) => {
      if (err.response && err.response.status === 401) logout(); else setError(say(err));
    });
  }, [logout]);
  useEffect(() => { if (!portalToken()) { history.replace("/portal/login"); return; } load(); }, [load, history]);

  const changePassword = async (pass) => {
    try {
      await portalApi.put("/portal/password", pass);
      toast.success("Senha alterada. Entre de novo com a nova senha.");
      logout();
    } catch (err) { toast.error(say(err)); }
  };

  if (error) return <AuthShell title="Não foi possível abrir" subtitle={error}><Button variant="outlined" onClick={load}>Tentar de novo</Button></AuthShell>;
  if (!data) return <AuthShell title="Carregando..."><CircularProgress size={26} /></AuthShell>;

  const cur = data.current;
  const snap = cur && cur.snapshot;
  const first = data.student.name.split(" ")[0];

  return (
    <div className="orig portal-experience portal-dashboard min-h-dvh bg-[#f5f8fc] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <a href="/portal"><BrandLogo tone="color" height={52} /></a>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="flex items-center gap-2 text-sm font-medium">
              <span className="grid size-9 place-items-center rounded-full bg-brand-cyan-50 text-brand-cyan-700">{data.student.name[0]}</span>
              <span className="hidden max-w-24 truncate sm:inline sm:max-w-40">{first}</span>
            </span>
            <button type="button" aria-label="Configurações" onClick={() => setSettings(true)} className="flex min-h-11 items-center gap-2 rounded-full border border-slate-200 px-3 text-sm font-medium text-[#003B71] hover:bg-sky-50">
              <Settings className="size-4" /><span className="hidden sm:inline">Configurações</span>
            </button>
            <button type="button" onClick={logout} className="min-h-11 px-2 text-sm text-slate-500">Sair</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-7 sm:px-6 sm:py-10">
        <div>
          <p className="text-sm text-slate-500">Olá, {first}.</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#003B71] sm:text-3xl">Minha Análise Acadêmica</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {(cur && cur.courseName) || data.student.courseName || "Curso aguardando documento"} <span className="mx-2 text-slate-300">/</span> RGM {data.student.rgm}
          </p>
          {cur && <p className="mt-1 text-xs text-slate-500">{cur.origin === "STUDENT_UPLOAD" ? "Atualizado por você" : "Atualizado pela equipe acadêmica"} em {formatDay(cur.updatedAt)}.</p>}
        </div>

        <StudentUpload onSent={load} />

        {cur && snap ? <StudentAnalysisView cur={cur} /> : (
          <section className="rounded-2xl border border-dashed bg-white p-8 text-center">
            <h2 className="text-lg font-semibold text-[#003B71]">Sua jornada começa aqui</h2>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">Ainda não há uma análise disponível. Envie um documento acadêmico atualizado ou aguarde a atualização pela equipe acadêmica.</p>
          </section>
        )}

        <section id="historico" className="rounded-2xl border bg-white p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-[#003B71]">Atualizações da sua análise</h2>
          <p className="mt-1 text-sm text-slate-500">Somente as mudanças na sua situação acadêmica aparecem aqui.</p>
          <ol className="mt-5 divide-y">
            {data.versions.map((version) => (
              <li key={version.id} className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="font-medium text-[#003B71]">{formatDay(version.createdAt)}</span>
                    {version.isCurrent && <span className="ml-3 rounded-full bg-brand-cyan px-2 py-1 text-xs font-semibold text-white">Atual</span>}
                    <p className="mt-2 text-sm text-slate-500">Versão {version.version}</p>
                  </div>
                </div>
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer py-2 font-medium text-slate-600">Ver o que mudou</summary>
                  <ul className="space-y-2 border-l-2 border-brand-cyan/20 pl-4 text-slate-600">{(version.changeSummary || []).map((change, index) => <li key={index}>{change}</li>)}</ul>
                </details>
              </li>
            ))}
          </ol>
          {data.versions.length === 0 && <p className="mt-4 text-sm text-slate-500">As atualizações aparecerão após sua primeira análise.</p>}
        </section>

        <footer className="pb-3 pt-2 text-center text-xs text-slate-400">Cruzeiro do Sul Virtual · Portal Acadêmico</footer>
      </main>

      <SettingsSheet open={settings} onClose={() => setSettings(false)} student={data.student} onChangePassword={changePassword} />
      <ToastContainer position="top-right" autoClose={4500} />
    </div>
  );
};

export default Portal;
