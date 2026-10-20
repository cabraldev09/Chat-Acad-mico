import React, { useState, useContext, useRef } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Button, TextField, Typography, InputAdornment, IconButton, Link } from "@material-ui/core";
import { makeStyles, useTheme } from "@material-ui/core/styles";
import { Visibility, VisibilityOff } from "@material-ui/icons";
import { Bot, Megaphone, BarChart3, MessageCircle, Check } from "lucide-react";
import { WhatsAppBrand } from "../../icons/brands";
import BrandLogo from "../../components/BrandLogo";
import BrandStar from "../../components/BrandStar";

import { i18n } from "../../translate/i18n";
import { AuthContext } from "../../context/Auth/AuthContext";

const useStyles = makeStyles((theme) => ({
  root: {
    display: "grid",
    minHeight: "100vh",
    gridTemplateColumns: "1.05fr 1fr",
    backgroundColor: theme.palette.background.default,
    [theme.breakpoints.down("sm")]: { gridTemplateColumns: "1fr", gridTemplateRows: "auto 1fr" },
  },
  hero: {
    position: "relative",
    overflow: "hidden",
    isolation: "isolate",
    color: "#fff",
    padding: theme.spacing(6),
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    background: "linear-gradient(155deg, #0B4279 0%, #08305a 55%, #061f3b 100%)",
    [theme.breakpoints.down("sm")]: { padding: "20px 20px 0", height: 200, justifyContent: "flex-start", gap: 12 },
  },
  grid: {
    position: "absolute",
    inset: 0,
    zIndex: -2,
    backgroundImage: "radial-gradient(rgba(255,255,255,0.18) 1px, transparent 1px)",
    backgroundSize: "26px 26px",
    maskImage: "radial-gradient(ellipse 80% 70% at 40% 40%, #000 30%, transparent 75%)",
    WebkitMaskImage: "radial-gradient(ellipse 80% 70% at 40% 40%, #000 30%, transparent 75%)",
  },
  blob: { position: "absolute", borderRadius: "50%", filter: "blur(70px)", zIndex: -1, animation: "aurora 14s ease-in-out infinite" },
  spot: {
    position: "absolute",
    inset: 0,
    zIndex: -1,
    pointerEvents: "none",
    background: "radial-gradient(420px circle at var(--mx, 30%) var(--my, 30%), rgba(6,147,227,0.28), transparent 70%)",
    transition: "background .1s",
  },
  logo: { height: 30, width: "auto", alignSelf: "flex-start" },
  // the large star rides the lower right corner of the dark side, behind the text and half cut by the edge
  art: { position: "absolute", right: "-8%", bottom: "-9%", width: "clamp(230px, 28vw, 440px)", zIndex: -1, pointerEvents: "none", opacity: 0.98, animation: "page-in .9s var(--ease-out) both", "@media (max-width: 1199px)": { display: "none" },
    "@media (max-width: 959px)": { display: "block", width: 150, right: "-6%", bottom: "-4%", opacity: 0.95 } },
  headline: { fontSize: 40, lineHeight: 1.1, fontWeight: 600, letterSpacing: "-0.03em", maxWidth: 460, margin: 0, [theme.breakpoints.down("sm")]: { fontSize: 22, maxWidth: "62%" } },
  sub: {
    [theme.breakpoints.down("sm")]: { display: "none" }, marginTop: theme.spacing(2), color: "rgba(255,255,255,0.72)", maxWidth: 420, fontSize: 16, lineHeight: 1.55 },
  features: { display: "grid", gap: theme.spacing(1.5), marginTop: theme.spacing(4), maxWidth: 440, [theme.breakpoints.down("sm")]: { display: "none" } },
  feature: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1.5),
    padding: theme.spacing(1.25, 1.5),
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    // dark glass: the text stays readable when the star passes behind it
    background: "rgba(6,31,59,0.58)",
    backdropFilter: "blur(10px)",
    fontSize: 14.5,
    transition: "transform .25s var(--ease-out), background .25s",
    "&:hover": { transform: "translateX(4px)", background: "rgba(10,48,92,0.7)" },
    "& svg": { color: "#fef84c", flex: "none" },
    animation: "slide-in-left .6s var(--ease-out) both",
  },
  bubbles: {
    position: "absolute",
    right: 28,
    top: "7%",
    width: 250,
    display: "grid",
    gap: 12,
    transform: "rotate(-3deg)",
    animation: "float-slow 7s ease-in-out infinite",
    "@media (max-width: 1280px)": { display: "none" },
  },
  bubble: {
    padding: "10px 14px",
    borderRadius: "16px 16px 16px 4px",
    background: "rgba(255,255,255,0.95)",
    color: "#0a2a4d",
    fontSize: 13.5,
    boxShadow: "0 12px 30px -10px rgba(0,0,0,.45)",
    animation: "pop-in .5s var(--ease-spring) both",
  },
  bubbleMine: { marginLeft: 36, borderRadius: "16px 16px 4px 16px", background: "#fef84c", color: "#0a2a4d" },
  formSide: { display: "grid", placeItems: "center", padding: theme.spacing(3), [theme.breakpoints.down("sm")]: { display: "block", padding: "0 16px 28px", background: theme.palette.type === "dark" ? "#0f1520" : "#eaf1f9" } },
  card: {
    width: "100%",
    maxWidth: 400,
    padding: theme.spacing(4),
    borderRadius: 18,
    background: theme.palette.cards.background,
    border: theme.border.divider,
    boxShadow: "0 24px 60px -24px rgba(11,66,121,.28)",
    animation: "page-in .5s var(--ease-out) both",
    [theme.breakpoints.down("sm")]: { position: "relative", zIndex: 2, margin: "-28px auto 0", padding: theme.spacing(2.75, 2.5, 2.5), borderRadius: 22, boxShadow: "0 22px 46px -18px rgba(11,66,121,.45), 0 2px 6px rgba(11,66,121,.10)" },
  },
  mobileLogo: { margin: "0 auto", marginBottom: theme.spacing(3), display: "none" },
  title: { fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em" },
  subtitle: { color: theme.palette.text.secondary, marginTop: 4, marginBottom: theme.spacing(3) },
  submit: { marginTop: theme.spacing(3), height: 44, fontSize: 15 },
  foot: { marginTop: theme.spacing(2.5), textAlign: "center", fontSize: 14, color: theme.palette.text.secondary },
}));

