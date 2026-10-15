import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link as RouterLink, useHistory, useParams } from "react-router-dom";
import { toast, ToastContainer } from "react-toastify";
import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, Link, TextField, Typography } from "@material-ui/core";
import { makeStyles, useTheme } from "@material-ui/core/styles";
import { Visibility, VisibilityOff } from "@material-ui/icons";
import { AlertTriangle, CheckCircle2, KeyRound, LogOut, Upload } from "lucide-react";

import BrandLogo from "../../components/BrandLogo";
import portalApi, { portalToken, setPortalToken } from "../../services/portalApi";

// The Portal do Aluno: the student signs in with the RGM (or e-mail) and the password chosen from the invitation, sees
// where they are in the course, what is pending and when the course ends, and can send a newer extract.

const useStyles = makeStyles((theme) => ({
  page: { minHeight: "100vh", background: theme.palette.background.default, color: theme.palette.text.primary },
  top: { display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", background: "#0B4279", color: "#fff", flexWrap: "wrap" },
  wrap: { maxWidth: 980, margin: "0 auto", padding: theme.spacing(2.5, 2, 6), display: "grid", gap: theme.spacing(2) },
  card: { borderRadius: 18, padding: theme.spacing(2.5), border: theme.border ? theme.border.divider : "1px solid rgba(127,140,160,.25)", background: theme.palette.cards ? theme.palette.cards.background : theme.palette.background.paper, display: "grid", gap: theme.spacing(1.25) },
  authBox: { minHeight: "100vh", display: "grid", placeItems: "center", padding: theme.spacing(2) },
  authCard: { width: "100%", maxWidth: 420, borderRadius: 20, padding: theme.spacing(4, 3.5), border: theme.border ? theme.border.divider : "1px solid rgba(127,140,160,.25)", background: theme.palette.cards ? theme.palette.cards.background : theme.palette.background.paper, boxShadow: "0 18px 50px -24px rgba(11,66,121,.45)" },
  h1: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 6px", textAlign: "center" },
  sub: { fontSize: 14.5, lineHeight: 1.5, textAlign: "center", color: theme.palette.text.secondary, margin: "0 0 14px" },
  kpis: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 },
  kpi: { borderRadius: 14, padding: "12px 14px", border: theme.border ? theme.border.divider : "1px solid rgba(127,140,160,.25)" },
  kpiV: { fontSize: 24, fontWeight: 700, lineHeight: 1.1 },
  kpiL: { fontSize: 12.5, color: theme.palette.text.secondary, marginTop: 2 },
  muted: { fontSize: 13, color: theme.palette.text.secondary },
  chip: { display: "inline-flex", borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 600, background: theme.palette.action.selected },
  list: { margin: 0, paddingLeft: 18, display: "grid", gap: 4, fontSize: 14 },
}));

const AuthShell = ({ title, subtitle, children }) => {
  const c = useStyles();
  const theme = useTheme();
  return (
    <div className={c.page}>
      <div className={c.authBox}>
        <div className={c.authCard}>
          <BrandLogo tone={theme.palette.type === "dark" ? "white" : "color"} height={56} style={{ display: "block", margin: "0 auto 14px" }} />
          <h1 className={c.h1}>{title}</h1>
          {subtitle && <p className={c.sub}>{subtitle}</p>}
          {children}
        </div>
      </div>
      <ToastContainer position="top-right" autoClose={4500} />
    </div>
  );
};

const say = (err) => {
  const d = err && err.response && err.response.data;
  return (d && (d.error || d.message)) || "Algo deu errado. Tente novamente.";
};

