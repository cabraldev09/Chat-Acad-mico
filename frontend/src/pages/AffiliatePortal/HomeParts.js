import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode.react";
import { Download, Eye, GraduationCap, MessageCircle, QrCode, Share2, UserPlus, Wallet, X } from "lucide-react";

import NumberTicker from "../../components/NumberTicker";
import { CopyButton } from "./shared";
import { ArtCanvas } from "./ArtMaker";
import { PHRASES } from "./promoContent";

const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// the QR Code of her link, big, with a button to save it as an image
const QrSheet = ({ link, nome, onClose }) => {
  const box = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const save = () => {
    const canvas = box.current && box.current.querySelector("canvas");
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "qr-code-indicacao.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  return (
    <div className="ca-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ca-sheet ca-qr" role="dialog" aria-modal="true" aria-label="QR Code do seu link">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>Seu QR Code</h2>
          <button type="button" className="ca-btn is-ghost" onClick={onClose} aria-label="Fechar" autoFocus><X size={16} /></button>
        </div>
        <p className="ca-help">Quem apontar a câmera do celular abre o seu link de indicação{nome ? `, ${nome}` : ""}. Imprima, coloque no seu story ou mostre na tela.</p>
        <div className="ca-qr-box" ref={box}>
          <QRCode value={link} size={512} level="M" includeMargin fgColor="#0b1a2e" bgColor="#ffffff" style={{ width: "100%", height: "auto" }} />
        </div>
        <div className="ca-actions" style={{ justifyContent: "space-between" }}>
          <CopyButton text={link} label="Copiar link" ok="Link copiado!" />
          <button type="button" className="ca-btn is-primary" onClick={save}><Download size={16} /> Baixar QR Code</button>
        </div>
      </div>
    </div>
  );
};

// the link, with every way to pass it on
export const ShareBar = ({ link, nome }) => {
  const [qr, setQr] = useState(false);
  const text = `Quer estudar com a gente? Peça informações por este link: ${link}`;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  return (
    <section className="ca-link">
      <div><strong>Seu link de indicação</strong><code>{link}</code></div>
      <div className="ca-link-actions">
        <CopyButton text={link} label="Copiar link" ok="Link copiado!" />
        <a className="ca-btn is-wa" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} /> Enviar no WhatsApp</a>
        {canShare && (
          <button type="button" className="ca-btn" onClick={() => { navigator.share({ title: "Cruzeiro do Sul Virtual", text: "Quer estudar com a gente?", url: link }).catch(() => undefined); }}><Share2 size={16} /> Compartilhar</button>
        )}
        <button type="button" className="ca-btn" onClick={() => setQr(true)}><QrCode size={16} /> QR Code</button>
      </div>
      {qr && <QrSheet link={link} nome={nome} onClose={() => setQr(false)} />}
    </section>
  );
};

const pct = (part, whole) => (whole > 0 && part <= whole ? Math.round((part / whole) * 100) : null);

// her numbers in one clean strip right under the title: opened the link, referred, enrolled, and what she earns
export const Funnel = ({ stats }) => {
  const clicks = stats.clicks || null;
  const opened = clicks ? clicks.unique : 0;
  const items = [
    { key: "opened", Icon: Eye, tone: "sky", value: opened, label: "abriram o link", note: clicks && clicks.last7 ? `${clicks.last7} nos últimos 7 dias` : "" },
    { key: "referred", Icon: UserPlus, tone: "blue", value: stats.referrals, label: stats.referrals === 1 ? "indicada" : "indicadas", note: opened && stats.referrals ? `${pct(stats.referrals, opened) ?? "—"}% de quem abriu` : "" },
    { key: "enrolled", Icon: GraduationCap, tone: "green", value: stats.enrolled, label: stats.enrolled === 1 ? "matrícula" : "matrículas", note: stats.referrals ? `${stats.conversion}% das indicações` : "" },
  ];
  const empty = (!clicks || clicks.total === 0) && stats.referrals === 0;
  return (
    <section className="ha-stats" aria-label="Sua produção">
      <dl>
        {items.map(({ key, Icon, tone, value, label, note }) => (
          <div key={key} className={`ha-stat is-${tone}`}>
            <dt><Icon size={15} /> {label}</dt>
            <dd><NumberTicker value={value} /></dd>
            {note && <small>{note}</small>}
          </div>
        ))}
        <div className="ha-stat is-gold">
          <dt><Wallet size={15} /> a receber</dt>
          <dd><NumberTicker value={stats.bonusPending} format={brl} /></dd>
          <small>Já recebido: {brl(stats.bonusPaid)}</small>
        </div>
      </dl>
      {empty && <p className="ha-stats-empty">Seu link ainda não foi usado: copie uma mensagem pronta mais abaixo e envie. Cada pessoa que abrir o link aparece aqui.</p>}
    </section>
  );
};

// her card, ready: the same art she can personalize and download below
export const HeroCard = ({ nome, link }) => {
  const scroll = () => { const el = document.getElementById("ca-arte"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); };
  return (
    <div className="ca-hero-card">
      <ArtCanvas format="feed" theme="azul" phrase={PHRASES[1]} curso="" nome={nome} link={link} className="ca-hero-canvas" />
      <button type="button" className="ca-text-link" onClick={scroll}>Personalizar e baixar o seu cartão</button>
    </div>
  );
};
