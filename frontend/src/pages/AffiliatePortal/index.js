import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import {
  ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check, Clock, Copy, Download, ExternalLink, FileText, Gift, GraduationCap, Home as HomeIcon, Image as ImageIcon,
  Layers, Link2, Lock, Megaphone, MessageCircle, Paperclip, Play, Search, Send, Type, UserPlus, Users, Video, Folders, HelpCircle,
} from "lucide-react";

import { getBackendUrl } from "../../config";
import logo from "../../assets/logo-cruzeiro-color.svg";
import BrandStar from "../../components/BrandStar";
import { CopyButton } from "./shared";
import PromoPanel, { Messages } from "./PromoPanel";
import ArtLibrary from "./ArtLibrary";
import { Funnel, HeroCard, ShareBar } from "./HomeParts";
import "./central.css";

// Public page of one affiliate: no login, no cookies. The token in the address is the access. It never shows prices.
const API = String(getBackendUrl() || "").replace(/\/+$/, "");
const http = axios.create({ baseURL: API });

const KIND = {
  banner: { label: "Banner", Icon: ImageIcon },
  copy: { label: "Mensagem pronta", Icon: Type },
  video: { label: "Vídeo", Icon: Video },
  course_info: { label: "Sobre o curso", Icon: BookOpen },
  course_list: { label: "Lista de cursos", Icon: Layers },
  campaign: { label: "Campanha", Icon: Megaphone },
  other: { label: "Material", Icon: Paperclip },
};

