import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { InputAdornment, TextField, makeStyles } from "@material-ui/core";
import { ArrowUpRight, Bot, Building2, CircleDot, Code2, GraduationCap, Plug, Search, Settings2, Share2, Tags, Target, Users, Workflow, Eye, ListTree } from "lucide-react";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import { AuthContext } from "../../context/Auth/AuthContext";
import { WhatsAppsContext } from "../../context/WhatsApp/WhatsAppsContext";
import { isStrictAdmin } from "../../utils/access";
import api from "../../services/api";

// Everything that is set up once (not used every day) lives here, grouped by what it is for.
const SECTIONS = [
  {
    id: "atendimento", title: "Atendimento", hint: "Por onde o aluno chega e como a conversa é organizada",
    items: [
      { to: "/connections", icon: Plug, title: "Conexões", desc: "Números de WhatsApp, Instagram, Messenger e Telegram: conectar, ler o QR Code e acompanhar o estado.", badge: "connections" },
      { to: "/queues", icon: ListTree, title: "Filas", desc: "Quem atende cada assunto, a mensagem de boas-vindas e o rodízio entre atendentes." },
      { to: "/tags", icon: Tags, title: "Etiquetas", desc: "Marcas coloridas para separar conversas e contatos." },
      { to: "/monitor", icon: Eye, title: "Monitor ao vivo", desc: "Veja as conversas em andamento e quem está atendendo agora." },
    ],
  },
  {
    id: "automacao", title: "Automação e IA", hint: "O que responde sozinho e quando passa para uma pessoa",
    items: [
      { to: "/chatbot", icon: Workflow, title: "Chatbot e fluxos", desc: "Menus, perguntas e caminhos que levam o aluno ao atendimento certo ou ao CRM." },
      { to: "/ai-agents", icon: Bot, title: "Agentes de IA", desc: "Atendentes virtuais com instruções, conhecimento e regras para chamar uma pessoa.", badge: "ai" },
    ],
  },
  {
    id: "equipe", title: "Equipe e polos", hint: "Quem trabalha onde, e o que cada um precisa entregar",
    items: [
      { to: "/users", icon: Users, title: "Usuários", desc: "Acessos, funções (consultor, tutor, acadêmico, coordenação) e número pessoal de cada um." },
      { to: "/polos", icon: Building2, title: "Polos e equipes", desc: "Os polos, suas filas e as pessoas de cada função." },
      { to: "/crm/metas-polos", icon: Target, title: "Metas", desc: "Metas por polo (semestre e meses) e por consultor, com início e fim do período." },
    ],
  },
  {
    id: "crm", title: "CRM e captação", hint: "Funil, cursos, bolsas e indicações",
    items: [
      { to: "/crm/config", icon: GraduationCap, title: "Configurar CRM", desc: "Etapas do funil, cursos, bolsas, origens e motivos de perda." },
      { to: "/afiliados?aba=regras", icon: Share2, title: "Regras dos afiliados", desc: "Bonificação, Central do Afiliado, perguntas frequentes e vídeos." },
    ],
  },
  {
    id: "sistema", title: "Sistema", hint: "Só para o administrador", admin: true,
    items: [
      { to: "/settings", icon: Settings2, title: "Configurações gerais", desc: "Horário, fuso, metas de resposta, boas-vindas do tutor, pagamentos e chaves." },
      { to: "/integrations", icon: Code2, title: "API e webhooks", desc: "Chaves de acesso e avisos para outros sistemas." },
    ],
  },
];