const FEATURES = [
  [MessageCircle, "WhatsApp, Telegram, Instagram e chat web numa só caixa"],
  [Bot, "Chatbot e agentes de IA respondendo por você"],
  [Megaphone, "Campanhas, agendamentos e etiquetas"],
  [BarChart3, "Estatísticas e monitor em tempo real"],
];

const Login = () => {
  const classes = useStyles();
  const theme = useTheme();
  const heroRef = useRef(null);

  const [user, setUser] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const { handleLogin } = useContext(AuthContext);

  const onMove = (e) => {
    const r = heroRef.current.getBoundingClientRect();
    heroRef.current.style.setProperty("--mx", `${e.clientX - r.left}px`);
    heroRef.current.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  const handleChangeInput = (e) => setUser({ ...user, [e.target.name]: e.target.value });
  const handlSubmit = (e) => {
    e.preventDefault();
    handleLogin(user);
  };


  return (
    <div className={classes.root}>
      <section className={classes.hero} ref={heroRef} onMouseMove={onMove}>
        <div className={classes.grid} />
        <div className={classes.blob} style={{ width: 420, height: 420, left: -120, top: -80, background: "#0693E3", opacity: 0.45 }} />
        <div className={classes.blob} style={{ width: 300, height: 300, right: -60, bottom: -40, background: "#FEF84C", opacity: 0.16, animationDelay: "-6s" }} />
        <div className={classes.spot} />
        <div className={classes.art} aria-hidden>
          <BrandStar variant="flow" size="100%" float shine />
        </div>

        <BrandLogo tone="white" height={52} />

        <div className={classes.bubbles} aria-hidden>
          <div className={classes.bubble} style={{ animationDelay: ".4s" }}>Oi! Preciso da segunda via do boleto 🙏</div>
          <div className={`${classes.bubble} ${classes.bubbleMine}`} style={{ animationDelay: ".9s" }}>Claro! Já te envio por aqui mesmo.</div>
          <div className={classes.bubble} style={{ animationDelay: "1.4s", display: "flex", alignItems: "center", gap: 6 }}>
            <WhatsAppBrand size={16} /> WhatsApp · <Check size={14} /> resolvido
          </div>
        </div>

        <div>
          <h1 className={classes.headline}>Todos os atendimentos em um só lugar.</h1>
          <p className={classes.sub}>Converse com seus clientes em vários canais, automatize o que se repete e acompanhe tudo em tempo real.</p>
          <div className={classes.features}>
            {FEATURES.map(([Icon, text], i) => (
              <div key={text} className={classes.feature} style={{ animationDelay: `${0.15 + i * 0.09}s` }}>
                <Icon size={18} />
                {text}
              </div>
            ))}
          </div>
        </div>
        <span />
      </section>

      <section className={classes.formSide}>
        <div className="beam" style={{ width: "100%", maxWidth: 400 }}>
          <form className={classes.card} noValidate onSubmit={handlSubmit}>
            <BrandLogo tone={theme.palette.type === "dark" ? "white" : "color"} height={64} className={classes.mobileLogo} />
            <Typography component="h1" className={classes.title}>{i18n.t("login.title")}</Typography>
            <Typography className={classes.subtitle}>Acesse o painel de atendimento.</Typography>
            <TextField
              variant="outlined"
              margin="dense"
              required
              fullWidth
              id="email"
              label={i18n.t("login.form.email")}
              name="email"
              value={user.email}
              onChange={handleChangeInput}
              autoComplete="email"
              autoFocus
            />
            <TextField
              variant="outlined"
              margin="dense"
              required
              fullWidth
              name="password"
              label={i18n.t("login.form.password")}
              id="password"
              value={user.password}
              onChange={handleChangeInput}
              autoComplete="current-password"
              type={showPassword ? "text" : "password"}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      aria-label="mostrar ou ocultar senha"
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Button type="submit" fullWidth variant="contained" color="primary" className={classes.submit}>
              {i18n.t("login.buttons.submit")}
            </Button>
            <div className={classes.foot}>
              <Link component={RouterLink} to="/esqueci-a-senha" underline="always" style={{ display: "block", marginBottom: 8 }}>
                Esqueci minha senha
              </Link>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
};

export default Login;