export const PortalLogin = () => {
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
    <AuthShell title="Portal do Aluno" subtitle="Entre com o seu RGM (ou e-mail) e a senha que você criou pelo convite.">
      <form onSubmit={submit} noValidate>
        <TextField variant="outlined" margin="dense" fullWidth autoFocus label="RGM ou e-mail" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" />
        <TextField variant="outlined" margin="dense" fullWidth label="Senha" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
          InputProps={{ endAdornment: <InputAdornment position="end"><IconButton size="small" aria-label="mostrar ou ocultar senha" onClick={() => setShow((v) => !v)}>{show ? <VisibilityOff /> : <Visibility />}</IconButton></InputAdornment> }} />
        <Button type="submit" fullWidth variant="contained" color="primary" disabled={busy || !login.trim() || !password} style={{ marginTop: 14 }}>{busy ? <CircularProgress size={20} /> : "Entrar"}</Button>
        <div style={{ textAlign: "center", marginTop: 16, fontSize: 14, display: "grid", gap: 6 }}>
          <Link component="button" type="button" underline="always" onClick={() => { setSent(false); setForgot(true); }}>Esqueci minha senha</Link>
          <span style={{ opacity: 0.7 }}>Ainda não tem acesso? Peça o convite ao seu tutor.</span>
        </div>
      </form>
      <Dialog open={forgot} onClose={() => setForgot(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Esqueci minha senha</DialogTitle>
        <DialogContent>
          {sent ? <Typography variant="body2">Se {login || "esse cadastro"} existe e tem e-mail, enviamos um link para criar uma nova senha. Ele vale por 1 hora.</Typography> : (
            <>
              <Typography variant="body2" gutterBottom>Digite o RGM ou o e-mail do seu cadastro. Enviamos o link para o e-mail do cadastro.</Typography>
              <TextField variant="outlined" margin="dense" fullWidth autoFocus label="RGM ou e-mail" value={login} onChange={(e) => setLogin(e.target.value)} />
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
  if (!info) return <AuthShell title="Um instante..." />;
  if (!info.valid) {
    return (
      <AuthShell title="Este link não vale mais" subtitle="Ele já foi usado ou passou do prazo. Peça um novo link ao seu tutor ou use “Esqueci minha senha”.">
        <div style={{ textAlign: "center", marginTop: 14 }}><Button component={RouterLink} to="/portal/login" variant="contained" color="primary">Ir para o login</Button></div>
      </AuthShell>
    );
  }
  return (
    <AuthShell title={info.name ? `Olá, ${info.name}!` : "Crie a sua senha"} subtitle="Escolha uma senha com pelo menos 8 caracteres.">
      <form onSubmit={submit} noValidate>
        <TextField variant="outlined" margin="dense" fullWidth autoFocus label="Nova senha" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <TextField variant="outlined" margin="dense" fullWidth label="Repita a senha" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)}
          error={again.length > 0 && again !== password} helperText={again.length > 0 && again !== password ? "As senhas não são iguais." : ""} />
        <Button type="submit" fullWidth variant="contained" color="primary" disabled={busy || !ok} style={{ marginTop: 14 }}>{busy ? <CircularProgress size={20} /> : "Salvar a senha"}</Button>
      </form>
    </AuthShell>
  );
};

const PASSING = ["APROVADO", "APROVADA", "CONCLUIDO", "CONCLUIDA", "DISPENSADO", "DISPENSADA", "AE", "AE*"];
const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

const Ring = ({ pct }) => {
  const r = 46, len = 2 * Math.PI * r;
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label={`${pct}% concluído`}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(127,140,160,.25)" strokeWidth="10" />
      <circle cx="60" cy="60" r={r} fill="none" stroke="#0693E3" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(len * pct) / 100} ${len}`} transform="rotate(-90 60 60)" style={{ transition: "stroke-dasharray .8s ease" }} />
      <text x="60" y="66" textAnchor="middle" fontSize="24" fontWeight="700" fill="currentColor">{pct}%</text>
    </svg>
  );
};

const Portal = () => {
  const c = useStyles();
  const history = useHistory();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState(false);
  const [pass, setPass] = useState({ password: "", newPassword: "" });
  const fileInput = useRef(null);

  const logout = useCallback(() => { setPortalToken(null); history.replace("/portal/login"); }, [history]);
  const load = useCallback(() => {
    portalApi.get("/portal/me").then(({ data: d }) => setData(d)).catch((err) => {
      if (err.response && err.response.status === 401) logout(); else setError(say(err));
    });
  }, [logout]);
  useEffect(() => { if (!portalToken()) { history.replace("/portal/login"); return; } load(); }, [load, history]);

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data: r } = await portalApi.post("/portal/upload", form);
      toast.success(r.reused ? "Recebemos o documento: nada mudou na sua análise." : "Sua análise foi atualizada.");
      load();
    } catch (err) { toast.error(say(err), { autoClose: 9000 }); }
    setBusy(false);
    if (fileInput.current) fileInput.current.value = "";
  };
  const changePassword = async () => {
    try {
      await portalApi.put("/portal/password", pass);
      toast.success("Senha alterada. Entre de novo com a nova senha.");
      logout();
    } catch (err) { toast.error(say(err)); }
  };

  if (error) return <AuthShell title="Não foi possível abrir" subtitle={error}><div style={{ textAlign: "center" }}><Button variant="outlined" onClick={load}>Tentar de novo</Button></div></AuthShell>;
  if (!data) return <AuthShell title="Carregando..." />;
  const cur = data.current;
  const snap = cur && cur.snapshot;
  const res = snap && snap.result;
  const grade = snap ? (snap.disciplines || []).filter((d) => d.inMainCurriculum) : [];
  const done = grade.filter((d) => PASSING.includes(fold(d.normalizedStatus)) || /^NOTA/.test(fold(d.normalizedStatus)) && Number(String(d.normalizedStatus).replace(/[^\d.,]/g, "").replace(",", ".")) >= 6);
  const now = grade.filter((d) => fold(d.normalizedStatus) === "CURSANDO");
  const pending = grade.filter((d) => ["A CURSAR", "REPROVADO", "REPROVADA"].includes(fold(d.normalizedStatus)));
  const pct = snap && snap.plannedWorkload ? Math.min(100, Math.round(((snap.integralizedWorkload || 0) / snap.plannedWorkload) * 100)) : grade.length ? Math.round((done.length / grade.length) * 100) : 0;
  const f = cur && cur.forecast;

  return (
    <div className={c.page}>
      <div className={c.top}>
        <BrandLogo tone="white" height={34} />
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 14 }}>{data.student.name}</span>
        <IconButton size="small" aria-label="Trocar senha" style={{ color: "#fff" }} onClick={() => setPw(true)}><KeyRound size={18} /></IconButton>
        <IconButton size="small" aria-label="Sair" style={{ color: "#fff" }} onClick={logout}><LogOut size={18} /></IconButton>
      </div>
      <div className={c.wrap}>
        {!cur ? (
          <div className={c.card}>
            <Typography style={{ fontWeight: 700, fontSize: 18 }}>Bem-vindo(a), {data.student.name.split(" ")[0]}!</Typography>
            <Typography variant="body2" color="textSecondary">Ainda não temos o seu extrato. Envie o PDF do extrato ou do histórico escolar e a sua análise aparece aqui na hora.</Typography>
          </div>
        ) : (
          <>
            <div className={c.card}>
              <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
                <Ring pct={pct} />
                <div style={{ flex: 1, minWidth: 220, display: "grid", gap: 4 }}>
                  <Typography style={{ fontWeight: 700, fontSize: 19 }}>{cur.courseName || data.student.courseName}</Typography>
                  <span className={c.muted}>RGM {data.student.rgm}{cur.currentPeriod ? ` · ${cur.currentPeriod}º período` : ""}</span>
                  {f && f.completionTermMin && !f.incomplete && f.uncertainRows === 0 ? (
                    <Typography variant="body1"><b>Previsão de formatura:</b> {f.completionTermMin === f.completionTermMax ? `período ${f.completionTermMin}` : `entre ${f.completionTermMin} e ${f.completionTermMax}`}</Typography>
                  ) : <Typography variant="body2" color="textSecondary">A previsão de formatura aparece quando a equipe confirmar o seu período atual.</Typography>}
                  <span className={c.muted}>Atualizado em {new Date(cur.updatedAt).toLocaleDateString("pt-BR")}. A previsão é uma estimativa e depende de aprovação, rematrícula, oferta das disciplinas e regras da instituição.</span>
                </div>
              </div>
              <div className={c.kpis}>
                <div className={c.kpi}><div className={c.kpiV}>{done.length}</div><div className={c.kpiL}>Concluídas</div></div>
                <div className={c.kpi}><div className={c.kpiV}>{now.length}</div><div className={c.kpiL}>Cursando agora</div></div>
                <div className={c.kpi}><div className={c.kpiV} style={{ color: pending.length ? "#b45309" : undefined }}>{pending.length}</div><div className={c.kpiL}>Pendentes</div></div>
                {res && <div className={c.kpi}><div className={c.kpiV}>{res.remainingExtraSlots ?? "—"}</div><div className={c.kpiL}>Vagas adicionais livres</div></div>}
              </div>
            </div>

            {pending.length > 0 && (
              <div className={c.card}>
                <Typography style={{ fontWeight: 700 }}>Disciplinas pendentes</Typography>
                <ul className={c.list}>{pending.map((d, i) => <li key={i}>{d.name}{d.period ? <span className={c.muted}> · {d.period}º período</span> : null}</li>)}</ul>
              </div>
            )}
            {now.length > 0 && (
              <div className={c.card}>
                <Typography style={{ fontWeight: 700 }}>Cursando agora</Typography>
                <ul className={c.list}>{now.map((d, i) => <li key={i}>{d.name}</li>)}</ul>
              </div>
            )}
            {cur.message && (
              <div className={c.card}>
                <Typography style={{ fontWeight: 700 }}>Resumo</Typography>
                <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontFamily: "inherit", fontSize: 14, lineHeight: 1.55 }}>{cur.message}</pre>
              </div>
            )}
          </>
        )}

        <div className={c.card}>
          <Typography style={{ fontWeight: 700 }}>Atualizar o meu extrato</Typography>
          <Typography variant="body2" color="textSecondary">Envie o PDF do extrato ou do histórico escolar (oficial ou simples). Se algo mudou, criamos uma nova versão da sua análise; se é o mesmo documento, nada muda.</Typography>
          <input ref={fileInput} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => upload(e.target.files[0])} />
          <div><Button variant="contained" color="primary" startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <Upload size={16} />} disabled={busy} onClick={() => fileInput.current && fileInput.current.click()}>Enviar PDF</Button></div>
        </div>

        {data.versions.length > 0 && (
          <div className={c.card}>
            <Typography style={{ fontWeight: 700 }}>Histórico da análise</Typography>
            {data.versions.map((v) => (
              <div key={v.id} style={{ borderTop: "1px solid rgba(127,140,160,.25)", paddingTop: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <b>Versão {v.version}</b>{v.isCurrent && <span className={c.chip}><CheckCircle2 size={12} style={{ marginRight: 4, verticalAlign: -2 }} />atual</span>}
                  <span className={c.muted}>{new Date(v.createdAt).toLocaleString("pt-BR")}</span>
                </div>
                <ul className={c.list} style={{ marginTop: 4 }}>{(v.changeSummary || []).map((m, i) => <li key={i} className={c.muted}>{m}</li>)}</ul>
              </div>
            ))}
          </div>
        )}
        {res && res.status === "MANUAL_REVIEW_REQUIRED" && <div className={c.muted}><AlertTriangle size={14} style={{ verticalAlign: -2 }} /> Sua equipe acadêmica ainda precisa conferir alguns dados. Se tiver dúvidas, fale com o seu tutor.</div>}
      </div>

      <Dialog open={pw} onClose={() => setPw(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Trocar a senha</DialogTitle>
        <DialogContent>
          <TextField variant="outlined" margin="dense" fullWidth type="password" label="Senha atual" value={pass.password} onChange={(e) => setPass({ ...pass, password: e.target.value })} autoComplete="current-password" />
          <TextField variant="outlined" margin="dense" fullWidth type="password" label="Nova senha (8 ou mais caracteres)" value={pass.newPassword} onChange={(e) => setPass({ ...pass, newPassword: e.target.value })} autoComplete="new-password" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPw(false)} variant="outlined" color="secondary">Cancelar</Button>
          <Button onClick={changePassword} variant="contained" color="primary" disabled={!pass.password || pass.newPassword.length < 8}>Trocar</Button>
        </DialogActions>
      </Dialog>
      <ToastContainer position="top-right" autoClose={4500} />
    </div>
  );
};

export default Portal;