const useStyles = makeStyles((theme) => ({
  body: { flex: 1, overflowY: "auto", overflowX: "hidden", ...theme.scrollbarStyles, paddingBottom: theme.spacing(4) },
  layout: { display: "grid", gridTemplateColumns: "220px minmax(0,1fr)", gap: theme.spacing(3), alignItems: "start", [theme.breakpoints.down("sm")]: { gridTemplateColumns: "1fr" } },
  rail: { position: "sticky", top: 0, display: "flex", flexDirection: "column", gap: 2, [theme.breakpoints.down("sm")]: { position: "static", flexDirection: "row", flexWrap: "wrap", gap: 6 } },
  railBtn: { border: 0, background: "transparent", color: theme.palette.text.secondary, textAlign: "left", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 600, padding: "8px 12px", borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, "&:hover": { background: theme.palette.action.hover, color: theme.palette.text.primary }, [theme.breakpoints.down("sm")]: { border: theme.border.divider } },
  railOn: { background: theme.palette.action.selected, color: theme.palette.text.primary },
  count: { fontSize: 12, opacity: 0.7, fontVariantNumeric: "tabular-nums" },
  section: { marginBottom: theme.spacing(3.5), scrollMarginTop: 8 },
  sectionTitle: { fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" },
  sectionHint: { fontSize: 13, color: theme.palette.text.secondary, marginBottom: theme.spacing(1.5) },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: theme.spacing(1.5) },
  card: {
    display: "flex", gap: 14, alignItems: "flex-start", padding: theme.spacing(2), borderRadius: 16, textDecoration: "none", color: "inherit", position: "relative",
    background: theme.palette.cards.background, border: theme.border.divider, transition: "transform .15s, box-shadow .15s, border-color .15s",
    "&:hover": { transform: "translateY(-2px)", boxShadow: "0 8px 22px rgba(11,66,121,.14)", borderColor: theme.palette.primary.main },
    "&:hover $arrow": { opacity: 1, transform: "translate(2px,-2px)" },
  },
  icon: { width: 42, height: 42, borderRadius: 12, display: "grid", placeItems: "center", flexShrink: 0, background: "rgba(6,147,227,.12)", color: theme.palette.primary.main },
  cardTitle: { fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 8 },
  cardDesc: { fontSize: 13, color: theme.palette.text.secondary, marginTop: 3, lineHeight: 1.45 },
  arrow: { position: "absolute", top: 14, right: 14, opacity: 0.35, transition: "opacity .15s, transform .15s" },
  warn: { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: "#b91c1c", background: "rgba(220,38,38,.12)", borderRadius: 999, padding: "2px 8px" },
  review: { fontSize: 11.5, fontWeight: 700, color: "#6b5d00", background: "rgba(254,248,76,.55)", borderRadius: 999, padding: "2px 8px" },
  empty: { textAlign: "center", color: theme.palette.text.secondary, padding: theme.spacing(6, 2) },
}));

const SettingsHub = () => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);
  const { whatsApps } = useContext(WhatsAppsContext);
  const [q, setQ] = useState("");
  const [aiReview, setAiReview] = useState(0);
  const [active, setActive] = useState("atendimento");
  const refs = useRef({});

  useEffect(() => { api.get("/ai-learnings/pending").then(({ data }) => setAiReview(data.count)).catch(() => {}); }, []);

  const offline = whatsApps.filter((w) => ["qrcode", "PAIRING", "DISCONNECTED", "TIMEOUT", "OPENING"].includes(w.status)).length;
  const sections = useMemo(() => {
    const term = q.trim().toLowerCase();
    return SECTIONS
      .filter((s) => !s.admin || isStrictAdmin(user))
      .map((s) => ({ ...s, items: s.items.filter((i) => !term || `${i.title} ${i.desc}`.toLowerCase().includes(term)) }))
      .filter((s) => s.items.length);
  }, [q, user]);

  const go = (id) => { setActive(id); const el = refs.current[id]; if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" }); };

  return (
    <MainContainer>
      <MainHeader>
        <Title>Configurações</Title>
        <TextField size="small" variant="outlined" placeholder="Buscar uma configuração" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment> }} />
      </MainHeader>
      <div className={classes.body}>
        <div className={classes.layout}>
          <nav className={classes.rail} aria-label="Grupos de configurações">
            {sections.map((s) => (
              <button key={s.id} type="button" className={`${classes.railBtn} ${active === s.id ? classes.railOn : ""}`} onClick={() => go(s.id)}>
                <span>{s.title}</span><span className={classes.count}>{s.items.length}</span>
              </button>
            ))}
          </nav>
          <div>
            {sections.length === 0 && <div className={classes.empty}>Nenhuma configuração com “{q}”.</div>}
            {sections.map((s) => (
              <section key={s.id} className={classes.section} ref={(el) => { refs.current[s.id] = el; }}>
                <div className={classes.sectionTitle}>{s.title}</div>
                <div className={classes.sectionHint}>{s.hint}</div>
                <div className={classes.grid}>
                  {s.items.map((i) => {
                    const Icon = i.icon;
                    return (
                      <Link key={i.to} to={i.to} className={classes.card}>
                        <span className={classes.icon}><Icon size={22} /></span>
                        <span style={{ minWidth: 0 }}>
                          <span className={classes.cardTitle}>
                            {i.title}
                            {i.badge === "connections" && offline > 0 && <span className={classes.warn}><CircleDot size={11} /> {offline} {offline === 1 ? "desconectado" : "desconectados"}</span>}
                            {i.badge === "ai" && aiReview > 0 && <span className={classes.review}>{aiReview} para revisar</span>}
                          </span>
                          <span className={classes.cardDesc} style={{ display: "block" }}>{i.desc}</span>
                        </span>
                        <ArrowUpRight size={16} className={classes.arrow} />
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </MainContainer>
  );
};

export default SettingsHub;
