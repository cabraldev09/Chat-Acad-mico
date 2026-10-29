import React, { useEffect } from "react";
import { Link } from "react-router-dom";

import { SITE, contactHref, hasContact } from "./config";

export const css = `
.st-root{min-height:100vh;background:#fff;color:#0f1d33;font-family:"Geist",system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;line-height:1.55}
.st-root *{box-sizing:border-box}
.st-root a{color:inherit}
.st-wrap{width:min(1120px,100% - 40px);margin:0 auto}
.st-head{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.92);backdrop-filter:blur(8px);border-bottom:1px solid #e6ebf2}
.st-nav{display:flex;align-items:center;gap:28px;height:68px}
.st-brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:18px;letter-spacing:-.02em;text-decoration:none}
.st-mark{width:30px;height:30px;border-radius:9px;background:#0b4279;display:grid;place-items:center}
.st-links{display:flex;gap:24px;font-size:15px;margin-left:12px}
.st-links a{text-decoration:none;color:#44546b}.st-links a:hover{color:#0f1d33}
.st-sp{flex:1}
.st-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:12px;padding:12px 20px;font:inherit;font-weight:600;font-size:15px;text-decoration:none;border:1px solid transparent;cursor:pointer;white-space:nowrap}
.st-btn.p{background:#0b4279;color:#fff!important}.st-btn.p:hover{background:#093563}
.st-btn.s{background:#fff;border-color:#cfd8e4;color:#0f1d33}.st-btn.s:hover{background:#f4f7fb}
.st-btn.sm{padding:9px 16px;font-size:14px}
@media(max-width:860px){.st-links{display:none}.st-nav{gap:12px}}
@media(max-width:480px){.st-nav .st-btn.s{display:none}}
.st-foot{background:#0f1d33;color:#c6d1e0;margin-top:96px;padding:56px 0 36px;font-size:14.5px}
.st-foot a{text-decoration:none}.st-foot a:hover{color:#fff}
.st-fgrid{display:grid;grid-template-columns:1.6fr 1fr 1fr;gap:40px}
@media(max-width:760px){.st-fgrid{grid-template-columns:1fr;gap:28px}}
.st-foot h4{margin:0 0 12px;color:#fff;font-size:14px;letter-spacing:.02em}
.st-foot ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.st-fine{margin-top:36px;padding-top:20px;border-top:1px solid #243756;font-size:13px;color:#8fa1ba}
`;

const Mark = () => (
  <span className="st-mark" aria-hidden="true">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
  </span>
);

// the page title and description of each public page (the crawlers of the ads and of the review read them)
export const useMeta = (title, description) => {
  useEffect(() => {
    const prev = document.title;
    document.title = title;
    let tag = document.querySelector('meta[name="description"]');
    const created = !tag;
    if (!tag) { tag = document.createElement("meta"); tag.setAttribute("name", "description"); document.head.appendChild(tag); }
    const before = tag.getAttribute("content");
    tag.setAttribute("content", description);
    return () => { document.title = prev; if (created) tag.remove(); else tag.setAttribute("content", before || ""); };
  }, [title, description]);
};

const SiteShell = ({ children }) => (
  <div className="st-root">
    <style>{css}</style>
    <header className="st-head">
      <div className="st-wrap st-nav">
        <Link to="/site" className="st-brand"><Mark />{SITE.name}</Link>
        <nav className="st-links" aria-label="Principal">
          <a href="/site#recursos">Recursos</a>
          <a href="/site#como-funciona">Como funciona</a>
          <a href="/site#seguranca">Segurança</a>
          <a href="/site#perguntas">Perguntas</a>
        </nav>
        <span className="st-sp" />
        <Link to="/login" className="st-btn s sm">Entrar</Link>
        <a href={contactHref()} className="st-btn p sm">Solicitar demonstração</a>
      </div>
    </header>
    {children}
    <footer className="st-foot">
      <div className="st-wrap">
        <div className="st-fgrid">
          <div>
            <div className="st-brand" style={{ color: "#fff", marginBottom: 12 }}><Mark />{SITE.name}</div>
            <p style={{ margin: 0, maxWidth: 380 }}>Atendimento, CRM e assistente virtual para instituições de ensino que recebem alunos pelo WhatsApp, Instagram, Messenger e Telegram.</p>
          </div>
          <div>
            <h4>Produto</h4>
            <ul>
              <li><a href="/site#recursos">Recursos</a></li>
              <li><a href="/site#como-funciona">Como funciona</a></li>
              <li><a href="/site#perguntas">Perguntas frequentes</a></li>
              <li><Link to="/login">Entrar no sistema</Link></li>
            </ul>
          </div>
          <div>
            <h4>Legal e contato</h4>
            <ul>
              <li><Link to="/privacidade">Política de Privacidade</Link></li>
              <li><Link to="/termos">Termos de Uso</Link></li>
              <li><Link to="/exclusao-de-dados">Exclusão de dados</Link></li>
              {hasContact && <li><a href={contactHref("Contato")}>{SITE.email || "Falar no WhatsApp"}</a></li>}
            </ul>
          </div>
        </div>
        <div className="st-fine">
          © {new Date().getFullYear()} {SITE.company || SITE.name}{SITE.cnpj ? ` · CNPJ ${SITE.cnpj}` : ""}. WhatsApp, Instagram e Messenger são marcas da Meta Platforms, Inc.; o {SITE.name} é um produto independente, sem vínculo com a Meta.
        </div>
      </div>
    </footer>
  </div>
);

export default SiteShell;
