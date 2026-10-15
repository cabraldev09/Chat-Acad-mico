import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Link, useHistory, useLocation } from "react-router-dom";
import { toast } from "react-toastify";
import { Button, FormControlLabel, InputAdornment, MenuItem, Paper, Switch, TextField, Typography, makeStyles } from "@material-ui/core";
import {
  ArrowUpRight, BellRing, Bot, Building2, Clock, CreditCard, Eye, EyeOff, FileInput, GraduationCap, KeyRound, ListTree, Plug, Search,
  Settings2, Tags, Users, Workflow, Zap, Copy, SlidersHorizontal, Bug, Trash2,
} from "lucide-react";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import TimezoneSelect from "../../components/TimezoneSelect";
import { Automation, Capture, EfiSettings, HoursAndAlerts } from "../CRM/Settings";
import { AuthContext } from "../../context/Auth/AuthContext";
import { WhatsAppsContext } from "../../context/WhatsApp/WhatsAppsContext";
import { isManager } from "../../utils/access";
import openSocket from "../../services/socket-io";
import api from "../../services/api";
import toastError from "../../errors/toastError";

// Configurações: where the rules of the system are set. Each group holds the real controls (saved as soon as they change);
// "Cadastros" shows what exists (connections, people, polos...) with a way into each list.
const GROUPS = [
  { id: "geral", label: "Geral", icon: Settings2, hint: "Fuso, acesso e integração" },
  { id: "horario", label: "Horário e prazos", icon: Clock, hint: "Expediente e metas de resposta" },
  { id: "atendimento", label: "Atendimento e CRM", icon: SlidersHorizontal, hint: "Distribuição, lembretes e períodos" },
  { id: "tutoria", label: "Tutoria (acadêmico)", icon: BellRing, hint: "Boas-vindas e prazo do 1º contato" },
  { id: "captacao", label: "Captação", icon: FileInput, hint: "Formulário público e API" },
  { id: "pagamentos", label: "Pagamentos", icon: CreditCard, hint: "Taxa de matrícula (Efí)", admin: true },
  { id: "cadastros", label: "Cadastros", icon: ListTree, hint: "Conexões, equipe, polos, filas" },
  { id: "erros", label: "Erros de tela", icon: Bug, hint: "Telas que falharam no navegador de alguém", admin: true },
];

const useStyles = makeStyles((theme) => ({
  body: { flex: 1, overflowY: "auto", overflowX: "hidden", ...theme.scrollbarStyles, paddingBottom: theme.spacing(4) },
  layout: { display: "grid", gridTemplateColumns: "250px minmax(0,1fr)", gap: theme.spacing(3), alignItems: "start", [theme.breakpoints.down("sm")]: { gridTemplateColumns: "1fr" } },
  rail: { position: "sticky", top: 0, display: "flex", flexDirection: "column", gap: 2, [theme.breakpoints.down("sm")]: { position: "static", flexDirection: "row", flexWrap: "wrap", gap: 6 } },
  railBtn: {
    border: 0, background: "transparent", color: theme.palette.text.secondary, textAlign: "left", cursor: "pointer", fontFamily: "inherit", padding: "9px 12px", borderRadius: 12,
    display: "flex", gap: 11, alignItems: "center", "&:hover": { background: theme.palette.action.hover, color: theme.palette.text.primary },
    [theme.breakpoints.down("sm")]: { border: theme.border.divider },
  },
  railOn: { background: theme.palette.action.selected, color: theme.palette.text.primary },
  railLabel: { fontSize: 14, fontWeight: 600, lineHeight: 1.2 },
  railHint: { fontSize: 11.5, opacity: 0.75, [theme.breakpoints.down("sm")]: { display: "none" } },
  panel: { display: "grid", gap: theme.spacing(2), maxWidth: 820 },
  head: { marginBottom: theme.spacing(0.5) },
  h: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" },
  sub: { fontSize: 13.5, color: theme.palette.text.secondary, marginTop: 2 },
  card: { borderRadius: 16, padding: theme.spacing(2.25), display: "grid", gap: theme.spacing(1.25), background: theme.palette.cards.background },
  cardTitle: { fontWeight: 700, fontSize: 15 },
  hint: { fontSize: 12.5, color: theme.palette.text.secondary },
  row: { display: "flex", gap: theme.spacing(1), alignItems: "center", flexWrap: "wrap" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: theme.spacing(1.5) },
  tile: {
    display: "flex", gap: 12, alignItems: "flex-start", padding: theme.spacing(1.75), borderRadius: 14, textDecoration: "none", color: "inherit", position: "relative",
    background: theme.palette.cards.background, border: theme.border.divider, transition: "transform .15s, box-shadow .15s, border-color .15s",
    "&:hover": { transform: "translateY(-2px)", boxShadow: "0 8px 22px rgba(11,66,121,.14)", borderColor: theme.palette.primary.main },
  },
  tileIcon: { width: 38, height: 38, borderRadius: 11, display: "grid", placeItems: "center", flexShrink: 0, background: "rgba(6,147,227,.12)", color: theme.palette.primary.main },
  count: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.1, fontVariantNumeric: "tabular-nums" },
  conn: { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: theme.border.divider, "&:first-of-type": { borderTop: 0 } },
  dot: { width: 9, height: 9, borderRadius: "50%", flexShrink: 0 },
}));

