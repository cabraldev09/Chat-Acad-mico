import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Link, useHistory, useLocation } from "react-router-dom";
import { toast } from "react-toastify";
import { Button, FormControlLabel, InputAdornment, MenuItem, Paper, Switch, TextField, Typography, makeStyles } from "@material-ui/core";
import {
  ArrowUpRight, BellRing, Bot, Building2, Clock, CreditCard, Eye, EyeOff, FileInput, GraduationCap, KeyRound, ListTree, Plug, Search,
  Settings2, Tags, Users, Workflow, Zap, Copy, SlidersHorizontal, Bug, Trash2, Mail, Calculator,
} from "lucide-react";

import MainContainer from "../../components/MainContainer";
import SectionBoundary from "../../components/SectionBoundary";
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
import { fetchAllUsersPage } from "../../utils/fetchAllUsers";
import { BUILD } from "../../utils/versionWatch";

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
  { id: "regras", label: "Regras acadêmicas", icon: Calculator, hint: "Vagas extras e semestres nas previsões", admin: true },
  { id: "email", label: "E-mail", icon: Mail, hint: "Conta de envio e modelos de e-mail", admin: true },
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
    fetchAllUsersPage().then(({ data }) => setUsers(data.users || [])).catch(() => undefined);
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
    count("chatbot", "/flows", len);
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

// the rules of the academic engine (curricular and academic analysis): how many extra disciplines a semester takes
const RegrasAcademicas = () => {
  const classes = useStyles();
  const [r, setR] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/analysis/rules").then(({ data }) => setR(data)).catch(toastError); }, []);
  if (!r) return <Typography className={classes.hint}>Carregando...</Typography>;
  const add = r.additionalSemesterCapacityRule || { type: "SAME_AS_LAST_PERIOD" };
  const save = async () => {
    setBusy(true);
    try { const { data } = await api.put("/analysis/rules", r); setR(data); toast.success("Regras salvas. As próximas análises e recálculos já usam estes valores."); } catch (e) { toastError(e); }
    setBusy(false);
  };
  return (
    <Paper variant="outlined" className={classes.card}>
      <div className={classes.cardTitle}>Regras das previsões</div>
      <div className={classes.hint}>Valem para a análise curricular (previsão de ingresso) e para a análise acadêmica (previsão de formatura). Uma análise já feita só muda quando for recalculada.</div>
      <div className={classes.row}>
        <TextField size="small" variant="outlined" type="number" label="Disciplinas extras por semestre" value={r.extraSubjectsAllowed} onChange={(e) => setR({ ...r, extraSubjectsAllowed: e.target.value })} style={{ width: 240 }} InputLabelProps={{ shrink: true }} helperText="Hoje: +3 além das do período" />
        <TextField size="small" variant="outlined" type="number" label="Máximo de disciplinas por semestre" value={r.maximumSubjectsPerSemester ?? ""} onChange={(e) => setR({ ...r, maximumSubjectsPerSemester: e.target.value === "" ? null : e.target.value })} style={{ width: 260 }} InputLabelProps={{ shrink: true }} helperText="Em branco: sem teto" />
        <TextField size="small" variant="outlined" type="number" label="Semestres adicionais simulados" value={r.maxAdditionalSemesters} onChange={(e) => setR({ ...r, maxAdditionalSemesters: e.target.value })} style={{ width: 230 }} InputLabelProps={{ shrink: true }} helperText="Limite de segurança" />
      </div>
      <div className={classes.row}>
        <TextField select size="small" variant="outlined" label="Se sobrar pendência depois do último período" value={add.type} onChange={(e) => setR({ ...r, additionalSemesterCapacityRule: e.target.value === "FIXED_VALUE" ? { type: "FIXED_VALUE", value: add.value || 11 } : { type: e.target.value } })} style={{ minWidth: 340 }} InputLabelProps={{ shrink: true }}>
          <MenuItem value="SAME_AS_LAST_PERIOD">Cria semestres com a mesma capacidade do último período</MenuItem>
          <MenuItem value="FIXED_VALUE">Cria semestres com um número fixo de disciplinas</MenuItem>
          <MenuItem value="UNCONFIGURED">Não cria: a previsão fica em aberto com aviso</MenuItem>
        </TextField>
        {add.type === "FIXED_VALUE" && <TextField size="small" variant="outlined" type="number" label="Disciplinas por semestre" value={add.value || ""} onChange={(e) => setR({ ...r, additionalSemesterCapacityRule: { type: "FIXED_VALUE", value: e.target.value } })} style={{ width: 200 }} InputLabelProps={{ shrink: true }} />}
        <FormControlLabel control={<Switch color="primary" checked={!!r.reviewCountsAsPending} onChange={(e) => setR({ ...r, reviewCountsAsPending: e.target.checked })} />} label="Disciplina “a revisar” conta como pendente" />
      </div>
      <div><Button variant="contained" color="primary" onClick={save} disabled={busy}>Salvar</Button></div>
    </Paper>
  );
};

