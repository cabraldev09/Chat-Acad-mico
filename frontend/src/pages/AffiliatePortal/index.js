import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import {
  Copy, Download, Send, Search, Image as ImageIcon, Video, FileText, BookOpen, GraduationCap, Megaphone,
  Users, X, Check, ExternalLink, Play, Link2, Clock, MessageCircle, UserPlus, Gift, Lock, Layers, Type, Paperclip,
} from "lucide-react";

import { getBackendUrl } from "../../config";
import NumberTicker from "../../components/NumberTicker";
import "./portal.css";

// Public portal: no login, no cookies. The token in the address is the access.
const API = String(getBackendUrl() || "").replace(/\/+$/, "");
const http = axios.create({ baseURL: API });

const KIND = {
  banner: { label: "Banner", Icon: ImageIcon },
  copy: { label: "Texto pronto", Icon: Type },
  video: { label: "Vídeo", Icon: Video },
  course_info: { label: "Sobre o curso", Icon: BookOpen },
  course_list: { label: "Lista de cursos", Icon: Layers },
  campaign: { label: "Campanha", Icon: Megaphone },
  other: { label: "Material", Icon: Paperclip },
};

const FORMAT_NOTE = {
  EAD: "Estuda de onde estiver, no seu ritmo.",
  Semipresencial: "Aulas on-line com encontros presenciais no polo.",
  Presencial: "Aulas presenciais no polo.",
  Flex: "Mistura de aulas on-line e presenciais.",
};

const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const day = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "");
const sizeOf = (b) => (!b ? "" : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

const copyText = async (text, ok = "Copiado!") => {
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
    else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    toast.success(ok);
    return true;
  } catch (e) {
    toast.error("Não foi possível copiar. Selecione o texto e copie à mão.");
    return false;
  }
};

const youtubeEmbed = (url) => {
  const m = String(url || "").match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
};

// button that confirms the copy for a moment
const CopyButton = ({ text, label = "Copiar texto", ok, className = "ap-btn" }) => {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`${className}${done ? " is-done" : ""}`}
      onClick={async () => {
        if (await copyText(text, ok)) {
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        }
      }}
    >
      {done ? <Check size={16} /> : <Copy size={16} />}
      {done ? "Copiado" : label}
    </button>
  );
};