const STATUS = {
  CONNECTED: ["Conectado", "#16a34a"],
  qrcode: ["Aguardando o QR Code", "#d97706"],
  PAIRING: ["Pareando", "#d97706"],
  OPENING: ["Abrindo", "#d97706"],
  DISCONNECTED: ["Desconectado", "#dc2626"],
  TIMEOUT: ["Sem resposta", "#dc2626"],
};
const HOURS = [4, 8, 12, 24, 48, 72];
const REMINDER = [0, 15, 30, 60, 120];

const Card = ({ title, sub, children }) => {
  const classes = useStyles();
  return (
    <Paper variant="outlined" className={classes.card}>
      <div><div className={classes.cardTitle}>{title}</div>{sub && <div className={classes.hint}>{sub}</div>}</div>
      {children}
    </Paper>
  );
};

// the settings of the system, saved as soon as they change
const useSettings = () => {
  const [values, setValues] = useState(null);
  useEffect(() => {
    api.get("/settings").then(({ data }) => setValues(Object.fromEntries(data.map((s) => [s.key, s.value])))).catch((e) => { toastError(e); setValues({}); });
    const socket = openSocket();
    socket.on("settings", (d) => { if (d.action === "update") setValues((cur) => ({ ...cur, [d.setting.key]: d.setting.value })); });
    return () => socket.disconnect();
  }, []);
  const save = useCallback(async (key, value) => {
    let previous;
    setValues((cur) => { previous = cur && cur[key]; return { ...cur, [key]: value }; });
    try { await api.put(`/settings/${key}`, { value: String(value) }); toast.success("Configuração salva."); } catch (err) { setValues((cur) => ({ ...cur, [key]: previous })); toastError(err); }
  }, []);
  return [values, save];
};

// the CRM rules (distribution, hours, form...) live in their own endpoint
const useCrm = (enabled) => {
  const [s, setS] = useState({});
  const [users, setUsers] = useState([]);
  useEffect(() => {
    if (!enabled) return;
    api.get("/crm/settings").then(({ data }) => setS(data)).catch(toastError);
    api.get("/users", { params: { pageNumber: 1 } }).then(({ data }) => setUsers(data.users || [])).catch(() => undefined);
  }, [enabled]);
  const save = async (patch) => {
    try { const { data } = await api.put("/crm/settings", patch); setS(data); toast.success("Salvo."); } catch (err) { toastError(err); }
  };
  return { s, setS, save, users };
};

