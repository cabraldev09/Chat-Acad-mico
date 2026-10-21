import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

import { getBackendUrl } from "../../config";
import logo from "../../assets/logo-cruzeiro-color.svg";

const API = String(getBackendUrl() || "").replace(/\/+$/, "");
const http = axios.create({ baseURL: API });

const FORMAT = {
  EAD: "Você estuda de onde estiver, no seu ritmo.",
  Semipresencial: "Aulas on-line com encontros presenciais no polo.",
  Presencial: "Aulas presenciais no polo.",
  Flex: "Mistura de aulas on-line e presenciais.",
};

// A página segue as Human Interface Guidelines da Apple: fonte do sistema, cores semânticas em claro e escuro, grade de 8 pt, alvos de 44 pt,
// foco visível e movimento reduzido. Os mesmos tokens da Central do Afiliado.
const css = `
.cp-root{--tint:#0b4279;--ink:#1d1d1f;--muted:#6e6e73;--bg:#f2f2f7;--card:#fff;--field:#f2f2f7;--line:rgba(60,60,67,.2);--err:#c4001a;--ok:#1a7f37;--ring:rgba(0,113,227,.55);
  min-height:100vh;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display","Helvetica Neue",Arial,sans-serif;font-size:17px;line-height:1.47;-webkit-font-smoothing:antialiased}
@media (prefers-color-scheme: dark){.cp-root{--ink:#f5f5f7;--muted:#a1a1a6;--bg:#000;--card:#1c1c1e;--field:#2c2c2e;--line:rgba(84,84,88,.6);--err:#ff8a80;--ok:#30d158;--ring:rgba(10,132,255,.75)}}
.cp-root *{box-sizing:border-box}
.cp-root :focus-visible{outline:3px solid var(--ring);outline-offset:2px;border-radius:6px}
.cp-wrap{width:min(960px,100% - 32px);margin:0 auto;padding:24px 0 56px}
.cp-top{display:flex;align-items:center;min-height:56px;margin-bottom:24px}.cp-top img{height:36px;width:auto}
.cp-logo-dark{display:none}
@media (prefers-color-scheme: dark){.cp-logo-light{display:none}.cp-logo-dark{display:block;filter:brightness(0) invert(1)}}
.cp-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:32px;align-items:start}
@media(max-width:820px){.cp-grid{grid-template-columns:1fr}}
.cp-chip{display:block;font-size:14px;font-weight:600;color:var(--muted)}
.cp-h1{font-size:clamp(32px,6vw,52px);line-height:1.07;letter-spacing:-.03em;font-weight:700;margin:8px 0 0}
.cp-lead{font-size:19px;line-height:1.42;margin:16px 0 0;max-width:30em;color:var(--muted)}
.cp-facts{display:flex;gap:8px;flex-wrap:wrap;margin-top:24px}
.cp-fact{border-radius:999px;padding:6px 14px;font-size:14px;font-weight:600;background:var(--card)}
.cp-card{background:var(--card);border-radius:28px;padding:28px}
.cp-card h2{margin:0 0 4px;font-size:24px;letter-spacing:-.02em}
.cp-sub{color:var(--muted);font-size:15px}
.cp-field{display:grid;gap:6px;font-size:15px;font-weight:600;margin-top:16px}
.cp-in{width:100%;min-height:52px;border:2px solid transparent;border-radius:14px;padding:0 16px;font:inherit;font-size:17px;font-weight:400;background:var(--field);color:inherit}
.cp-in::placeholder{color:var(--muted)}
.cp-in:focus-visible{outline:none;border-color:var(--tint);box-shadow:0 0 0 4px var(--ring)}
.cp-in[aria-invalid=true]{border-color:var(--err)}
.cp-fe{min-height:0;color:var(--err);font-size:14px;font-weight:400}
.cp-btn{margin-top:20px;width:100%;min-height:52px;border:0;border-radius:999px;font:inherit;font-weight:600;font-size:17px;cursor:pointer;transition:transform .1s cubic-bezier(.25,.1,.25,1),filter .2s}
.cp-btn:hover{filter:brightness(1.12)}.cp-btn:active{transform:scale(.98)}
.cp-btn:disabled{opacity:.55;cursor:default;filter:none;transform:none}
.cp-consent{display:flex;gap:12px;font-size:14px;margin-top:16px;align-items:flex-start;color:var(--muted);line-height:1.4;font-weight:400}
.cp-consent input{flex:none;width:24px;height:24px;margin:0;accent-color:var(--tint)}
.cp-err{margin-top:16px;background:rgba(215,0,21,.1);color:var(--err);border-radius:14px;padding:12px 16px;font-size:15px}
.cp-ok{text-align:center;padding:16px 8px}.cp-ok h2{font-size:24px;margin:0 0 8px}.cp-ok h2:focus{outline:none}
.cp-ok .tick{width:72px;height:72px;border-radius:50%;margin:0 auto 16px;display:grid;place-items:center;background:rgba(26,127,55,.14);color:var(--ok)}
.cp-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
.cp-skel{border-radius:14px;background:linear-gradient(90deg,var(--card),var(--field),var(--card));background-size:200% 100%;animation:cp-sk 1.4s linear infinite}
@keyframes cp-sk{to{background-position:-200% 0}}
.cp-center{text-align:center;padding-top:96px}.cp-center .cp-btn{width:auto;padding:0 28px}
@media (prefers-reduced-motion: reduce){.cp-root *{animation:none!important;transition:none!important}}
`;