const COLLECTIONS = {
  graduacao: { name: "Graduação", line: "Um primeiro passo.", about: "Divulgue os cursos de graduação.", tag: "01 / GRADUAÇÃO" },
  pos: { name: "Pós-graduação", line: "O próximo capítulo.", about: "Apresente novas possibilidades de formação.", tag: "02 / PÓS-GRADUAÇÃO" },
  tecnico: { name: "Cursos técnicos", line: "Formação que vai direto ao ponto.", about: "Banner de divulgação dos cursos técnicos.", tag: "03 / TÉCNICOS" },
  programa: { name: "Programa de afiliados", line: "Uma rede que cresce.", about: "Kit, vídeos e texto de convite.", tag: "04 / PROGRAMA" },
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
const daysLeft = (end) => {
  if (!end) return null;
  const d = Math.ceil((new Date(end) - new Date()) / 86400000);
  if (d < 0) return null;
  return d === 0 ? "termina hoje" : d === 1 ? "termina amanhã" : `termina em ${d} dias`;
};

const isImage = (m) => m.hasFile && /^image\//.test(m.mimeType || "");

const ReferralSheet = ({ token, courses, presetCourse, onClose, onDone }) => {
  const [form, setForm] = useState({ name: "", phone: "", courseId: presetCourse || "", consent: false, website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (k) => (e) => { e && e.persist && e.persist(); return (setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }))); };

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
    <div className="ca-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="presentation">
      <form className="ca-sheet" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="ca-ind-title">
        <h2 id="ca-ind-title">Indicar alguém</h2>
        <p className="ca-help">Seu consultor entra em contato com a pessoa e você acompanha o andamento aqui.</p>
        {error && <div className="ca-error" role="alert">{error}</div>}
        <label className="ca-field">Nome de quem você indica
          <input value={form.name} onChange={set("name")} required minLength={2} autoComplete="off" autoFocus />
        </label>
        <label className="ca-field">WhatsApp com DDD
          <input value={form.phone} onChange={set("phone")} required inputMode="tel" placeholder="(69) 99999-0000" autoComplete="off" />
        </label>
        <label className="ca-field">Curso de interesse (se souber)
          <select value={form.courseId} onChange={set("courseId")}>
            <option value="">Ainda não sei</option>
            {courses.map((g) => (
              <optgroup key={g.modality} label={g.modality}>
                {g.courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <input className="ca-hp" tabIndex={-1} aria-hidden="true" autoComplete="off" value={form.website} onChange={set("website")} />
        <label className="ca-consent">
          <input type="checkbox" checked={form.consent} onChange={set("consent")} required />
          Essa pessoa sabe da indicação e aceita receber contato por WhatsApp, e-mail ou telefone.
        </label>
        <div className="ca-actions">
          <button type="button" className="ca-btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="ca-btn is-primary" disabled={busy || !form.consent}>
            <Send size={16} /> {busy ? "Enviando..." : "Enviar indicação"}
          </button>
        </div>
      </form>
    </div>
  );
};

const MaterialCard = ({ token, m, onCopied }) => {
  const kind = KIND[m.kind] || KIND.other;
  const fileUrl = `${API}/affiliate-portal/${token}/files/${m.id}`;
  const isVideoFile = m.hasFile && /^video\//.test(m.mimeType || "");
  const embed = m.externalUrl && youtubeEmbed(m.externalUrl);
  return (
    <article className="ca-card">
      <div className="ca-media">
        <span className="ca-kind"><kind.Icon size={12} /> {kind.label}</span>
        {isImage(m) && <img src={`${fileUrl}?preview=1`} alt={m.title} loading="lazy" />}
        {isVideoFile && <video src={`${fileUrl}?preview=1`} controls preload="metadata" />}
        {!isImage(m) && !isVideoFile && embed && <iframe src={embed} title={m.title} loading="lazy" allowFullScreen />}
        {!isImage(m) && !isVideoFile && !embed && <kind.Icon size={44} strokeWidth={1.4} />}
      </div>
      <div className="ca-body">
        <h3>{m.title}</h3>
        {m.description && <p>{m.description}</p>}
        {m.copyText && <div className="ca-copy">{m.copyText}</div>}
        {m.course && <span className="ca-tag"><GraduationCap size={13} /> {m.course.name}</span>}
        <div className="ca-foot">
          {m.copyText && <CopyButton text={m.copyText} className="ca-btn is-primary" onCopied={() => onCopied(m.id)} />}
          {m.hasFile && (
            <a className="ca-btn" href={`${fileUrl}?download=1`} download>
              <Download size={16} /> Baixar {m.fileSize ? <small style={{ fontWeight: 400 }}>({sizeOf(m.fileSize)})</small> : null}
            </a>
          )}
          {m.externalUrl && (
            <a className="ca-btn" href={m.externalUrl} target="_blank" rel="noopener noreferrer">
              {embed ? <Play size={16} /> : <ExternalLink size={16} />} {embed ? "Abrir no YouTube" : "Abrir link"}
            </a>
          )}
        </div>
      </div>
    </article>
  );
};

function youtubeEmbed(url) {
  const m = String(url || "").match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

const PAGES = ["home", "materials", "campaigns", "learn", "referrals"];
const readHash = () => {
  const h = String(window.location.hash || "").replace(/^#\/?/, "");
  if (h.startsWith("colecao-")) return { page: "collection", key: h.slice(8) };
  if (h.startsWith("video-")) return { page: "video", key: h.slice(6) };
  return { page: PAGES.includes(h) ? h : "home", key: null };
};

const AffiliatePortal = ({ match }) => {
  const token = match.params.token;
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading");
  const [route, setRoute] = useState(readHash);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [colFilter, setColFilter] = useState("all");
  const [view, setView] = useState("library"); // library | materials | courses
  const [format, setFormat] = useState("");
  const [sheet, setSheet] = useState(null);

  const go = useCallback((page, key) => {
    window.location.hash = key ? `${page === "collection" ? "colecao" : page}-${key}` : page;
    window.scrollTo({ top: 0 });
  }, []);
  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const load = useCallback(async () => {
    try {
      const { data: d } = await http.get(`/affiliate-portal/${token}`);
      // a proxy or a deploy in the middle can answer 200 with something that is not the portal: treat it as a failure
      if (!d || typeof d !== "object" || !Array.isArray(d.courses)) throw new Error("bad payload");
      setData(d);
      setFormat((f) => f || (d.courses[0] ? d.courses[0].modality : ""));
      setState("ready");
    } catch (err) {
      setState(err.response?.status === 404 ? "invalid" : "error");
    }
  }, [token]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (data) document.title = `${data.title} · ${data.affiliate.firstName}`; }, [data]);

  const copied = (id) => { http.post(`/affiliate-portal/${token}/materials/${id}/copied`).catch(() => undefined); };

  const materials = useMemo(() => data?.materials || [], [data]);
  const byCollection = useMemo(() => {
    const map = {};
    materials.forEach((m) => { if (m.collection && COLLECTIONS[m.collection]) (map[m.collection] = map[m.collection] || []).push(m); });
    return map;
  }, [materials]);
  const coverOf = (key) => (byCollection[key] || []).find((m) => isImage(m));
  const kinds = useMemo(() => [...new Set(materials.map((m) => m.kind))], [materials]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return materials.filter(
      (m) => (kind === "all" || m.kind === kind) &&
        (colFilter === "all" || (colFilter === "none" ? !m.collection : m.collection === colFilter)) &&
        (!q || `${m.title} ${m.description || ""} ${m.copyText || ""} ${m.course?.name || ""}`.toLowerCase().includes(q))
    );
  }, [materials, query, kind, colFilter]);

  if (state === "loading") {
    return (
      <div className="ca-root"><div className="ca-wrap" style={{ paddingTop: 80 }}>
        <div className="ca-skel" style={{ height: 40, width: 220 }} /><div className="ca-skel" style={{ height: 220, marginTop: 24 }} />
      </div></div>
    );
  }
  if (state !== "ready") {
    return (
      <div className="ca-root">
        <div className="ca-center">
          <div>
            <BrandStar variant="emblem" size={92} float shine style={{ marginBottom: 10 }} />
            <h1 className="ca-h2">{state === "invalid" ? "Este link não está disponível" : "Não conseguimos abrir agora"}</h1>
            <p className="ca-lead" style={{ margin: "12px auto" }}>
              {state === "invalid" ? "Ele pode ter sido trocado ou pausado. Peça um link novo ao seu consultor." : "Confira sua internet e tente de novo em instantes."}
            </p>
            {state === "error" && <button type="button" className="ca-btn is-primary" onClick={load}>Tentar de novo</button>}
          </div>
        </div>
      </div>
    );
  }

  const { affiliate, stats, owner } = data;
  const page = route.page === "collection" || route.page === "video" ? (route.page === "video" ? "learn" : "materials") : route.page;
  const shareText = `Quer estudar com a gente? Peça informações por este link: ${data.referralUrl}`;
  const NAV = [["home", "Início", HomeIcon], ["materials", "Materiais", Folders], ["campaigns", "Campanhas", Megaphone], ["learn", "Orientações", HelpCircle], ["referrals", "Indicações", Users]];
  const courseListText = (g) => `${g.modality}\n${g.courses.map((c) => `• ${c.name}`).join("\n")}`;
  const courseNames = [...new Set(data.courses.flatMap((g) => g.courses.map((c) => c.name)))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const collectionKeys = Object.keys(COLLECTIONS);
  const shown = collectionKeys.filter((k) => byCollection[k]);

  const CollectionTile = ({ k }) => {
    const c = COLLECTIONS[k];
    const cover = coverOf(k);
    const count = (byCollection[k] || []).length;
    return (
      <button key={k} type="button" className="ca-collection" onClick={() => go("collection", k)}>
        <div className="ca-cover">
          {cover ? <img src={`${API}/affiliate-portal/${token}/files/${cover.id}?preview=1`} alt="" loading="lazy" /> : <div className="words">{c.name.toUpperCase()}<br /><em>EM DESTAQUE.</em></div>}
          <span>{c.tag}</span>
        </div>
        <div className="ca-collection-body">
          <strong>{c.line} <ArrowUpRight size={18} /></strong>
          <p>{c.about}</p>
          <small>{count} {count === 1 ? "material" : "materiais"}</small>
        </div>
      </button>
    );
  };

  const Home = () => {
    const camp = data.campaigns[0];
    return (
      <>
        <div className="ca-hero">
          <div>
            <span className="ca-over">Olá, {affiliate.firstName}</span>
            <h1 className="ca-h1">Sua indicação.<br /><em>Um novo futuro.</em></h1>
            <p className="ca-lead">{data.message}</p>
            <div className="ca-hero-actions">
              <button type="button" className="ca-btn is-primary" onClick={() => go("materials")}>Encontrar meus materiais <ArrowUpRight size={16} /></button>
              <button type="button" className="ca-btn" onClick={() => setSheet({})}><UserPlus size={16} /> Indicar alguém</button>
            </div>
            {owner && <p className="ca-help" style={{ marginTop: 18, color: "var(--muted)" }}>Seu consultor: <strong style={{ color: "var(--ink)" }}>{owner.name}</strong></p>}
          </div>
          <HeroCard nome={affiliate.firstName} link={data.referralUrl} />
        </div>

        <ShareBar link={data.referralUrl} nome={affiliate.firstName} />
        <Funnel stats={stats} />
        {!affiliate.pixKey && <p className="ca-notice">Falta cadastrar a sua chave Pix para receber as bonificações. Peça ao seu consultor{owner ? `, ${owner.name}` : ""}.</p>}

        <PromoPanel nome={affiliate.firstName} link={data.referralUrl} groups={data.courses} />

        <div className="ca-section-head" style={{ marginTop: 56 }}>
          <div><span className="ca-over">Prontas para postar</span><h2 className="ca-h2">Artes que já saem com o seu QR Code.</h2></div>
        </div>
        <ArtLibrary nome={affiliate.firstName} link={data.referralUrl} groups={data.courses} limit={6} onMore={() => { setView("library"); go("materials"); }} />

        {camp && (
          <section className="ca-feature">
            <div>
              <span className="ca-over">Campanha em andamento</span>
              <h2 className="ca-h2" style={{ color: "#fff" }}>{camp.title}</h2>
              {camp.description && <p>{camp.description}</p>}
              <div className="ca-pills">
                {camp.bonusValue ? <span className="ca-pill is-bonus"><Gift size={13} /> {brl(camp.bonusValue)} por matrícula</span> : null}
                {camp.endsAt && <span className="ca-pill"><Clock size={13} /> até {day(camp.endsAt)}</span>}
              </div>
              <button type="button" className="ca-btn" onClick={() => go("campaigns")}>Ver campanha <ArrowUpRight size={16} /></button>
            </div>
            {camp.hasCover ? <img src={`${API}/affiliate-portal/${token}/campaigns/${camp.id}/cover`} alt="" /> : <div className="ca-stamp">Uma ação.<br />Todos os materiais juntos.</div>}
          </section>
        )}

        <div className="ca-section-head">
          <div><span className="ca-over">Materiais da equipe</span><h2 className="ca-h2">Escolha uma coleção.</h2></div>
          <button type="button" className="ca-text-link" onClick={() => go("materials")}>Ver todos os materiais <ArrowRight size={16} /></button>
        </div>
        {shown.length ? (
          <div className="ca-collections">{shown.map((k) => CollectionTile({ k }))}</div>
        ) : (
          <div className="ca-empty"><Folders size={34} /><strong>As coleções chegam em breve</strong>Quando a equipe publicar os materiais, eles aparecem aqui organizados.</div>
        )}

        {data.videos.length > 0 && (
          <>
            <div className="ca-section-head"><div><span className="ca-over">Comece com confiança</span><h2 className="ca-h2">Veja como funciona.</h2></div></div>
            <div className="ca-videos">
              {data.videos.map((v) => (
                <button key={v.key} type="button" className="ca-film" onClick={() => go("video", v.key)}>
                  <i><Play size={18} /></i><span><strong>{v.title}</strong><small>Vídeo · YouTube</small></span>
                </button>
              ))}
            </div>
          </>
        )}
      </>
    );
  };

  const Materials = () => (
    <>
      <span className="ca-over">Biblioteca organizada por objetivo</span>
      <h1 className="ca-h1" style={{ fontSize: "clamp(34px, 5vw, 54px)" }}>Seu material.<br />Do jeito certo.</h1>
      <div className="ca-tools">
        <div className="ca-chips">
          <button type="button" className="ca-chip" aria-pressed={view === "library"} onClick={() => setView("library")}>Artes e mensagens prontas</button>
          <button type="button" className="ca-chip" aria-pressed={view === "materials"} onClick={() => setView("materials")}>Materiais da equipe</button>
          <button type="button" className="ca-chip" aria-pressed={view === "courses"} onClick={() => setView("courses")}>Lista de cursos</button>
        </div>
      </div>
      {view === "library" ? (
        <>
          <ArtLibrary nome={affiliate.firstName} link={data.referralUrl} groups={data.courses} />
          <div style={{ marginTop: 28 }}><Messages nome={affiliate.firstName} link={data.referralUrl} courses={courseNames} /></div>
        </>
      ) : view === "materials" ? (
        <>
          <div className="ca-tools" style={{ marginTop: 0 }}>
            <div className="ca-search">
              <Search size={16} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar banner, texto, vídeo ou curso" aria-label="Buscar material" />
            </div>
            <div className="ca-chips">
              <button type="button" className="ca-chip" aria-pressed={colFilter === "all"} onClick={() => setColFilter("all")}>Todas as coleções</button>
              {shown.map((k) => <button key={k} type="button" className="ca-chip" aria-pressed={colFilter === k} onClick={() => setColFilter(k)}>{COLLECTIONS[k].name}</button>)}
            </div>
            {kinds.length > 1 && (
              <div className="ca-chips">
                <button type="button" className="ca-chip" aria-pressed={kind === "all"} onClick={() => setKind("all")}>Qualquer tipo</button>
                {kinds.map((k) => <button key={k} type="button" className="ca-chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{(KIND[k] || KIND.other).label}</button>)}
              </div>
            )}
          </div>
          {filtered.length ? (
            <div className="ca-grid">{filtered.map((m) => <MaterialCard key={m.id} token={token} m={m} onCopied={copied} />)}</div>
          ) : (
            <div className="ca-empty"><FileText size={34} /><strong>{materials.length ? "Nada com essa busca" : "Ainda não há materiais"}</strong>{materials.length ? "Tente outra palavra ou limpe os filtros." : "Assim que sua equipe publicar, eles aparecem aqui."}</div>
          )}
        </>
      ) : data.courses.length ? (
        <>
          <div className="ca-tools" style={{ marginTop: 0 }}>
            <div className="ca-chips">
              {data.courses.map((g) => <button key={g.modality} type="button" className="ca-chip" aria-pressed={format === g.modality} onClick={() => setFormat(g.modality)}>{g.modality} · {g.courses.length}</button>)}
            </div>
            <div className="ca-search"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar curso" aria-label="Buscar curso" /></div>
          </div>
          {data.courses.filter((g) => g.modality === format).map((g) => (
            <div key={g.modality}>
              <p className="ca-help">{FORMAT_NOTE[g.modality] || ""}</p>
              <div className="ca-courses">
                {g.courses.filter((c) => !query.trim() || c.name.toLowerCase().includes(query.trim().toLowerCase())).map((c) => (
                  <div className="ca-course" key={c.id}>
                    <div><strong>{c.name}</strong><small>{c.semesters} semestres ({c.semesters / 2} anos){c.category ? ` · ${c.category.replace("Graduação - ", "")}` : ""}</small></div>
                    <button type="button" className="ca-btn" title="Indicar alguém para este curso" onClick={() => setSheet({ course: c.id })}><UserPlus size={15} /></button>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16 }}><CopyButton text={courseListText(g)} label={`Copiar lista de ${g.modality}`} ok="Lista copiada!" /></div>
            </div>
          ))}
        </>
      ) : (
        <div className="ca-empty"><GraduationCap size={34} /><strong>Lista de cursos indisponível</strong>Peça ao seu consultor.</div>
      )}
    </>
  );

  const CollectionPage = ({ k }) => {
    const c = COLLECTIONS[k];
    const list = byCollection[k] || [];
    if (!c) return <div className="ca-empty"><strong>Coleção não encontrada</strong><button type="button" className="ca-text-link" onClick={() => go("materials")}>Voltar aos materiais</button></div>;
    const arts = list.filter((m) => isImage(m));
    const texts = list.filter((m) => m.copyText);
    const others = list.filter((m) => !isImage(m) && !m.copyText);
    return (
      <>
        <button type="button" className="ca-back" onClick={() => go("materials")}><ArrowLeft size={16} /> Todas as coleções</button>
        <span className="ca-over">Coleção de divulgação</span>
        <h1 className="ca-h1" style={{ fontSize: "clamp(34px, 5vw, 54px)" }}>{c.name}</h1>
        <p className="ca-lead">{c.line} {c.about}</p>
        <div className="ca-split">
          <div className="ca-stack">
            {arts.map((m) => (
              <figure className="ca-art" key={m.id} style={{ margin: 0 }}>
                <img src={`${API}/affiliate-portal/${token}/files/${m.id}?preview=1`} alt={m.title} loading="lazy" />
                <figcaption><span>{m.title}</span><a className="ca-btn" href={`${API}/affiliate-portal/${token}/files/${m.id}?download=1`} download><Download size={15} /> Baixar</a></figcaption>
              </figure>
            ))}
            {others.length > 0 && <div className="ca-grid">{others.map((m) => <MaterialCard key={m.id} token={token} m={m} onCopied={copied} />)}</div>}
            {!arts.length && !others.length && <div className="ca-empty"><ImageIcon size={32} /><strong>Sem artes por enquanto</strong>As artes desta coleção aparecem aqui.</div>}
          </div>
          <div className="ca-stack">
            {texts.map((m) => (
              <div className="ca-box" key={m.id}>
                <span className="ca-over">Combine a arte com esta mensagem</span>
                <h3 style={{ marginTop: 10 }}>{m.title}</h3>
                <div className="ca-copy" style={{ margin: "12px 0" }}>{m.copyText}</div>
                <CopyButton text={m.copyText} className="ca-btn is-primary" onCopied={() => copied(m.id)} />
              </div>
            ))}
            {!texts.length && <div className="ca-box"><h3>Mensagens prontas</h3><small>Ainda não há texto sugerido para esta coleção.</small></div>}
            <p className="ca-help">Adapte a abordagem ao seu público. Mantenha as informações e as artes oficiais, sem valores, bolsas ou condições.</p>
          </div>
        </div>
      </>
    );
  };

  const Campaigns = () => (
    <>
      <span className="ca-over">Um espaço para cada ação</span>
      <h1 className="ca-h1" style={{ fontSize: "clamp(34px, 5vw, 54px)" }}>Campanhas<br />em movimento.</h1>
      <div style={{ marginTop: 28 }}>
        {data.campaigns.length ? data.campaigns.map((c) => (
          <article className="ca-campaign" key={c.id}>
            <div className="cover">{c.hasCover ? <img src={`${API}/affiliate-portal/${token}/campaigns/${c.id}/cover`} alt="" loading="lazy" /> : <Megaphone size={48} strokeWidth={1.4} />}</div>
            <div className="inner">
              <h3 className="ca-h2" style={{ fontSize: 26 }}>{c.title}</h3>
              <div className="ca-pills">
                {c.bonusValue ? <span className="ca-pill is-bonus"><Gift size={13} /> {brl(c.bonusValue)} por matrícula</span> : null}
                {c.endsAt && <span className="ca-pill"><Clock size={13} /> até {day(c.endsAt)}</span>}
                {daysLeft(c.endsAt) && <span className="ca-pill">{daysLeft(c.endsAt)}</span>}
              </div>
              {c.description && <p className="ca-help">{c.description}</p>}
              <button type="button" className="ca-btn" style={{ marginTop: 10 }} onClick={() => go("materials")}><Gift size={16} /> Ver materiais</button>
            </div>
          </article>
        )) : <div className="ca-empty"><Megaphone size={34} /><strong>Nenhuma campanha agora</strong>Quando houver uma campanha para você, ela aparece aqui com as datas.</div>}
      </div>
    </>
  );

  const Learn = () => {
    const playing = route.page === "video" ? data.videos.find((v) => v.key === route.key) : null;
    return (
      <>
        {playing ? (
          <>
            <button type="button" className="ca-back" onClick={() => go("learn")}><ArrowLeft size={16} /> Orientações</button>
            <h1 className="ca-h2">{playing.title}</h1>
            <div style={{ marginTop: 18 }}>
              {playing.embed ? <iframe className="ca-player" src={playing.embed} title={playing.title} allowFullScreen /> : <a className="ca-btn is-primary" href={playing.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Abrir vídeo</a>}
            </div>
          </>
        ) : (
          <>
            <span className="ca-over">Apoio para começar e continuar</span>
            <h1 className="ca-h1" style={{ fontSize: "clamp(34px, 5vw, 54px)" }}>Seu caminho<br />mais claro.</h1>
            {data.videos.length > 0 && (
              <div className="ca-videos" style={{ marginTop: 28 }}>
                {data.videos.map((v) => <button key={v.key} type="button" className="ca-film" onClick={() => go("video", v.key)}><i><Play size={18} /></i><span><strong>{v.title}</strong><small>Vídeo · YouTube</small></span></button>)}
              </div>
            )}
            <div className="ca-section-head" style={{ marginTop: 44 }}><h2 className="ca-h2">Perguntas frequentes</h2></div>
            {data.faq.map((f, i) => <details className="ca-faq" key={i}><summary>{f.q}</summary><p>{f.a}</p></details>)}
            <div className="ca-box" style={{ marginTop: 32 }}>
              <h3>Conte com a equipe</h3>
              <p className="ca-help" style={{ margin: "4px 0 14px" }}>Precisa de ajuda para orientar uma pessoa interessada?</p>
              {data.support ? (
                <a className="ca-btn is-primary" href={data.support.url} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} /> Falar com o suporte</a>
              ) : owner ? <small>Fale com o seu consultor, {owner.name}.</small> : <small>Fale com o seu consultor.</small>}
            </div>
          </>
        )}
      </>
    );
  };

  const Referrals = () => (
    <>
      <span className="ca-over">Sua rede</span>
      <h1 className="ca-h1" style={{ fontSize: "clamp(34px, 5vw, 54px)" }}>Suas indicações.</h1>
      <div className="ca-tools"><button type="button" className="ca-btn is-primary" onClick={() => setSheet({})}><UserPlus size={16} /> Indicar alguém</button></div>
      {data.referrals.length ? (
        <div className="ca-list">
          {data.referrals.map((r) => (
            <div className="ca-row" key={r.id}>
              <span className="ca-avatar">{r.name[0]}</span>
              <div><strong>{r.name}</strong><small>indicado em {day(r.createdAt)}{r.stage && r.status === "open" ? ` · ${r.stage}` : ""}</small></div>
              <span className={`ca-status ${r.status}`}>{r.status === "enrolled" ? "Matriculado" : r.status === "lost" ? "Não seguiu" : "Em atendimento"}</span>
            </div>
          ))}
        </div>
      ) : <div className="ca-empty"><Link2 size={34} /><strong>Você ainda não indicou ninguém</strong>Compartilhe seu link ou use o botão acima.</div>}
      {data.bonuses.length > 0 && (
        <>
          <h2 className="ca-h2" style={{ margin: "44px 0 16px", fontSize: 26 }}>Suas bonificações</h2>
          <div className="ca-list">
            {data.bonuses.map((b) => (
              <div className="ca-row" key={b.id}>
                <span className="ca-avatar" style={{ background: b.status === "paid" ? "#14803c" : undefined }}><Gift size={18} /></span>
                <div><strong>{brl(b.amount)}</strong><small>{b.status === "paid" ? `pago em ${day(b.paidAt)}` : `gerada em ${day(b.createdAt)}${b.dueAt ? ` · previsão até ${day(b.dueAt)}` : ""}`}</small></div>
                <span className={`ca-status ${b.status === "paid" ? "enrolled" : "open"}`}>{b.status === "paid" ? "Pago" : b.status === "approved" ? "Aprovado" : "A pagar"}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );

  return (
    <div className="ca-root">
      <header className="ca-top">
        <div className="ca-wrap">
          <button type="button" className="ca-brand" onClick={() => go("home")} aria-label="Cruzeiro do Sul Virtual, início">
            <img src={logo} alt="Cruzeiro do Sul Virtual" draggable={false} />
            <small>{String(data.title || "Central do Afiliado").toUpperCase()}</small>
          </button>
          <nav className="ca-nav" aria-label="Menu principal">
            {NAV.map(([key, label]) => <button key={key} type="button" aria-current={page === key ? "page" : undefined} onClick={() => go(key)}>{label}</button>)}
          </nav>
          <div className="ca-top-actions">
            <button type="button" className="ca-btn is-primary" onClick={() => setSheet({})}><UserPlus size={16} /><span>Indicar alguém</span></button>
          </div>
        </div>
      </header>

      <main className="ca-wrap ca-page" key={`${route.page}-${route.key}`}>
        {route.page === "home" && Home()}
        {route.page === "materials" && Materials()}
        {route.page === "collection" && CollectionPage({ k: route.key })}
        {route.page === "campaigns" && Campaigns()}
        {(route.page === "learn" || route.page === "video") && Learn()}
        {route.page === "referrals" && Referrals()}
      </main>

      <nav className="ca-bottom" aria-label="Navegação no celular">
        {NAV.map(([key, label, Icon]) => <button key={key} type="button" aria-current={page === key ? "page" : undefined} onClick={() => go(key)}><Icon size={20} />{label}</button>)}
      </nav>

      {sheet && (
        <ReferralSheet token={token} courses={data.courses} presetCourse={sheet.course} onClose={() => setSheet(null)} onDone={() => { setSheet(null); go("referrals"); load(); }} />
      )}
    </div>
  );
};

export default AffiliatePortal;