// the e-mail account the system sends from ("Esqueci minha senha"). The password is typed here and never comes back.
const Email = () => {
  const classes = useStyles();
  const [f, setF] = useState(null);
  const [pass, setPass] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/mail/settings").then(({ data }) => setF(data)).catch(toastError); }, []);
  if (!f) return <Typography className={classes.hint}>Carregando...</Typography>;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    try {
      const body = { host: f.host, port: Number(f.port), secure: !!f.secure, user: f.user, fromName: f.fromName };
      if (pass.trim()) body.pass = pass;
      const { data } = await api.put("/mail/settings", body);
      setF(data);
      setPass("");
      toast.success("E-mail salvo.");
    } catch (e) { toastError(e); }
    setBusy(false);
  };
  const test = async () => {
    setBusy(true);
    try { const { data } = await api.post("/mail/test", {}); toast.success(`E-mail de teste enviado para ${data.to}.`); } catch (e) { toastError(e); }
    setBusy(false);
  };
  return (
    <Paper variant="outlined" className={classes.card}>
      <div className={classes.cardTitle}>Conta de e-mail do sistema</div>
      <div className={classes.hint}>
        É daqui que sai o e-mail do “Esqueci minha senha”. Para uma conta Gmail, ative a verificação em duas etapas, crie uma “senha de app” em myaccount.google.com/apppasswords e digite aqui. Você pode trocar a conta quando quiser.
      </div>
      <TextField size="small" variant="outlined" label="E-mail que envia" value={f.user || ""} onChange={set("user")} fullWidth InputLabelProps={{ shrink: true }} />
      <TextField size="small" variant="outlined" label={f.hasPassword ? "Senha de app (já salva; digite só para trocar)" : "Senha de app"} type={show ? "text" : "password"} value={pass} onChange={(e) => setPass(e.target.value)} fullWidth autoComplete="new-password"
        placeholder={f.hasPassword ? "••••••••" : "xxxx xxxx xxxx xxxx"} InputLabelProps={{ shrink: true }}
        InputProps={{ endAdornment: <InputAdornment position="end"><Button size="small" onClick={() => setShow((v) => !v)}>{show ? "Ocultar" : "Mostrar"}</Button></InputAdornment> }} />
      <TextField size="small" variant="outlined" label="Nome que aparece como remetente" value={f.fromName || ""} onChange={set("fromName")} fullWidth InputLabelProps={{ shrink: true }} />
      <div className={classes.row}>
        <TextField size="small" variant="outlined" label="Servidor" value={f.host || ""} onChange={set("host")} style={{ flex: 1, minWidth: 200 }} InputLabelProps={{ shrink: true }} />
        <TextField size="small" variant="outlined" label="Porta" type="number" value={f.port || ""} onChange={set("port")} style={{ width: 110 }} InputLabelProps={{ shrink: true }} />
        <FormControlLabel control={<Switch color="primary" checked={!!f.secure} onChange={(e) => setF({ ...f, secure: e.target.checked })} />} label="Conexão segura (SSL)" />
      </div>
      <div className={classes.row}>
        <Button variant="contained" color="primary" onClick={save} disabled={busy}>Salvar</Button>
        <Button variant="outlined" onClick={test} disabled={busy || !f.hasPassword}>Enviar e-mail de teste para mim</Button>
        <span className={classes.hint}>{f.hasPassword ? "Senha salva." : "Falta digitar a senha de app."}</span>
      </div>
    </Paper>
  );
};

