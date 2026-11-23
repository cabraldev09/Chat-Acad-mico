import React, { useContext, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Eye, EyeOff, ArrowRight, MessageCircle, Bot, BarChart3, GraduationCap } from "lucide-react";

import BrandLogo from "../../components/BrandLogo";
import BrandStar from "../../components/BrandStar";
import { i18n } from "../../translate/i18n";
import { AuthContext } from "../../context/Auth/AuthContext";
import "./login.css";

// The sign-in screen, after the "Split Login" of 21st.dev (mohammadshehadeh): the brand on a deep navy side with soft lights
// and the chrome star riding its ribbon, and a plain form on the other side. On a phone the brand side becomes a short band with
// the star, and the form sits right under it. Only the e-mail and the password are asked; nothing here talks to an outside service.

const POINTS = [
  [MessageCircle, "WhatsApp, Instagram, Telegram e chat do site numa só caixa"],
  [Bot, "Agentes de IA que qualificam o lead e passam ao consultor"],
  [GraduationCap, "CRM de matrículas, metas dos polos e tutoria dos alunos"],
  [BarChart3, "Estatísticas da equipe em tempo real"],
];

const Login = () => {
  const [user, setUser] = useState({ email: "", password: "" });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const { handleLogin } = useContext(AuthContext);

  const change = (e) => {
    const { name, value } = e.target;
    setUser((u) => ({ ...u, [name]: value }));
  };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await handleLogin(user); } finally { setBusy(false); }
  };

  return (
    <div className="lg-root">
      <section className="lg-brand" aria-label="Chat Acadêmico">
        <div className="lg-dots" aria-hidden="true" />
        <div className="lg-glow lg-glow-a" aria-hidden="true" />
        <div className="lg-glow lg-glow-b" aria-hidden="true" />
        <div className="lg-art" aria-hidden="true"><BrandStar variant="flow" size="100%" float shine /></div>
        <div className="lg-mark" aria-hidden="true"><BrandStar variant="emblem" size={64} float /></div>

        <BrandLogo tone="white" height={46} />

        <div className="lg-copy">
          <span className="lg-kicker">Chat Acadêmico</span>
          <h1>Todos os atendimentos <span>em um só lugar.</span></h1>
          <p>Converse com leads e alunos em todos os canais, deixe a IA cuidar do que se repete e acompanhe cada resultado.</p>
          <ul className="lg-points">
            {POINTS.map(([Icon, text]) => (
              <li key={text}><span aria-hidden="true"><Icon size={16} /></span>{text}</li>
            ))}
          </ul>
        </div>

        <span className="lg-foot">Cruzeiro do Sul Virtual · Educação a distância</span>
      </section>

      <section className="lg-side">
        <form className="lg-card" noValidate onSubmit={submit}>
          <div className="lg-card-head">
            <h2>{i18n.t("login.title")}</h2>
            <p>Acesse o painel de atendimento.</p>
          </div>

          <label className="lg-field" htmlFor="email">
            <span>{i18n.t("login.form.email")}</span>
            <input id="email" name="email" type="email" required autoComplete="email" autoFocus inputMode="email"
              placeholder="nome@exemplo.com" value={user.email} onChange={change} />
          </label>

          <label className="lg-field" htmlFor="password">
            <span>{i18n.t("login.form.password")}</span>
            <span className="lg-pass">
              <input id="password" name="password" type={show ? "text" : "password"} required autoComplete="current-password"
                placeholder="Sua senha" value={user.password} onChange={change} />
              <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Ocultar a senha" : "Mostrar a senha"} aria-pressed={show}>
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>

          <div className="lg-row">
            <RouterLink to="/esqueci-a-senha">Esqueci minha senha</RouterLink>
          </div>

          <button type="submit" className="lg-submit" disabled={busy}>
            {busy ? "Entrando..." : i18n.t("login.buttons.submit")}
            {!busy && <ArrowRight size={18} aria-hidden="true" />}
          </button>

          <p className="lg-note">Acesso restrito à equipe. Alunos entram pelo portal do aluno.</p>
        </form>
      </section>
    </div>
  );
};

export default Login;