// a button color the text can be read on: white or near black, whichever has more contrast (the color of the form is the company's choice)
const inkOn = (hex) => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return "#fff";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? "#1d1d1f" : "#fff";
};

const maskPhone = (v) => {
  let d = String(v).replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  d = d.slice(0, 11);
  if (!d.length) return "";
  if (d.length < 3) return `(${d}`;
  if (d.length < 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length < 11) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}${d.length > 6 ? `-${d.slice(6)}` : ""}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

// The public page of a course, for the site and the ads. It shows the course (never a price) and takes the contact of whoever
// is interested; the origin of the visit (utm_source, utm_medium, utm_campaign in the address) goes along with the lead, and so does the code of the
// affiliate (?ref=CODE) whose link brought the person here.
const CoursePage = ({ match }) => {
  const slug = match.params.slug;
  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const embed = query.get("embed") === "1";
  const ref = (query.get("ref") || "").trim();
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading");
  const [form, setForm] = useState({ name: "", phone: "", email: "", consent: false, website: "" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const doneRef = useRef(null);
  const nameRef = useRef(null);
  const phoneRef = useRef(null);
  const consentRef = useRef(null);

  const load = useCallback(() => {
    setState("loading");
    http.get(`/public/courses/${slug}`, { params: ref ? { ref } : undefined })
      .then(({ data: d }) => {
        if (!d || !d.course) throw new Error("bad payload");
        setData(d);
        setState("ready");
        document.title = `${d.course.name} · Cruzeiro do Sul Virtual`;
      })
      .catch((err) => setState(err.response && err.response.status === 404 ? "invalid" : "error"));
  }, [slug, ref]);
  useEffect(() => { load(); }, [load]);
  // the address is private to who has it: no search engine keeps a link with a code of an affiliate
  useEffect(() => {
    if (!ref) return undefined;
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex,nofollow";
    document.head.appendChild(meta);
    return () => document.head.removeChild(meta);
  }, [ref]);
  useEffect(() => { if (done && doneRef.current) doneRef.current.focus(); }, [done]);

  const check = () => {
    const e = {};
    if (form.name.trim().length < 2) e.name = "Informe o seu nome.";
    let d = form.phone.replace(/\D/g, "");
    if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
    if (d.length !== 10 && d.length !== 11) e.phone = "Informe o WhatsApp com DDD.";
    if (!form.consent) e.consent = "Aceite o contato para continuar.";
    setErrors(e);
    const first = e.name ? nameRef : e.phone ? phoneRef : e.consent ? consentRef : null;
    if (first && first.current) first.current.focus();
    return !Object.keys(e).length;
  };

  const send = async (e) => {
    e.preventDefault();
    if (!check()) return;
    setBusy(true);
    setError("");
    const utm = {};
    ["utm_source", "utm_medium", "utm_campaign"].forEach((k) => { if (query.get(k)) utm[k] = query.get(k); });
    try {
      const { data: r } = await http.post(`/public/courses/${slug}/lead`, { ...form, ...utm, ...(ref ? { ref } : {}) });
      setDone(r.message || data.thanks);
    } catch (err) {
      setError((err.response && err.response.data && err.response.data.error) || "Não foi possível enviar agora. Confira a internet e tente de novo.");
    }
    setBusy(false);
  };

  if (state === "loading") {
    return (
      <div className="cp-root"><style>{css}</style>
        <div className="cp-wrap" role="status" aria-live="polite" aria-label="Carregando o curso">
          <div className="cp-skel" style={{ height: 36, width: 160, marginBottom: 32 }} />
          <div className="cp-grid"><div><div className="cp-skel" style={{ height: 120 }} /></div><div className="cp-skel" style={{ height: 340 }} /></div>
        </div>
      </div>
    );
  }
  if (state !== "ready") {
    return (
      <div className="cp-root"><style>{css}</style>
        <main className="cp-wrap cp-center">
          <h1 className="cp-h1" style={{ fontSize: 32 }}>{state === "invalid" ? "Este curso não está disponível" : "Não conseguimos abrir agora"}</h1>
          <p className="cp-lead" style={{ margin: "12px auto" }}>{state === "invalid" ? "Ele pode ter saído do ar. Fale com a gente pelo WhatsApp." : "Confira a sua internet e tente de novo."}</p>
          {state === "error" && <button type="button" className="cp-btn" style={{ background: "#0b4279", color: "#fff" }} onClick={load}>Tentar de novo</button>}
        </main>
      </div>
    );
  }
  const c = data.course;
  const color = /^#[0-9a-f]{6}$/i.test(data.color || "") ? data.color : "#0B4279";
  return (
    <div className="cp-root" style={{ "--tint": color }}><style>{css}</style>
      <main className="cp-wrap" style={embed ? { paddingTop: 12 } : undefined}>
        {!embed && <div className="cp-top"><img className="cp-logo-light" src={logo} alt="Cruzeiro do Sul Virtual" draggable={false} /><img className="cp-logo-dark" src={logo} alt="" aria-hidden="true" draggable={false} /></div>}
        <div className="cp-grid">
          <div>
            <span className="cp-chip">{c.category || "Graduação"}</span>
            <h1 className="cp-h1">{c.name}</h1>
            <p className="cp-lead">{FORMAT[c.modality] || "Fale com um consultor e conheça o curso."} Deixe seus dados e um consultor entra em contato para tirar todas as suas dúvidas, sem compromisso.</p>
            <div className="cp-facts">
              {c.modality && <span className="cp-fact">{c.modality}</span>}
              {c.semesters ? <span className="cp-fact">{c.semesters} semestres</span> : null}
            </div>
          </div>
          <div className="cp-card">
            {done ? (
              <div className="cp-ok">
                <div className="tick"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l4.5 4.5L19 7" /></svg></div>
                <h2 ref={doneRef} tabIndex={-1}>Recebemos seus dados!</h2>
                <p className="cp-sub">{done}</p>
              </div>
            ) : (
              <form onSubmit={send} noValidate>
                <h2>Quero saber mais</h2>
                <span className="cp-sub">Um consultor fala com você pelo WhatsApp.</span>
                <div className="cp-field"><label htmlFor="cp-name">Nome</label>
                  <input id="cp-name" ref={nameRef} className="cp-in" required autoComplete="name" value={form.name} aria-invalid={errors.name ? "true" : undefined} aria-describedby="cp-e-name" onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  <span className="cp-fe" id="cp-e-name" role="alert">{errors.name || ""}</span></div>
                <div className="cp-field"><label htmlFor="cp-phone">WhatsApp com DDD</label>
                  <input id="cp-phone" ref={phoneRef} className="cp-in" required type="tel" inputMode="tel" autoComplete="tel" placeholder="(00) 00000-0000" value={form.phone} aria-invalid={errors.phone ? "true" : undefined} aria-describedby="cp-e-phone" onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })} />
                  <span className="cp-fe" id="cp-e-phone" role="alert">{errors.phone || ""}</span></div>
                <div className="cp-field"><label htmlFor="cp-email">E-mail (opcional)</label>
                  <input id="cp-email" className="cp-in" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <input className="cp-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
                <label className="cp-consent"><input ref={consentRef} type="checkbox" checked={form.consent} aria-describedby="cp-e-consent" onChange={(e) => setForm({ ...form, consent: e.target.checked })} /><span>Concordo em receber contato por WhatsApp, e-mail ou telefone sobre cursos, conforme a LGPD.</span></label>
                <span className="cp-fe" id="cp-e-consent" role="alert">{errors.consent || ""}</span>
                {error && <div className="cp-err" role="alert">{error}</div>}
                <button type="submit" className="cp-btn" style={{ background: color, color: inkOn(color) }} disabled={busy}>{busy ? "Enviando…" : "Quero ser contatado"}</button>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default CoursePage;