// the e-mails the system sends: what each is for, when it goes out, and how it looks (with example data)
const EmailModels = () => {
  const classes = useStyles();
  const [list, setList] = useState(null);
  const [key, setKey] = useState("");
  const [view, setView] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/mail/templates").then(({ data }) => { setList(data); if (data[0]) setKey(data[0].key); }).catch(toastError); }, []);
  useEffect(() => { if (!key) return; setView(null); api.get(`/mail/templates/${key}/preview`).then(({ data }) => setView(data)).catch(toastError); }, [key]);
  if (!list) return null;
  const current = list.find((t) => t.key === key);
  const send = async () => {
    setBusy(true);
    try { const { data } = await api.post(`/mail/templates/${key}/test`, {}); toast.success(`Exemplo enviado para ${data.to}.`); } catch (e) { toastError(e); }
    setBusy(false);
  };
  return (
    <Paper variant="outlined" className={classes.card}>
      <div className={classes.cardTitle}>E-mails do sistema</div>
      <div className={classes.hint}>Todos usam o mesmo modelo, com a marca, um botão principal e o motivo do envio. Escolha um para ver como a pessoa recebe.</div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 300px) minmax(0, 1fr)", gap: 16 }}>
        <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
          {list.map((t) => (
            <button key={t.key} type="button" onClick={() => setKey(t.key)}
              style={{ textAlign: "left", cursor: "pointer", padding: "10px 12px", borderRadius: 10, border: `1px solid ${t.key === key ? "#0B4279" : "rgba(128,128,128,.3)"}`, background: t.key === key ? "rgba(11,66,121,.08)" : "transparent", color: "inherit", font: "inherit" }}>
              <div style={{ fontWeight: 600 }}>{t.title}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{t.audience} · {t.automatic ? "automático" : "manual"}</div>
            </button>
          ))}
        </div>
        <div style={{ minWidth: 0 }}>
          {current && <>
            <div style={{ fontWeight: 600 }}>{view ? view.subject : current.subject}</div>
            <div className={classes.hint} style={{ marginBottom: 8 }}>{current.trigger}</div>
            <div className={classes.row} style={{ marginBottom: 8 }}>
              <Button variant="outlined" size="small" onClick={send} disabled={busy}>Enviar este exemplo para mim</Button>
            </div>
            <iframe title="Prévia do e-mail" sandbox="" srcDoc={view ? view.html : ""} style={{ width: "100%", height: 560, border: "1px solid rgba(128,128,128,.3)", borderRadius: 10, background: "#eef2f7" }} />
          </>}
        </div>
      </div>
    </Paper>
  );
};

// every screen that failed to draw in someone's browser. "Resumo" groups the same failure (screen + message) with how often,
// how many people and which versions of the code; "Registros" lists each one with the code shown on that person's screen.
// the date of a failure in the timezone of the system (Rondônia), not the one of whoever has the browser open, and how long ago
const errWhen = (v) => {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  const at = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Porto_Velho", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(d).replace(",", " às");
  const min = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  const ago = min < 1 ? "agora" : min < 60 ? `há ${min} min` : min < 1440 ? `há ${Math.floor(min / 60)} h` : `há ${Math.floor(min / 1440)} d`;
  return `${at} (${ago})`;
};