const Geral = ({ values, save, admin }) => {
  const classes = useStyles();
  const [show, setShow] = useState(false);
  const token = values.userApiToken || "";
  return (
    <>
      <Card title="Empresa e horário" sub="Todos os horários e o “hoje” dos relatórios seguem este fuso.">
        <TimezoneSelect value={values.appTimezone || "America/Porto_Velho"} onChange={(v) => save("appTimezone", v)} />
        <div className={classes.hint}>Os dados são guardados em UTC; só a exibição e a contagem do dia mudam.</div>
      </Card>
      <Card title="Números de WhatsApp por pessoa" sub="Cada pessoa conecta o próprio número em Conexões e as conversas dele ficam com ela.">
        <TextField select variant="outlined" size="small" label="Limite por pessoa" value={Number(values.max_connections_per_user || 1)} onChange={(e) => save("max_connections_per_user", e.target.value)} style={{ maxWidth: 260 }} InputLabelProps={{ shrink: true }}>
          {[1, 2, 3].map((n) => (<MenuItem key={n} value={n}>{n} {n === 1 ? "número" : "números"}</MenuItem>))}
        </TextField>
      </Card>
      {admin && (
        <>
          <Card title="Acesso" sub="Quem pode entrar no sistema.">
            <FormControlLabel control={<Switch color="primary" checked={values.userCreation === "enabled"} onChange={(e) => save("userCreation", e.target.checked ? "enabled" : "disabled")} />}
              label={values.userCreation === "enabled" ? "Cadastro público: ligado" : "Cadastro público: desligado"} />
            <div className={classes.hint}>{values.userCreation === "enabled" ? "Qualquer pessoa com o endereço consegue criar uma conta. Mantenha desligado e crie os usuários em Usuários." : "Só o administrador cria usuários. É o recomendado."}</div>
          </Card>
          <Card title="Integração" sub="Token usado pelas integrações externas (API). Trate como uma senha.">
            <div className={classes.row}>
              <TextField style={{ flex: "1 1 260px" }} variant="outlined" size="small" label="Token da API" value={token} type={show ? "text" : "password"} InputProps={{ readOnly: true }} />
              <Button variant="outlined" onClick={() => setShow((v) => !v)} startIcon={show ? <EyeOff size={15} /> : <Eye size={15} />}>{show ? "Ocultar" : "Mostrar"}</Button>
              <Button variant="outlined" disabled={!token} startIcon={<Copy size={15} />} onClick={() => { navigator.clipboard.writeText(token); toast.success("Token copiado."); }}>Copiar</Button>
            </div>
            <div className={classes.hint}>Para criar tokens por integração e cadastrar webhooks, use <Link to="/integrations">API e webhooks</Link>.</div>
          </Card>
        </>
      )}
    </>
  );
};

const Horario = ({ values, save, crm }) => {
  const classes = useStyles();
  return (
    <>
      <Card title="Expediente e alerta de lead sem resposta" sub="Com o horário ligado, o tempo de resposta e os alertas contam só as horas de trabalho.">
        <HoursAndAlerts s={crm.s} save={crm.save} />
      </Card>
      <Card title="Meta de tempo de resposta" sub="Usada nas Estatísticas para dizer quantos clientes foram respondidos no prazo e quem está esperando.">
        <TextField select variant="outlined" size="small" label="Responder em até" value={Number(values.response_sla_minutes || 15)} onChange={(e) => save("response_sla_minutes", e.target.value)} style={{ maxWidth: 260 }} InputLabelProps={{ shrink: true }}>
          {[5, 10, 15, 30, 60].map((m) => (<MenuItem key={m} value={m}>{m} minutos</MenuItem>))}
        </TextField>
        <div className={classes.hint}>É a meta geral das conversas. O alerta de lead novo sem resposta, acima, é outro aviso e tem o próprio prazo.</div>
      </Card>
    </>
  );
};

const Atendimento = ({ values, save, crm }) => {
  const classes = useStyles();
  return (
    <>
      <Automation s={crm.s} setS={crm.setS} save={crm.save} users={crm.users} />
      <Card title="Chatbot" sub="Quando o bot lembra quem parou no meio do menu.">
        <TextField select variant="outlined" size="small" label="Lembrar quem largou o chatbot após" value={Number(values.chatbot_reminder_minutes ?? 30)} onChange={(e) => save("chatbot_reminder_minutes", e.target.value)} style={{ maxWidth: 320 }} InputLabelProps={{ shrink: true }}>
          {REMINDER.map((m) => (<MenuItem key={m} value={m}>{m === 0 ? "Não lembrar" : `${m} minutos`}</MenuItem>))}
        </TextField>
        <div className={classes.hint}>Os menus e fluxos em si ficam em <Link to="/chatbot">Chatbot e fluxos</Link>.</div>
      </Card>
    </>
  );
};

