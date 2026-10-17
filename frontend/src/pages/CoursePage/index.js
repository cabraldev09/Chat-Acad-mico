import React, { useEffect, useMemo, useState } from "react";
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

const css = `
.cp-root{min-height:100vh;background:#f5f8fc;color:#0b1a2e;font-family:"Geist",system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
@media (prefers-color-scheme: dark){.cp-root{background:#08111e;color:#eaf1fb}.cp-card{background:#0f1b2d!important;border-color:#1b2b44!important}.cp-in{background:#08111e!important;color:#eaf1fb!important;border-color:#1b2b44!important}.cp-muted{color:#93a6bf!important}}
.cp-wrap{width:min(960px,100% - 32px);margin:0 auto;padding:28px 0 48px}
.cp-top{display:flex;align-items:center;gap:12px;margin-bottom:28px}.cp-top img{height:32px}
@media (prefers-color-scheme: dark){.cp-top img{filter:brightness(0) invert(1)}}
.cp-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:28px;align-items:start}
@media(max-width:820px){.cp-grid{grid-template-columns:1fr}}
.cp-chip{display:inline-block;font-size:12.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#0693e3}
.cp-h1{font-size:clamp(32px,6vw,54px);line-height:1.04;letter-spacing:-.04em;font-weight:700;margin:12px 0 0}
.cp-lead{font-size:17px;line-height:1.55;margin:16px 0 0;max-width:520px}
.cp-muted{color:#5d6f86}
.cp-facts{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}
.cp-fact{border:1px solid #e1e8f1;border-radius:999px;padding:6px 14px;font-size:14px;font-weight:600;background:#fff}
@media (prefers-color-scheme: dark){.cp-fact{background:#0f1b2d;border-color:#1b2b44}}
.cp-card{background:#fff;border:1px solid #e1e8f1;border-radius:22px;padding:24px;box-shadow:0 18px 40px -26px rgba(11,66,121,.45)}
.cp-card h2{margin:0 0 4px;font-size:22px;letter-spacing:-.02em}
.cp-field{display:grid;gap:6px;font-size:13.5px;font-weight:600;margin-top:14px}
.cp-in{border:1px solid #d6dfeb;border-radius:12px;padding:12px;font:inherit;font-weight:400;background:#fff;color:inherit}
.cp-in:focus-visible{outline:2px solid #0693e3;outline-offset:1px}
.cp-btn{margin-top:18px;width:100%;border:0;border-radius:14px;padding:14px;font:inherit;font-weight:700;font-size:16px;color:#fff;cursor:pointer}
.cp-btn:disabled{opacity:.6;cursor:default}
.cp-consent{display:flex;gap:10px;font-size:13px;margin-top:14px;align-items:flex-start}
.cp-err{margin-top:12px;background:rgba(220,38,38,.12);color:#dc2626;border-radius:12px;padding:10px 12px;font-size:14px}
.cp-ok{text-align:center;padding:24px 8px}.cp-ok b{display:block;font-size:22px;margin-bottom:8px}
.cp-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
`;

// The public page of a course, for the site and the ads. It shows the course (never a price) and takes the contact of whoever
// is interested; the origin of the visit (utm_source, utm_medium, utm_campaign in the address) goes along with the lead.
const CoursePage = ({ match }) => {
  const slug = match.params.slug;
  const embed = useMemo(() => new URLSearchParams(window.location.search).get("embed") === "1", []);
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading");
  const [form, setForm] = useState({ name: "", phone: "", email: "", consent: false, website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    http.get(`/public/courses/${slug}`)
      .then(({ data: d }) => { if (!d || !d.course) throw new Error("bad payload"); setData(d); setState("ready"); document.title = `${d.course.name} · Cruzeiro do Sul Virtual`; })
      .catch((err) => setState(err.response && err.response.status === 404 ? "invalid" : "error"));
  }, [slug]);

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const q = new URLSearchParams(window.location.search);
    const utm = {};
    ["utm_source", "utm_medium", "utm_campaign"].forEach((k) => { if (q.get(k)) utm[k] = q.get(k); });
    try {
      const { data: r } = await http.post(`/public/courses/${slug}/lead`, { ...form, ...utm });
      setDone(r.message || data.thanks);
    } catch (err) {
      setError((err.response && err.response.data && err.response.data.error) || "Não foi possível enviar agora. Tente de novo.");
    }
    setBusy(false);
  };

  if (state === "loading") return <div className="cp-root"><style>{css}</style></div>;
  if (state !== "ready") {
    return (
      <div className="cp-root"><style>{css}</style>
        <div className="cp-wrap" style={{ textAlign: "center", paddingTop: 80 }}>
          <h1 className="cp-h1" style={{ fontSize: 32 }}>{state === "invalid" ? "Este curso não está disponível" : "Não conseguimos abrir agora"}</h1>
          <p className="cp-lead cp-muted" style={{ margin: "12px auto" }}>{state === "invalid" ? "Ele pode ter saído do ar. Fale com a gente pelo WhatsApp." : "Confira sua internet e tente de novo em instantes."}</p>
        </div>
      </div>
    );
  }
  const c = data.course;
  const color = data.color || "#0B4279";
  return (
    <div className="cp-root"><style>{css}</style>
      <div className="cp-wrap" style={embed ? { paddingTop: 12 } : undefined}>
        {!embed && <div className="cp-top"><img src={logo} alt="Cruzeiro do Sul Virtual" draggable={false} /></div>}
        <div className="cp-grid">
          <div>
            <span className="cp-chip">{c.category || "Graduação"}</span>
            <h1 className="cp-h1">{c.name}</h1>
            <p className="cp-lead cp-muted">{FORMAT[c.modality] || "Fale com um consultor e conheça o curso."} Deixe seus dados e um consultor entra em contato para tirar todas as suas dúvidas, sem compromisso.</p>
            <div className="cp-facts">
              {c.modality && <span className="cp-fact">{c.modality}</span>}
              {c.semesters ? <span className="cp-fact">{c.semesters} semestres</span> : null}
            </div>
          </div>
          <div className="cp-card">
            {done ? (
              <div className="cp-ok"><b>Recebemos seus dados!</b><span className="cp-muted">{done}</span></div>
            ) : (
              <form onSubmit={send}>
                <h2>Quero saber mais</h2>
                <span className="cp-muted" style={{ fontSize: 14 }}>Um consultor fala com você pelo WhatsApp.</span>
                <label className="cp-field">Nome<input className="cp-in" required autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
                <label className="cp-field">WhatsApp com DDD<input className="cp-in" required inputMode="tel" autoComplete="tel" placeholder="(69) 99999-0000" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
                <label className="cp-field">E-mail (opcional)<input className="cp-in" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
                <input className="cp-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
                <label className="cp-consent"><input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} /> Concordo em receber contato por WhatsApp, e-mail ou telefone sobre cursos, conforme a LGPD.</label>
                {error && <div className="cp-err">{error}</div>}
                <button type="submit" className="cp-btn" style={{ background: color }} disabled={busy || !form.consent}>{busy ? "Enviando..." : "Quero ser contatado"}</button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CoursePage;