const ReferralSheet = ({ token, courses, presetCourse, onClose, onDone }) => {
  const [form, setForm] = useState({ name: "", phone: "", courseId: presetCourse || "", consent: false, website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { data } = await http.post(`/affiliate-portal/${token}/referrals`, { ...form, courseId: form.courseId || undefined });
      toast.success(data.message);
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || "Não foi possível enviar. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ap-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="presentation">
      <form className="ap-sheet" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="ap-ind-title">
        <h2 id="ap-ind-title">Indicar alguém</h2>
        <p className="ap-help">Seu consultor entra em contato com a pessoa e você acompanha aqui.</p>
        {error && <div className="ap-error" role="alert">{error}</div>}
        <label className="ap-field">Nome de quem você indica
          <input value={form.name} onChange={set("name")} required minLength={2} autoComplete="off" autoFocus />
        </label>
        <label className="ap-field">WhatsApp com DDD
          <input value={form.phone} onChange={set("phone")} required inputMode="tel" placeholder="(69) 99999-0000" autoComplete="off" />
        </label>
        <label className="ap-field">Curso de interesse (se souber)
          <select value={form.courseId} onChange={set("courseId")}>
            <option value="">Ainda não sei</option>
            {courses.map((g) => (
              <optgroup key={g.modality} label={g.modality}>
                {g.courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <input className="ap-hp" tabIndex={-1} aria-hidden="true" autoComplete="off" value={form.website} onChange={set("website")} />
        <label className="ap-consent">
          <input type="checkbox" checked={form.consent} onChange={set("consent")} required />
          Essa pessoa sabe da indicação e aceita receber contato por WhatsApp, e-mail ou telefone.
        </label>
        <div className="ap-actions">
          <button type="button" className="ap-btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="ap-btn is-primary" disabled={busy || !form.consent}>
            <Send size={16} /> {busy ? "Enviando..." : "Enviar indicação"}
          </button>
        </div>
      </form>
    </div>
  );
};

const MaterialCard = ({ token, m }) => {
  const kind = KIND[m.kind] || KIND.other;
  const fileUrl = `${API}/affiliate-portal/${token}/files/${m.id}`;
  const isImage = m.hasFile && /^image\//.test(m.mimeType || "");
  const isVideoFile = m.hasFile && /^video\//.test(m.mimeType || "");
  const embed = m.externalUrl && youtubeEmbed(m.externalUrl);

  return (
    <article className="ap-card">
      <div className="ap-media">
        <span className="ap-kind"><kind.Icon size={13} /> {kind.label}</span>
        {isImage && <img src={`${fileUrl}?preview=1`} alt={m.title} loading="lazy" />}
        {isVideoFile && <video src={`${fileUrl}?preview=1`} controls preload="metadata" />}
        {!isImage && !isVideoFile && embed && <iframe src={embed} title={m.title} loading="lazy" allowFullScreen />}
        {!isImage && !isVideoFile && !embed && <kind.Icon size={44} strokeWidth={1.5} />}
      </div>
      <div className="ap-body">
        <h3>{m.title}</h3>
        {m.description && <p>{m.description}</p>}
        {m.copyText && <div className="ap-copy">{m.copyText}</div>}
        {m.course && <span className="ap-tag"><GraduationCap size={13} /> {m.course.name}</span>}
        <div className="ap-foot">
          {m.copyText && <CopyButton text={m.copyText} className="ap-btn is-primary" />}
          {m.hasFile && (
            <a className="ap-btn" href={`${fileUrl}?download=1`} download>
              <Download size={16} /> Baixar {m.fileSize ? <small style={{ fontWeight: 400 }}>({sizeOf(m.fileSize)})</small> : null}
            </a>
          )}
          {m.externalUrl && (
            <a className="ap-btn" href={m.externalUrl} target="_blank" rel="noopener noreferrer">
              {embed ? <Play size={16} /> : <ExternalLink size={16} />} {embed ? "Abrir no YouTube" : "Abrir link"}
            </a>
          )}
        </div>
      </div>
    </article>
  );
};

const daysLeft = (end) => {
  if (!end) return null;
  const d = Math.ceil((new Date(end) - new Date()) / 86400000);
  if (d < 0) return null;
  return d === 0 ? "termina hoje" : d === 1 ? "termina amanhã" : `termina em ${d} dias`;
};

const AffiliatePortal = ({ match }) => {
  const token = match.params.token;
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading");
  const [tab, setTab] = useState(0);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [format, setFormat] = useState("");
  const [sheet, setSheet] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data: d } = await http.get(`/affiliate-portal/${token}`);
      setData(d);
      setFormat((f) => f || (d.courses[0] ? d.courses[0].modality : ""));
      setState("ready");
    } catch (err) {
      setState(err.response?.status === 404 ? "invalid" : "error");
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (data) document.title = `${data.title} · ${data.affiliate.firstName}`;
  }, [data]);

  const kinds = useMemo(() => {
    const set = new Set((data?.materials || []).map((m) => m.kind));
    return [...set];
  }, [data]);

  const materials = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.materials || []).filter(
      (m) => (kind === "all" || m.kind === kind) &&
        (!q || `${m.title} ${m.description || ""} ${m.copyText || ""} ${m.course?.name || ""}`.toLowerCase().includes(q))
    );
  }, [data, query, kind]);

  if (state === "loading") {
    return (
      <div className="ap-root">
        <div className="ap-hero"><div className="ap-wrap"><div className="ap-skel" style={{ height: 110, opacity: 0.25 }} /></div></div>
        <div className="ap-wrap" style={{ marginTop: -40 }}><div className="ap-skel" style={{ height: 90 }} /></div>
      </div>
    );
  }

  if (state !== "ready") {
    return (
      <div className="ap-root">
        <div className="ap-center">
          <div className="ap-box">
            <Lock size={40} color="#0693E3" />
            <h1>{state === "invalid" ? "Este link não está disponível" : "Não conseguimos abrir agora"}</h1>
            <p>
              {state === "invalid"
                ? "Ele pode ter sido trocado ou pausado. Peça um link novo ao seu consultor."
                : "Confira sua internet e tente de novo em instantes."}
            </p>
            {state === "error" && <button type="button" className="ap-btn is-primary" style={{ marginTop: 16 }} onClick={load}>Tentar de novo</button>}
          </div>
        </div>
      </div>
    );
  }

  const { affiliate, stats, owner } = data;
  const shareText = `Quer estudar com a gente? Peça informações por este link: ${data.referralUrl}`;
  const tabs = [
    { key: "mat", label: "Materiais", Icon: Gift, count: data.materials.length },
    { key: "camp", label: "Campanhas", Icon: Megaphone, count: data.campaigns.length },
    { key: "cur", label: "Cursos", Icon: GraduationCap, count: data.courses.reduce((t, g) => t + g.courses.length, 0) },
    { key: "ind", label: "Indicações", Icon: Users, count: data.referrals.length },
  ];

  const courseListText = (g) =>
    `${g.modality}\n${g.courses.map((c) => `• ${c.name}`).join("\n")}`;

  return (
    <div className="ap-root">
      <header className="ap-hero">
        <div className="ap-wrap">
          <div className="ap-brand"><i />{data.title}</div>
          <h1 className="ap-hello">Olá, {affiliate.firstName}</h1>
          <p className="ap-sub">{data.message}</p>
          {owner && <div className="ap-owner">Seu consultor: <strong>{owner.name}</strong></div>}
        </div>
      </header>

      <div className="ap-wrap" role="main">
        <section className="ap-stats" aria-label="Sua produção">
          <div className="ap-stat"><b><NumberTicker value={stats.referrals} /></b><span>pessoas indicadas</span></div>
          <div className="ap-stat"><b><NumberTicker value={stats.enrolled} /></b><span>matrículas{stats.referrals ? ` · ${stats.conversion}%` : ""}</span></div>
          <div className="ap-stat is-money"><b><NumberTicker value={stats.bonusPending} format={brl} /></b><span>a receber</span></div>
          <div className="ap-stat"><b><NumberTicker value={stats.bonusPaid} format={brl} /></b><span>já recebido</span></div>
        </section>

        <section className="ap-link">
          <div className="ap-link-text">
            <strong>Seu link de indicação</strong>
            <code>{data.referralUrl}</code>
          </div>
          <div className="ap-link-actions">
            <CopyButton text={data.referralUrl} label="Copiar link" ok="Link copiado!" />
            <a className="ap-btn is-wa" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer">
              <MessageCircle size={16} /> Enviar no WhatsApp
            </a>
            <button type="button" className="ap-btn is-primary" onClick={() => setSheet({})}><UserPlus size={16} /> Indicar alguém</button>
          </div>
        </section>
      </div>

      <div className="ap-tabs-bar">
        <div className="ap-wrap">
          <div className="ap-tabs" role="tablist">
            {tabs.map((t, i) => (
              <button key={t.key} role="tab" type="button" className="ap-tab" aria-selected={tab === i} onClick={() => setTab(i)}>
                <t.Icon size={17} /> <span className="ap-tab-label">{t.label}</span>{t.count > 0 && <em>{t.count}</em>}
              </button>
            ))}
            <span className="ap-ink" style={{ transform: `translateX(${tab * 100}%)` }} />
          </div>
        </div>
      </div>

      <div className="ap-wrap">
        <div className="ap-panel" key={tab} role="tabpanel">
          {tab === 0 && (
            <>
              <div className="ap-tools">
                <div className="ap-search">
                  <Search size={16} />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar banner, texto, vídeo ou curso" aria-label="Buscar material" />
                </div>
                {kinds.length > 1 && (
                  <div className="ap-chips">
                    <button type="button" className="ap-chip" aria-pressed={kind === "all"} onClick={() => setKind("all")}>Tudo</button>
                    {kinds.map((k) => (
                      <button key={k} type="button" className="ap-chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{(KIND[k] || KIND.other).label}</button>
                    ))}
                  </div>
                )}
              </div>
              {materials.length ? (
                <div className="ap-grid">{materials.map((m) => <MaterialCard key={m.id} token={token} m={m} />)}</div>
              ) : (
                <div className="ap-empty"><FileText size={34} /><strong>{data.materials.length ? "Nada com essa busca" : "Ainda não há materiais"}</strong>{data.materials.length ? "Tente outra palavra ou limpe o filtro." : "Assim que sua equipe publicar, eles aparecem aqui."}</div>
              )}
            </>
          )}

          {tab === 1 && (
            data.campaigns.length ? (
              <div className="ap-campaigns">
                {data.campaigns.map((c) => (
                  <article className="ap-campaign" key={c.id}>
                    <div className="ap-cover">
                      {c.hasCover ? <img src={`${API}/affiliate-portal/${token}/campaigns/${c.id}/cover`} alt="" loading="lazy" /> : <Megaphone size={48} strokeWidth={1.4} />}
                    </div>
                    <div className="ap-campaign-body">
                      <h3>{c.title}</h3>
                      <div className="ap-pills">
                        {c.bonusValue ? <span className="ap-pill is-bonus"><Gift size={13} /> {brl(c.bonusValue)} por matrícula</span> : null}
                        {c.endsAt && <span className="ap-pill"><Clock size={13} /> até {day(c.endsAt)}</span>}
                        {daysLeft(c.endsAt) && <span className="ap-pill is-ok">{daysLeft(c.endsAt)}</span>}
                      </div>
                      {c.description && <p>{c.description}</p>}
                      <div>
                        <button type="button" className="ap-btn" onClick={() => { setTab(0); setQuery(""); setKind("all"); }}>
                          <Gift size={16} /> Ver materiais
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="ap-empty"><Megaphone size={34} /><strong>Nenhuma campanha agora</strong>Quando houver uma campanha para você, ela aparece aqui com as datas.</div>
            )
          )}

          {tab === 2 && (
            data.courses.length ? (
              <>
                <div className="ap-tools">
                  <div className="ap-chips">
                    {data.courses.map((g) => (
                      <button key={g.modality} type="button" className="ap-chip" aria-pressed={format === g.modality} onClick={() => setFormat(g.modality)}>
                        {g.modality} · {g.courses.length}
                      </button>
                    ))}
                  </div>
                  <div className="ap-search">
                    <Search size={16} />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar curso" aria-label="Buscar curso" />
                  </div>
                </div>
                {data.courses.filter((g) => g.modality === format).map((g) => (
                  <div key={g.modality}>
                    <p className="ap-format-note">{FORMAT_NOTE[g.modality] || ""}</p>
                    <div className="ap-courses">
                      {g.courses
                        .filter((c) => !query.trim() || c.name.toLowerCase().includes(query.trim().toLowerCase()))
                        .map((c) => (
                          <div className="ap-course" key={c.id}>
                            <div>
                              <strong>{c.name}</strong>
                              <small>{c.semesters} semestres ({c.semesters / 2} anos){c.category ? ` · ${c.category.replace("Graduação - ", "")}` : ""}</small>
                            </div>
                            <button type="button" className="ap-btn" title="Indicar alguém para este curso" onClick={() => setSheet({ course: c.id })}><UserPlus size={15} /></button>
                          </div>
                        ))}
                    </div>
                    <div style={{ marginTop: 16 }}>
                      <CopyButton text={courseListText(g)} label={`Copiar lista de ${g.modality}`} ok="Lista copiada!" />
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <div className="ap-empty"><GraduationCap size={34} /><strong>Lista de cursos indisponível</strong>Peça ao seu consultor.</div>
            )
          )}

          {tab === 3 && (
            <>
              <div className="ap-tools">
                <button type="button" className="ap-btn is-primary" onClick={() => setSheet({})}><UserPlus size={16} /> Indicar alguém</button>
              </div>
              {data.referrals.length ? (
                <div className="ap-list">
                  {data.referrals.map((r) => (
                    <div className="ap-row" key={r.id}>
                      <span className="ap-avatar">{r.name[0]}</span>
                      <div><strong>{r.name}</strong><small>indicado em {day(r.createdAt)}</small></div>
                      <span className={`ap-status ${r.status}`}>{r.status === "enrolled" ? "Matriculado" : r.status === "lost" ? "Não seguiu" : "Em atendimento"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="ap-empty"><Link2 size={34} /><strong>Você ainda não indicou ninguém</strong>Compartilhe seu link ou use o botão acima.</div>
              )}
              {data.bonuses.length > 0 && (
                <>
                  <h2 className="ap-h2">Suas bonificações</h2>
                  <div className="ap-list">
                    {data.bonuses.map((b) => (
                      <div className="ap-row" key={b.id}>
                        <span className="ap-avatar" style={{ background: b.status === "paid" ? "#14803c" : undefined }}><Gift size={18} /></span>
                        <div><strong>{brl(b.amount)}</strong><small>{b.status === "paid" ? `pago em ${day(b.paidAt)}` : `gerada em ${day(b.createdAt)}`}</small></div>
                        <span className={`ap-status ${b.status === "paid" ? "enrolled" : "open"}`}>{b.status === "paid" ? "Pago" : b.status === "approved" ? "Aprovado" : "A pagar"}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {sheet && (
        <ReferralSheet
          token={token}
          courses={data.courses}
          presetCourse={sheet.course}
          onClose={() => setSheet(null)}
          onDone={() => { setSheet(null); setTab(3); load(); }}
        />
      )}
    </div>
  );
};

export default AffiliatePortal;