const ErrosDeTela = () => {
  const classes = useStyles();
  const [view, setView] = useState("resumo");
  const [days, setDays] = useState(30);
  const [onlyCurrent, setOnlyCurrent] = useState(true);
  const [groups, setGroups] = useState(null);
  const [rows, setRows] = useState(null);
  const [code, setCode] = useState("");

  const loadGroups = useCallback(() => {
    api.get("/client-errors/summary", { params: { days } }).then(({ data }) => setGroups(Array.isArray(data) ? data : [])).catch((e) => { setGroups([]); toastError(e); });
  }, [days]);
  const loadRows = useCallback(() => {
    api.get("/client-errors", { params: code.trim() ? { code: code.trim() } : {} }).then(({ data }) => setRows(Array.isArray(data) ? data : [])).catch((e) => { setRows([]); toastError(e); });
  }, [code]);
  useEffect(() => { if (view === "resumo") loadGroups(); else loadRows(); }, [view, loadGroups, loadRows]);

  const clear = async () => {
    if (!window.confirm("Apagar todos os registros de erro de tela?")) return;
    try { await api.delete("/client-errors"); setRows([]); setGroups([]); toast.success("Registros apagados"); } catch (e) { toastError(e); }
  };
  const mark = async (g, resolved) => {
    try { await api.put("/client-errors/resolve", { route: g.route, message: g.message, resolved }); loadGroups(); } catch (e) { toastError(e); }
  };
  // the failure happened on the version of the code that is open here, only on older ones, or on one that did not say
  const kind = (g) => ((g.builds || []).length === 0 ? "unknown" : g.builds.includes(BUILD) ? "current" : "old");
  // a record without a version is from before the versions were recorded: always an old code
  const isOld = (g) => kind(g) !== "current";
  const shown = (groups || []).filter((g) => !onlyCurrent || !isOld(g));

  const tag = (text, color) => <span style={{ fontSize: 11.5, padding: "2px 8px", borderRadius: 10, background: `${color}22`, color, whiteSpace: "nowrap" }}>{text}</span>;

  return (
    <Paper variant="outlined" className={classes.card}>
      <div className={classes.row}>
        <Button variant={view === "resumo" ? "contained" : "outlined"} color="primary" onClick={() => setView("resumo")}>Resumo</Button>
        <Button variant={view === "registros" ? "contained" : "outlined"} color="primary" onClick={() => setView("registros")}>Registros</Button>
        <span style={{ flex: 1 }} />
        <Button variant="outlined" color="secondary" startIcon={<Trash2 size={15} />} onClick={clear}>Limpar</Button>
      </div>

      {view === "resumo" ? (
        <>
          <div className={classes.row}>
            <TextField select size="small" variant="outlined" label="Período" value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 150 }} SelectProps={{ native: true }}>
              <option value={7}>7 dias</option><option value={30}>30 dias</option><option value={90}>90 dias</option>
            </TextField>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
              <input type="checkbox" checked={onlyCurrent} onChange={(e) => setOnlyCurrent(e.target.checked)} style={{ appearance: "auto" }} />
              Esconder o que só aconteceu em versões antigas
            </label>
          </div>
          <div className={classes.hint}>Uma aba aberta antes de uma atualização continua com o código velho: um erro que só aparece em versões antigas já foi corrigido, basta atualizar a página. Versão atual desta tela: <b style={{ fontFamily: "monospace" }}>{BUILD}</b>.</div>
          {groups === null && <Typography className={classes.hint}>Carregando...</Typography>}
          {groups && shown.length === 0 && <Typography className={classes.hint}>{groups.length ? "Nada na versão atual. Desmarque o filtro para ver as versões antigas." : "Nenhum erro registrado nesse período."}</Typography>}
          {shown.map((g) => {
            const k = kind(g);
            return (
              <div key={`${g.route}|${g.message}`} style={{ borderTop: "1px solid rgba(127,140,160,.25)", paddingTop: 10, opacity: g.resolved ? 0.6 : 1 }}>
                <div className={classes.row}>
                  <b style={{ fontFamily: "monospace" }}>{g.route || "(sem tela)"}</b>
                  {g.resolved ? tag("Corrigido", "#15803d") : k === "current" ? tag("Versão atual", "#b45309") : k === "old" ? tag("Só versão antiga", "#6b7a85") : tag("Antes do registro de versões", "#6b7a85")}
                  <span className={classes.hint}>{g.n} {g.n === 1 ? "vez" : "vezes"} · {g.users} {g.users === 1 ? "pessoa" : "pessoas"} · última em {errWhen(g.lastAt)}</span>
                  <span style={{ flex: 1 }} />
                  <Button size="small" variant="outlined" onClick={() => mark(g, !g.resolved)}>{g.resolved ? "Reabrir" : "Marcar como corrigido"}</Button>
                </div>
                <div style={{ fontSize: 13.5, marginTop: 2, overflowWrap: "anywhere" }}>{g.message}</div>
                <div className={classes.hint}>Código mais recente: <b style={{ fontFamily: "monospace" }}>{g.code}</b>{(g.builds || []).length ? ` · versões: ${g.builds.join(", ")}` : ""}</div>
              </div>
            );
          })}
        </>
      ) : (
        <>
          <div className={classes.row}>
            <TextField size="small" variant="outlined" label="Código do erro" value={code} onChange={(e) => setCode(e.target.value)} style={{ width: 180 }} />
            <Button variant="outlined" onClick={loadRows}>Buscar</Button>
          </div>
          <div className={classes.hint}>O código aparece na tela de erro de quem teve o problema. Aqui ficam a tela, a mensagem e o trecho que falhou.</div>
          {rows === null && <Typography className={classes.hint}>Carregando...</Typography>}
          {rows && rows.length === 0 && <Typography className={classes.hint}>Nenhum erro registrado.</Typography>}
          {(rows || []).map((r) => (
            <div key={r.id} style={{ borderTop: "1px solid rgba(127,140,160,.25)", paddingTop: 10 }}>
              <div className={classes.row}>
                <b style={{ fontFamily: "monospace" }}>{r.code}</b>
                <span className={classes.hint}>{errWhen(r.createdAt)} · {r.route} · usuário {r.userId || "-"} ({r.role || "-"}){r.build ? ` · versão ${r.build}` : ""}</span>
              </div>
              <div style={{ fontSize: 13.5, marginTop: 2, overflowWrap: "anywhere" }}>{r.message}</div>
              <details>
                <summary className={classes.hint} style={{ cursor: "pointer" }}>Detalhes</summary>
                <pre style={{ whiteSpace: "pre-wrap", fontSize: 11.5, overflowWrap: "anywhere", margin: "6px 0 0" }}>{`${r.stack || ""}\n${r.components || ""}\n${r.userAgent || ""}`}</pre>
              </details>
            </div>
          ))}
        </>
      )}
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
              <SectionBoundary name={current.id} resetKey={current.id}>
                {current.id === "geral" && <Geral values={values} save={save} admin={admin} />}
                {current.id === "horario" && <Horario values={values} save={save} crm={crm} />}
                {current.id === "atendimento" && <Atendimento values={values} save={save} crm={crm} />}
                {current.id === "tutoria" && <Tutoria values={values} save={save} />}
                {current.id === "captacao" && <Capture s={crm.s} setS={crm.setS} save={crm.save} />}
                {current.id === "pagamentos" && admin && <Pagamentos />}
                {current.id === "cadastros" && <Cadastros admin={admin} />}
                {current.id === "regras" && admin && <RegrasAcademicas />}
                {current.id === "email" && admin && <><Email /><EmailModels /></>}
                {current.id === "erros" && admin && <ErrosDeTela />}
              </SectionBoundary>
            )}
          </div>
        </div>
      </div>
    </MainContainer>
  );
};

export default SettingsHub;