const Tutoria = ({ values, save }) => {
  const classes = useStyles();
  const { whatsApps } = useContext(WhatsAppsContext);
  const numbers = (whatsApps || []).filter((w) => (w.channel || "whatsapp") === "whatsapp" || w.channel === "whatsapp_cloud");
  return (
    <>
      <Card title="Boas-vindas do tutor" sub="O texto que o tutor recebe pronto na conversa do aluno recém-matriculado.">
        <TextField fullWidth multiline rows={5} variant="outlined" label="Mensagem de boas-vindas"
          defaultValue={values.onboarding_welcome_template || ""} key={values.onboarding_welcome_template || "vazio"}
          placeholder="Olá, {{primeiro_nome}}! Parabéns pela matrícula! Eu sou {{tutor}}, do polo {{polo}}..."
          onBlur={(e) => { if (e.target.value !== (values.onboarding_welcome_template || "")) save("onboarding_welcome_template", e.target.value); }}
          InputLabelProps={{ shrink: true }} />
        <div className={classes.hint}>O sistema nunca envia esta mensagem sozinho: o tutor vê o texto no campo de mensagem, edita se quiser e envia. Variáveis: {"{{primeiro_nome}}"}, {"{{nome}}"}, {"{{tutor}}"} e {"{{polo}}"}. Em branco, vale um texto padrão.</div>
      </Card>
      <Card title="Prazo do primeiro contato" sub="O sistema avisa a tutoria e a coordenação quando o aluno passa deste tempo sem contato depois da matrícula.">
        <TextField select variant="outlined" size="small" label="Alertar após" value={Number(values.onboarding_sla_hours || 24)} onChange={(e) => save("onboarding_sla_hours", e.target.value)} style={{ maxWidth: 260 }} InputLabelProps={{ shrink: true }}>
          {HOURS.map((h) => (<MenuItem key={h} value={h}>{h} horas</MenuItem>))}
        </TextField>
      </Card>
      <Card title="Número da tutoria" sub="A conversa de ambientação sai pelo número do próprio tutor. Quando ele não tem um, usa este.">
        <TextField select variant="outlined" size="small" label="Número padrão da tutoria" value={Number(values.tutoria_whatsapp_id || 0)} onChange={(e) => save("tutoria_whatsapp_id", e.target.value)} style={{ maxWidth: 360 }} InputLabelProps={{ shrink: true }}>
          <MenuItem value={0}>Nenhum (usa um número compartilhado)</MenuItem>
          {numbers.map((w) => (<MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>))}
        </TextField>
      </Card>
    </>
  );
};

const Pagamentos = () => {
  const [stages, setStages] = useState([]);
  useEffect(() => { api.get("/lead-stages").then(({ data }) => setStages(data)).catch(() => undefined); }, []);
  return <EfiSettings stages={stages} />;
};

const REGISTRY = [
  { to: "/connections", icon: Plug, title: "Conexões", what: "números e canais", key: "connections" },
  { to: "/users", icon: Users, title: "Usuários", what: "pessoas com acesso", key: "users" },
  { to: "/polos", icon: Building2, title: "Polos e equipes", what: "polos", key: "polos" },
  { to: "/queues", icon: ListTree, title: "Filas", what: "filas de atendimento", key: "queues" },
  { to: "/tags", icon: Tags, title: "Etiquetas", what: "etiquetas", key: "tags" },
  { to: "/quickAnswers", icon: Zap, title: "Respostas rápidas", what: "mensagens prontas", key: "quick" },
  { to: "/chatbot", icon: Workflow, title: "Chatbot e fluxos", what: "opções no menu do bot", key: "chatbot" },
  { to: "/ai-agents", icon: Bot, title: "Agentes de IA", what: "agentes", key: "agents" },
  { to: "/crm/config", icon: GraduationCap, title: "Funil, cursos e propostas", what: "etapas do funil", key: "stages" },
  { to: "/monitor", icon: Eye, title: "Monitor ao vivo", what: "conversas em andamento", key: null },
  { to: "/integrations", icon: KeyRound, title: "API e webhooks", what: "tokens e avisos", key: null, admin: true },
];

const Cadastros = ({ admin }) => {
  const classes = useStyles();
  const { whatsApps } = useContext(WhatsAppsContext);
  const [counts, setCounts] = useState({});
  const [health, setHealth] = useState([]);
  useEffect(() => {
    api.get("/whatsapp-health").then(({ data }) => setHealth(data)).catch(() => undefined);
    const count = (key, url, pick) => api.get(url).then(({ data }) => setCounts((c) => ({ ...c, [key]: pick(data) }))).catch(() => undefined);
    const len = (d) => (Array.isArray(d) ? d.length : (d.rows || d.polos || d.users || d.queues || d.tags || d.quickAnswers || []).length);
    count("users", "/users", (d) => (d.count !== undefined ? d.count : len(d)));
    count("polos", "/polos", len);
    count("queues", "/queue", len);
    count("tags", "/tags", len);
    count("quick", "/quickAnswers", len);
    count("chatbot", "/chatbot", len);
    count("agents", "/ai-agents", len);
    count("stages", "/lead-stages", len);
  }, []);
  const list = whatsApps || [];
  const online = list.filter((w) => w.status === "CONNECTED").length;
  return (
    <>
      <Card title="Conexões agora" sub="O estado de cada número e canal. Gerencie e leia os QR Codes em Conexões.">
        {list.length === 0 && <div className={classes.hint}>Nenhuma conexão cadastrada.</div>}
        {list.map((w) => {
          const [label, color] = STATUS[w.status] || [w.status || "—", "#7b8a9d"];
          const h = health.find((x) => x.id === w.id);
          const mins = w.statusSince ? Math.max(0, Math.floor((Date.now() - new Date(w.statusSince).getTime()) / 60000)) : null;
          return (
            <div key={w.id} className={classes.conn}>
              <span className={classes.dot} style={{ background: color }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.name}</span>
                {h && <span className={classes.hint}>Hoje: {h.receivedToday} recebidas · {h.sentToday} enviadas{h.lastMessageAt ? ` · última mensagem ${new Date(h.lastMessageAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}{h.ownerName ? ` · de ${h.ownerName}` : ""}</span>}
              </span>
              <span className={classes.hint} style={{ textAlign: "right" }}>{label}{w.status !== "CONNECTED" && mins !== null ? ` há ${mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h`}` : ""}</span>
            </div>
          );
        })}
        {list.length > 0 && <div className={classes.hint}>{online} de {list.length} conectad{online === 1 ? "a" : "as"}.</div>}
        <div><Button component={Link} to="/connections" variant="outlined" size="small">Gerenciar conexões</Button></div>
      </Card>
      <div className={classes.grid}>
        {REGISTRY.filter((r) => r.key !== "connections" && (!r.admin || admin)).map((r) => {
          const Icon = r.icon;
          const n = r.key ? counts[r.key] : null;
          return (
            <Link key={r.to} to={r.to} className={classes.tile}>
              <span className={classes.tileIcon}><Icon size={20} /></span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 700, fontSize: 14.5 }}>{r.title}</span>
                {n !== null && n !== undefined ? <span className={classes.count}>{n}</span> : null}
                <span className={classes.hint} style={{ display: "block" }}>{r.what}</span>
              </span>
              <ArrowUpRight size={15} style={{ position: "absolute", top: 12, right: 12, opacity: 0.35 }} />
            </Link>
          );
        })}
      </div>
    </>
  );
};

// every screen that failed to draw in someone's browser, with the code shown on that person's screen
const ErrosDeTela = () => {
  const classes = useStyles();
  const [rows, setRows] = useState(null);
  const [code, setCode] = useState("");
  const load = useCallback(() => {
    api.get("/client-errors", { params: code.trim() ? { code: code.trim() } : {} }).then(({ data }) => setRows(Array.isArray(data) ? data : [])).catch((e) => { setRows([]); toastError(e); });
  }, [code]);
  useEffect(() => { load(); }, [load]);
  const clear = async () => {
    if (!window.confirm("Apagar todos os registros de erro de tela?")) return;
    try { await api.delete("/client-errors"); setRows([]); toast.success("Registros apagados"); } catch (e) { toastError(e); }
  };
  return (
    <Paper variant="outlined" className={classes.card}>
      <div className={classes.row}>
        <TextField size="small" variant="outlined" label="Código do erro" value={code} onChange={(e) => setCode(e.target.value)} style={{ width: 180 }} />
        <Button variant="outlined" onClick={load}>Buscar</Button>
        <span style={{ flex: 1 }} />
        <Button variant="outlined" color="secondary" startIcon={<Trash2 size={15} />} onClick={clear} disabled={!rows || !rows.length}>Limpar</Button>
      </div>
      <div className={classes.hint}>O código aparece na tela de erro de quem teve o problema. Aqui ficam a tela, a mensagem e o trecho que falhou.</div>
      {rows === null && <Typography className={classes.hint}>Carregando...</Typography>}
      {rows && rows.length === 0 && <Typography className={classes.hint}>Nenhum erro registrado.</Typography>}
      {(rows || []).map((r) => (
        <div key={r.id} style={{ borderTop: "1px solid rgba(127,140,160,.25)", paddingTop: 10 }}>
          <div className={classes.row}>
            <b style={{ fontFamily: "monospace" }}>{r.code}</b>
            <span className={classes.hint}>{new Date(r.createdAt).toLocaleString("pt-BR")} · {r.route} · usuário {r.userId || "-"} ({r.role || "-"})</span>
          </div>
          <div style={{ fontSize: 13.5, marginTop: 2, overflowWrap: "anywhere" }}>{r.message}</div>
          <details>
            <summary className={classes.hint} style={{ cursor: "pointer" }}>Detalhes</summary>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 11.5, overflowWrap: "anywhere", margin: "6px 0 0" }}>{`${r.stack || ""}\n${r.components || ""}\n${r.userAgent || ""}`}</pre>
          </details>
        </div>
      ))}
    </Paper>
  );
};

const SettingsHub = () => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);
  const history = useHistory();
  const { search } = useLocation();
  const admin = isManager(user); // the coordination has the same powers as the administrator
  const groups = useMemo(() => GROUPS.filter((g) => !g.admin || admin), [admin]);
  const wanted = new URLSearchParams(search).get("secao");
  const [group, setGroup] = useState(groups.some((g) => g.id === wanted) ? wanted : "geral");
  const [q, setQ] = useState("");
  const [values, save] = useSettings();
  const crm = useCrm(true);

  useEffect(() => { if (groups.some((g) => g.id === wanted)) setGroup(wanted); }, [wanted, groups]);
  const open = (id) => { setGroup(id); history.replace(`/configuracoes?secao=${id}`); };

  // the search jumps to the group that holds the word
  const found = q.trim() ? groups.filter((g) => `${g.label} ${g.hint}`.toLowerCase().includes(q.trim().toLowerCase())) : groups;
  const current = groups.find((g) => g.id === group) || groups[0];

  return (
    <MainContainer>
      <MainHeader>
        <Title>Configurações</Title>
        <TextField size="small" variant="outlined" placeholder="Buscar um grupo" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 240 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment> }} />
      </MainHeader>
      <div className={classes.body}>
        <div className={classes.layout}>
          <nav className={classes.rail} aria-label="Grupos de configurações">
            {found.map((g) => {
              const Icon = g.icon;
              return (
                <button key={g.id} type="button" className={`${classes.railBtn} ${current.id === g.id ? classes.railOn : ""}`} onClick={() => open(g.id)}>
                  <Icon size={18} />
                  <span><span className={classes.railLabel} style={{ display: "block" }}>{g.label}</span><span className={classes.railHint}>{g.hint}</span></span>
                </button>
              );
            })}
            {found.length === 0 && <div className={classes.hint} style={{ padding: 8 }}>Nenhum grupo com “{q}”.</div>}
          </nav>
          <div className={classes.panel}>
            <div className={classes.head}>
              <div className={classes.h}>{current.label}</div>
              <div className={classes.sub}>{current.hint}</div>
            </div>
            {!values ? <Typography className={classes.hint}>Carregando...</Typography> : (
              <>
                {current.id === "geral" && <Geral values={values} save={save} admin={admin} />}
                {current.id === "horario" && <Horario values={values} save={save} crm={crm} />}
                {current.id === "atendimento" && <Atendimento values={values} save={save} crm={crm} />}
                {current.id === "tutoria" && <Tutoria values={values} save={save} />}
                {current.id === "captacao" && <Capture s={crm.s} setS={crm.setS} save={crm.save} />}
                {current.id === "pagamentos" && admin && <Pagamentos />}
                {current.id === "cadastros" && <Cadastros admin={admin} />}
                {current.id === "erros" && admin && <ErrosDeTela />}
              </>
            )}
          </div>
        </div>
      </div>
    </MainContainer>
  );
};

export default SettingsHub;
