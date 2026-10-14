import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import {
  Paper, Tabs, Tab, Typography, Switch, FormControlLabel, TextField, MenuItem, Button, makeStyles,
} from "@material-ui/core";
import { Copy, RefreshCw, DatabaseBackup, Upload, ShieldCheck, PlugZap, KeyRound } from "lucide-react";
import { Dialog, DialogTitle, DialogContent, DialogActions } from "@material-ui/core";

import CrudPage from "../../components/CrudPage";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import ImportWizard from "../../components/ImportWizard";
import ColorSwatchPicker from "../../components/ColorSwatchPicker";
import api from "../../services/api";
import { getBackendUrl } from "../../config";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => ({
  pane: { padding: theme.spacing(2.5), display: "grid", gap: theme.spacing(2), maxWidth: 720, overflowY: "auto", overflowX: "hidden", ...theme.scrollbarStyles },
  code: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12.5, background: theme.palette.action.hover, padding: theme.spacing(1.25),
    borderRadius: 8, wordBreak: "break-all", display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start",
  },
  hint: { color: theme.palette.text.secondary, fontSize: 13 },
  row: { display: "flex", gap: theme.spacing(1), flexWrap: "wrap", alignItems: "center" },
}));

const copy = (text) => { navigator.clipboard?.writeText(text); toast.success("Copiado"); };
const Copyable = ({ text }) => {
  const classes = useStyles();
  return (
    <div className={classes.code}><span>{text}</span>
      <Button size="small" onClick={() => copy(text)} startIcon={<Copy size={14} />}>Copiar</Button></div>
  );
};

const Capture = ({ s, setS, save }) => {
  const classes = useStyles();
  const base = getBackendUrl().replace(/\/$/, "");
  const link = s.formToken ? `${base}/leadform/${s.formToken}` : "";
  return (
    <Paper variant="outlined" className={classes.pane}>
      <div>
        <Typography variant="subtitle1" style={{ fontWeight: 600 }}>Formulário de captação</Typography>
        <Typography className={classes.hint}>Página pública com consentimento LGPD. Use o link em anúncios e bio, ou incorpore no site. A origem e as UTMs (utm_source, utm_medium, utm_campaign) do link ficam gravadas no lead.</Typography>
      </div>
      {link ? (
        <>
          <Copyable text={link} />
          <Copyable text={`<iframe src="${link}" width="100%" height="760" style="border:0"></iframe>`} />
          <Typography className={classes.hint}>Exemplo com UTM: {link}?utm_source=instagram&utm_campaign=vestibular-2027</Typography>
          <div className={classes.row}>
            <Button variant="outlined" size="small" href={link} target="_blank">Abrir formulário</Button>
            <Button variant="outlined" size="small" startIcon={<RefreshCw size={14} />}
              onClick={() => window.confirm("Gerar um novo link desativa o anterior. Continuar?") && save({ regenerateFormToken: true })}>Gerar novo link</Button>
          </div>
        </>
      ) : <Button variant="contained" color="primary" onClick={() => save({ regenerateFormToken: true })}>Ativar formulário</Button>}
      <TextField variant="outlined" size="small" label="Título" value={s.formTitle || ""} onChange={(e) => setS({ ...s, formTitle: e.target.value })} />
      <TextField variant="outlined" size="small" label="Mensagem após enviar" value={s.formThanks || ""} onChange={(e) => setS({ ...s, formThanks: e.target.value })} />
      <ColorSwatchPicker label="Cor do botão" value={s.formColor} onChange={(v) => setS({ ...s, formColor: v })} previewText="Quero ser contatado" />
      <div><Button variant="contained" color="primary" onClick={() => save({ formTitle: s.formTitle, formThanks: s.formThanks, formColor: s.formColor })}>Salvar formulário</Button></div>

      <div style={{ borderTop: "1px solid rgba(128,128,128,.25)", paddingTop: 16 }}>
        <Typography variant="subtitle1" style={{ fontWeight: 600 }}>Outras entradas</Typography>
        <Typography className={classes.hint}>
          Conversas de qualquer canal viram lead automaticamente. Para ligar RD Station, Meta Lead Ads (via Zapier/Make), landing pages ou planilhas, use a API com um token criado em API &amp; Webhooks:
        </Typography>
        <Copyable text={`POST ${base}/api/v1/leads  {"name":"Maria","phone":"11999990000","email":"m@x.com","source":"Google","utmCampaign":"vestibular"}`} />
        <Typography className={classes.hint} style={{ marginTop: 8 }}>Eventos por webhook: lead.created, lead.stage_changed, lead.won, lead.lost.</Typography>
      </div>
    </Paper>
  );
};

const EfiSettings = ({ stages }) => {
  const classes = useStyles();
  const [v, setV] = useState(null);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState("");
  const load = () => api.get("/payments/efi/settings").then(({ data }) => { setV(data); setSecret(data.clientSecret); }).catch(toastError);
  useEffect(() => { load(); }, []);
  if (!v) return null;
  const run = (name, fn) => async () => { setBusy(name); try { await fn(); } catch (err) { toastError(err); } finally { setBusy(""); } };
  const save = run("save", async () => {
    const { data } = await api.put("/payments/efi/settings", { ...v, clientSecret: secret });
    setV(data); setSecret(data.clientSecret); toast.success("Configurações salvas");
  });
  const upload = async (e) => {
    const file = e.target.files[0]; e.target.value = "";
    if (!file) return;
    const form = new FormData(); form.append("certificate", file);
    try { const { data } = await api.post("/payments/efi/certificate", form); setV(data); toast.success("Certificado enviado"); } catch (err) { toastError(err); }
  };
  const row = (ok, text) => (<div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5 }}><ShieldCheck size={16} style={{ color: ok ? "#16a34a" : "#94a3b8" }} />{text}</div>);

  return (
    <Paper variant="outlined" className={classes.pane}>
      <div>
        <Typography variant="subtitle1" style={{ fontWeight: 600 }}>Cobrança da taxa de matrícula pela Efí</Typography>
        <Typography className={classes.hint}>
          O sistema gera um PIX com QR Code para cada candidato (usando o CPF da ficha) e detecta sozinho quando ele paga: pelo aviso da Efí (webhook) e, como garantia, consultando as cobranças abertas a cada 30 segundos.
        </Typography>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {row(!!v.clientId && !!v.clientSecret, v.clientId && v.clientSecret ? "Credenciais informadas" : "Credenciais pendentes (Client ID e Client Secret)")}
        {row(v.certificate, v.certificate ? "Certificado .p12 enviado" : "Certificado .p12 pendente")}
        {row(!!v.pixKey, v.pixKey ? "Chave PIX informada" : "Chave PIX pendente")}
      </div>
      <TextField select size="small" variant="outlined" label="Ambiente" value={v.env} onChange={(e) => setV({ ...v, env: e.target.value })} style={{ maxWidth: 260 }}>
        <MenuItem value="sandbox">Homologação (testes)</MenuItem><MenuItem value="production">Produção</MenuItem>
      </TextField>
      <TextField size="small" variant="outlined" label="ID do cliente (Client_Id)" value={v.clientId} onChange={(e) => setV({ ...v, clientId: e.target.value })} />
      <TextField size="small" variant="outlined" label="Segredo do cliente (Client_Secret)" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" />
      <TextField size="small" variant="outlined" label="Chave PIX da conta Efí" value={v.pixKey} onChange={(e) => setV({ ...v, pixKey: e.target.value })} helperText="CPF/CNPJ, e-mail, telefone ou chave aleatória" />
      <div className={classes.row}>
        <Button component="label" variant="outlined" startIcon={<KeyRound size={16} />}>{v.certificate ? "Trocar certificado (.p12)" : "Enviar certificado (.p12)"}
          <input hidden type="file" accept=".p12,.pfx" onChange={upload} /></Button>
        <Typography className={classes.hint}>Baixe em Efí → API → Meus certificados. Fica guardado só no servidor.</Typography>
      </div>
      <div className={classes.row}>
        <TextField size="small" variant="outlined" label="Validade da cobrança (minutos)" type="number" value={v.expiryMinutes} onChange={(e) => setV({ ...v, expiryMinutes: e.target.value })} style={{ width: 230 }} />
        <TextField select size="small" variant="outlined" label="Ao pagar, mover o lead para" value={v.moveStageId || ""} onChange={(e) => setV({ ...v, moveStageId: e.target.value || null })} style={{ minWidth: 260 }}>
          <MenuItem value="">Automático (etapa “Matrícula…”)</MenuItem>
          {stages.map((st) => (<MenuItem key={st.id} value={st.id}>{st.name}</MenuItem>))}
        </TextField>
      </div>
      <div className={classes.row}>
        <Button variant="contained" color="primary" disabled={busy === "save"} onClick={save}>Salvar</Button>
        <Button variant="outlined" startIcon={<PlugZap size={16} />} disabled={busy === "test"} onClick={run("test", async () => { await api.post("/payments/efi/test"); toast.success("Conexão com a Efí funcionando"); })}>Testar conexão</Button>
      </div>
      <div style={{ borderTop: "1px solid rgba(128,128,128,.25)", paddingTop: 16 }}>
        <Typography variant="subtitle1" style={{ fontWeight: 600 }}>Aviso automático de pagamento (webhook)</Typography>
        <Typography className={classes.hint} gutterBottom>
          A Efí só entrega em endereço público HTTPS. {v.publicUrlIsHttps ? "O endereço público já está em HTTPS." : "Em localhost, use um túnel (ex.: cloudflared) e defina PUBLIC_URL em backend/.env. Sem isso o sistema confere os pagamentos sozinho a cada 30 s."}
        </Typography>
        <Copyable text={v.webhookUrl} />
        <Button style={{ marginTop: 8 }} variant="outlined" startIcon={<RefreshCw size={16} />} disabled={busy === "hook"}
          onClick={run("hook", async () => { await api.post("/payments/efi/webhook"); toast.success("Webhook registrado na Efí"); })}>Registrar webhook na Efí</Button>
      </div>
    </Paper>
  );
};

const WEEK = [
  { d: "1", label: "Segunda" }, { d: "2", label: "Terça" }, { d: "3", label: "Quarta" }, { d: "4", label: "Quinta" },
  { d: "5", label: "Sexta" }, { d: "6", label: "Sábado" }, { d: "0", label: "Domingo" },
];

// Working hours (used to measure answer times) and the "lead without an answer" alert.
const HoursAndAlerts = ({ s, save }) => {
  const classes = useStyles();
  const [hours, setHours] = useState(null);
  const [sla, setSla] = useState("15");
  useEffect(() => {
    if (s.businessHours) setHours(s.businessHours);
    if (s.slaMinutes !== undefined) setSla(String(s.slaMinutes));
  }, [s.businessHours, s.slaMinutes]);
  if (!hours) return null;

  const setDay = (d, patch) => {
    const list = hours.days[d] || [];
    const first = { start: "08:00", end: "18:00", ...(list[0] || {}), ...patch };
    setHours({ ...hours, days: { ...hours.days, [d]: [first, ...list.slice(1)] } });
  };
  const toggleDay = (d, on) => setHours({ ...hours, days: { ...hours.days, [d]: on ? [{ start: "08:00", end: "18:00" }] : [] } });

  return (
    <div style={{ borderTop: "1px solid rgba(128,128,128,.25)", paddingTop: 16, display: "grid", gap: 12 }}>
      <div>
        <Typography variant="subtitle1" style={{ fontWeight: 600 }}>Horário comercial e alerta de lead sem resposta</Typography>
        <Typography className={classes.hint}>
          Com o horário ligado, o tempo de resposta e o alerta contam só as horas de trabalho: uma mensagem que chega às 22h não conta como atraso na manhã seguinte.
        </Typography>
      </div>
      <FormControlLabel
        control={<Switch color="primary" checked={!!hours.enabled} onChange={(e) => setHours({ ...hours, enabled: e.target.checked })} />}
        label={hours.enabled ? "Horário comercial ligado" : "Horário comercial desligado (conta o tempo corrido)"}
      />
      {hours.enabled && (
        <div style={{ display: "grid", gap: 8 }}>
          {WEEK.map(({ d, label }) => {
            const list = hours.days[d] || [];
            const on = list.length > 0;
            return (
              <div key={d} className={classes.row} style={{ alignItems: "center" }}>
                <FormControlLabel style={{ width: 130, margin: 0 }} control={<Switch size="small" color="primary" checked={on} onChange={(e) => toggleDay(d, e.target.checked)} />} label={label} />
                {on ? (
                  <>
                    <TextField size="small" variant="outlined" type="time" label="Das" InputLabelProps={{ shrink: true }} value={list[0].start} onChange={(e) => setDay(d, { start: e.target.value })} />
                    <TextField size="small" variant="outlined" type="time" label="Às" InputLabelProps={{ shrink: true }} value={list[0].end} onChange={(e) => setDay(d, { end: e.target.value })} />
                  </>
                ) : (
                  <Typography className={classes.hint}>Fechado</Typography>
                )}
              </div>
            );
          })}
        </div>
      )}
      <TextField
        size="small" variant="outlined" type="number" label="Avisar quando um lead novo ficar sem resposta por (minutos)"
        value={sla} onChange={(e) => setSla(e.target.value)} inputProps={{ min: 0, max: 1440 }}
        helperText="0 desliga o alerta. O aviso chega para o consultor responsável e para a coordenação."
        style={{ maxWidth: 460 }}
      />
      <div>
        <Button variant="contained" color="primary" onClick={() => save({ businessHours: hours, slaMinutes: Number(sla) || 0 })}>Salvar horário e alerta</Button>
      </div>
    </div>
  );
};

const Automation = ({ s, setS, save, users }) => {
  const classes = useStyles();
  const [busy, setBusy] = useState(false);
  return (
    <Paper variant="outlined" className={classes.pane}>
      <FormControlLabel control={<Switch color="primary" checked={!!s.autocreate} onChange={(e) => save({ autocreate: e.target.checked })} />}
        label="Cadastrar no CRM todo contato que enviar mensagem" />
      <Typography className={classes.hint} style={{ marginTop: -12 }}>Vale para todos os canais. Grupos não viram lead. Quem já existe (mesmo telefone ou contato) não é duplicado.</Typography>
      <FormControlLabel control={<Switch color="primary" checked={!!s.autoadvance} onChange={(e) => save({ autoadvance: e.target.checked })} />}
        label="Mover para “Primeiro contato” quando um atendente responder" />
      <div>
        <Typography variant="subtitle2" style={{ fontWeight: 600 }}>Períodos de ingresso</Typography>
        <Typography className={classes.hint} gutterBottom>Os períodos que a instituição está captando. O padrão vem preenchido em todo lead novo e nas propostas.</Typography>
        <div className={classes.row}>
          <TextField size="small" variant="outlined" label="Períodos (ex.: 2026/2, 2027/1)" value={(s.entryTerms || []).join(", ")} style={{ minWidth: 280 }}
            onChange={(e) => setS({ ...s, entryTerms: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
            onBlur={() => save({ entryTerms: s.entryTerms })} />
          <TextField select size="small" variant="outlined" label="Período padrão" value={s.defaultEntryTerm || ""} onChange={(e) => save({ defaultEntryTerm: e.target.value })} style={{ minWidth: 160 }}>
            {(s.entryTerms || []).map((t) => (<MenuItem key={t} value={t}>{t}</MenuItem>))}
          </TextField>
        </div>
      </div>
      <TextField select variant="outlined" size="small" label="Distribuição de novos leads" value={s.autoassign || "roundrobin"} onChange={(e) => save({ autoassign: e.target.value })} style={{ maxWidth: 360 }}>
        <MenuItem value="roundrobin">Rodízio entre os consultores</MenuItem>
        <MenuItem value="none">Sem responsável (o primeiro a atender assume)</MenuItem>
      </TextField>
      {s.autoassign !== "none" && (
        <TextField select variant="outlined" size="small" label="Consultores no rodízio" SelectProps={{ multiple: true }} value={s.ownerIds || []}
          onChange={(e) => save({ ownerIds: e.target.value })} helperText="Vazio = todos os usuários" style={{ maxWidth: 360 }}>
          {users.map((u) => (<MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>))}
        </TextField>
      )}
      <HoursAndAlerts s={s} save={save} />
      <div style={{ borderTop: "1px solid rgba(128,128,128,.25)", paddingTop: 16 }}>
        <Typography variant="subtitle1" style={{ fontWeight: 600 }}>Contatos já existentes</Typography>
        <Typography className={classes.hint} gutterBottom>Ao iniciar, o sistema já registra no CRM os contatos que ainda não são leads. Rode manualmente se importar contatos novos.</Typography>
        <Button variant="outlined" disabled={busy} startIcon={<DatabaseBackup size={16} />} onClick={async () => {
          setBusy(true);
          try { const { data } = await api.post("/crm/backfill"); toast.success(`${data.created} contatos registrados como lead`); } catch (err) { toastError(err); } finally { setBusy(false); }
        }}>Sincronizar contatos agora</Button>
      </div>
    </Paper>
  );
};

const COURSE_COLUMNS = [
  { key: "name", label: "Nome do curso", required: true, aliases: ["curso", "nome"], hint: "Nome como aparece na proposta. Ex.: Administração" },
  { key: "category", label: "Categoria", aliases: ["tipo"], hint: "Ex.: Graduação, Pós-graduação, Segunda graduação, Técnico" },
  { key: "level", label: "Nível", hint: "Bacharelado, Licenciatura, Tecnólogo, Pós-graduação, MBA, Técnico ou Extensão" },
  { key: "modality", label: "Modalidade", aliases: ["modalidade de ensino"], hint: "EAD, Semipresencial ou Presencial" },
  { key: "monthlyFee", label: "Mensalidade bruta", aliases: ["mensalidade", "valor", "preco"], hint: "Valor cheio, sem bolsa. Ex.: 1073,80" },
  { key: "semesters", label: "Semestres", aliases: ["duracao", "periodos"], hint: "Duração do curso em semestres (1 a 20). Vazio = 8" },
  { key: "institution", label: "Instituição", aliases: ["faculdade", "universidade"], hint: "Nome exato de uma instituição já cadastrada (opcional)" },
  { key: "active", label: "Ativo", hint: "Sim ou Não. Vazio = Sim" },
];

const COURSE_EXAMPLES = [
  { name: "Administração (exemplo)", category: "Graduação", level: "Bacharelado", modality: "EAD", monthlyFee: "1073,80", semesters: 8, institution: "", active: "Sim" },
  { name: "Direito (exemplo)", category: "Graduação", level: "Bacharelado", modality: "Presencial", monthlyFee: "1290,00", semesters: 10, institution: "", active: "Sim" },
  { name: "Gestão Ambiental (exemplo)", category: "Graduação", level: "Tecnólogo", modality: "Semipresencial", monthlyFee: "756,30", semesters: 4, institution: "", active: "Não" },
];

const ActiveToggle = ({ row: course, endpoint = "/courses", label = "curso" }) => {
  const [on, setOn] = useState(!!course.active);
  const [busy, setBusy] = useState(false);
  // the list refreshes after the save: follow the server value without remounting
  useEffect(() => { setOn(!!course.active); }, [course.active]);
  const change = async (e) => {
    const next = e.target.checked;
    setBusy(true);
    try {
      await api.put(`${endpoint}/${course.id}`, { ...course, active: next });
      setOn(next);
      toast.success(next ? `Ativado: ${course.name}` : `Desativado: ${course.name}`);
    } catch (err) {
      toastError(err);
    }
    setBusy(false);
  };
  return (
    // fixed width so "Ativo" / "Inativo" never changes the column width (no layout shift)
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-start", gap: 2, width: 128 }}>
      <Switch size="small" color="primary" checked={on} disabled={busy} onChange={change} />
      <b style={{ fontSize: 12, width: 52, textAlign: "left", color: on ? "#15803d" : "#64748b" }}>{on ? "Ativo" : "Inativo"}</b>
    </span>
  );
};

const CrmSettings = () => {
  const [tab, setTab] = useState(0);
  const [s, setS] = useState({});
  const [users, setUsers] = useState([]);
  const [options, setOptions] = useState({});
  const [institutions, setInstitutions] = useState([]);
  const [stages, setStages] = useState([]);
  const [importOpen, setImportOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const [categories, setCategories] = useState(["Graduação", "Pós-graduação", "Segunda graduação", "Técnico", "Extensão", "Livre"]);

  const load = () => api.get("/crm/settings").then(({ data }) => setS(data)).catch(toastError);
  useEffect(() => {
    load();
    api.get("/users", { params: { pageNumber: 1 } }).then(({ data }) => setUsers(data.users || []));
    api.get("/crm/options").then(({ data }) => setOptions(data));
    api.get("/institutions").then(({ data }) => setInstitutions(data)).catch(() => {});
    api.get("/lead-stages").then(({ data }) => setStages(data)).catch(() => {});
    api.get("/courses").then(({ data }) => {
      const rows = Array.isArray(data) ? data : data.rows || data.courses || [];
      setCategories((prev) => [...new Set([...prev, ...rows.map((c) => c.category).filter(Boolean)])].sort((a, b) => a.localeCompare(b, "pt-BR")));
    }).catch(() => {});
  }, [tab, reload]);
  const save = async (patch) => {
    try { const { data } = await api.put("/crm/settings", patch); setS(data); toast.success("Salvo"); } catch (err) { toastError(err); }
  };

  const opts = (arr = []) => arr.map((v) => ({ value: v, label: v }));

  return (
    <MainContainer>
      <MainHeader><Title>Configurações do CRM</Title></MainHeader>
      <Paper variant="outlined" style={{ marginBottom: 8 }}>
        <Tabs value={tab} onChange={(e, v) => setTab(v)}>
          <Tab label="Etapas do funil" /><Tab label="Cursos" /><Tab label="Instituições" /><Tab label="Modelos de proposta" /><Tab label="Captação" /><Tab label="Pagamentos (Efí)" /><Tab label="Automação" />
        </Tabs>
      </Paper>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {tab === 0 && (
          <CrudPage embedded title="Etapas" endpoint="/lead-stages" addLabel="Nova etapa" socketEvent="leadStage"
            emptyText="Nenhuma etapa."
            fields={[
              { name: "name", label: "Nome da etapa", required: true },
              { name: "type", label: "Tipo", type: "select", required: true, default: "open",
                helper: "Matriculado e Perdido encerram o lead e alimentam as métricas.",
                options: [{ value: "open", label: "Em andamento" }, { value: "won", label: "Matriculado (ganho)" }, { value: "lost", label: "Perdido" }] },
              { name: "position", label: "Posição na ordem", type: "number", default: 1 },
              { name: "color", label: "Cor", type: "color", default: "#0693E3", required: true },
            ]}
            columns={[
              { header: "Ordem", field: "position" },
              { header: "Etapa", render: (r) => (<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: r.color }} />{r.name}</span>) },
              { header: "Tipo", render: (r) => ({ open: "Em andamento", won: "Matriculado", lost: "Perdido" }[r.type]) },
            ]} />
        )}
        {tab === 1 && (
          <>
            <ImportWizard
              open={importOpen}
              onClose={() => setImportOpen(false)}
              onDone={() => setReload((r) => r + 1)}
              title="Importar catálogo de cursos"
              endpoint="/courses/import"
              templateName="modelo-cursos"
              columns={COURSE_COLUMNS}
              examples={COURSE_EXAMPLES}
              instructions={[
                "Cursos com o mesmo nome, categoria e modalidade são atualizados em vez de duplicados.",
                "Mensalidade aceita 1073,80 ou 1.073,80. Ativo aceita Sim/Não.",
                "Você confere tudo (e os erros linha a linha) antes de importar.",
              ]}
            />
            <CrudPage embedded title="Cursos" endpoint="/courses" addLabel="Novo curso" socketEvent="course" reloadKey={reload}
              emptyText="Cadastre os cursos (ou importe o catálogo) para gerar propostas com a mensalidade certa."
              headerExtra={<Button variant="outlined" startIcon={<Upload size={16} />} onClick={() => setImportOpen(true)}>Importar catálogo</Button>}
              fields={[
                { name: "name", label: "Nome do curso", required: true },
                { name: "category", label: "Categoria", type: "combo", options: categories },
                { name: "level", label: "Nível", type: "select", options: opts(["Bacharelado", "Licenciatura", "Tecnólogo", "Pós-graduação", "MBA", "Técnico", "Extensão"]) },
                { name: "modality", label: "Modalidade", type: "select", options: opts(options.modalities) },
                { name: "monthlyFee", label: "Mensalidade bruta (R$)", type: "number" },
                { name: "semesters", label: "Semestres", type: "number", default: 8 },
                { name: "institutionId", label: "Instituição", type: "select", options: institutions.map((i) => ({ value: i.id, label: i.name })) },
                { name: "active", label: "Ativo (aparece no formulário e nas propostas)", type: "switch", default: true },
              ]}
              columns={[
                { header: "Curso", field: "name" }, { header: "Categoria", render: (r) => r.category || "—" }, { header: "Modalidade", render: (r) => r.modality || "—" },
                { header: "Mensalidade", render: (r) => (r.monthlyFee ? Number(r.monthlyFee).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—") },
                { header: "Semestres", render: (r) => r.semesters },
                { header: "Ativo", render: (r) => <ActiveToggle key={r.id} row={r} /> },
              ]} />
          </>
        )}
        {tab === 2 && (
          <CrudPage embedded title="Instituições" endpoint="/institutions" addLabel="Nova instituição" socketEvent="institution"
            emptyText="Cadastre a instituição (nome, CNPJ e logo) que aparece no cabeçalho da proposta."
            fields={[
              { name: "name", label: "Nome da instituição", required: true },
              { name: "cnpj", label: "CNPJ" },
              { name: "logoFile", label: "Logo (PNG, JPG ou SVG)", type: "file" },
              { name: "active", label: "Ativa", type: "switch", default: true },
            ]}
            columns={[
              { header: "Logo", render: (r) => (r.logoFile ? <img alt="" src={`${getBackendUrl().replace(/\/$/, "")}/public/${r.logoFile}`} style={{ maxHeight: 32, maxWidth: 120 }} /> : "—") },
              { header: "Instituição", field: "name" }, { header: "CNPJ", render: (r) => r.cnpj || "—" },
              { header: "Ativa", render: (r) => <ActiveToggle key={r.id} row={r} endpoint="/institutions" /> },
            ]} />
        )}
        {tab === 3 && (
          <CrudPage embedded title="Modelos de proposta" endpoint="/proposal-templates" addLabel="Novo modelo" socketEvent="proposalTemplate" dialogWidth="md"
            emptyText="Nenhum modelo." reloadKey={reload}
            mapIn={(r) => ({ ...r, institutionIds: (r.institutions || []).map((i) => i.id), semestralSchedule: JSON.parse(r.semestralSchedule || "[]").map((x) => `${x.from}=${x.pct}`).join("\n") })}
            mapOut={(v) => ({ ...v, semestralSchedule: String(v.semestralSchedule || "").split(/\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const [from, pct] = l.split("="); return { from: Number(from), pct: Number(String(pct).replace(",", ".")) }; }) })}
            fields={[
              { name: "name", label: "Nome do modelo", required: true },
              { name: "institutionIds", label: "Instituições que usam este modelo", type: "multiselect", options: institutions.map((i) => ({ value: i.id, label: i.name })), helper: "O modelo aparece na proposta dos cursos dessas instituições. Vazio = serve para todas." },
              { name: "enrollmentFee", label: "Taxa de matrícula (R$)", type: "number", default: 0 },
              { name: "dueDay", label: "Dia de vencimento", type: "number", default: 10 },
              { name: "installments", label: "Parcelas por semestre", type: "number", default: 6 },
              { name: "installmentsFixed", label: "Total de parcelas do curso (fixo)", type: "number", helper: "Deixe vazio quando as mensalidades seguem até o fim do curso." },
              { name: "firstExempt", label: "1ª mensalidade isenta (a 2ª leva a data de vencimento)", type: "switch", default: false },
              { name: "hasRegression", label: "Tem regressão da bolsa (cai após o 1º semestre)", type: "switch", default: true },
              { name: "hasAdjustment", label: "Tem reajuste semestral e anual", type: "switch", default: true },
              { name: "fixedUntilEnd", label: "Mensalidade fixa até o fim do curso (sem regressão nem reajuste)", type: "switch", default: false },
              { name: "bolsaFirst", label: "Bolsa no 1º semestre (%)", type: "number", default: 25 },
              { name: "bolsaNext", label: "Bolsa do 2º semestre em diante (%)", type: "number", default: 20 },
              { name: "punctualityPct", label: "Desconto de pontualidade (%)", type: "number", default: 25 },
              { name: "lateFee1Pct", label: "Perde (dias 11–25) (%)", type: "number", default: 15 },
              { name: "lateFee2Pct", label: "Perde (após o vencimento) (%)", type: "number", default: 25 },
              { name: "annualMin", label: "Reajuste anual mínimo (%)", type: "number", default: 5 },
              { name: "annualMax", label: "Reajuste anual teto (%)", type: "number", default: 11 },
              { name: "semestralSchedule", label: "Reajuste semestral", type: "textarea", rows: 3, default: "2=2\n6=3", helper: "Uma linha por degrau: semestre=percentual. “2=2” e “6=3” = 2% do 2º ao 5º semestre e 3% do 6º em diante." },
              { name: "bolsaNote", label: "Nota da bolsa aplicada", type: "textarea", rows: 2 },
              { name: "observation", label: "Observação", type: "textarea", rows: 2 },
              { name: "disclaimer", label: "Aviso da projeção", type: "textarea", rows: 3 },
              { name: "finalMessage", label: "Mensagem final", type: "textarea", rows: 2 },
              { name: "waIntro", label: "WhatsApp · abertura", type: "textarea", rows: 2, helper: "Variáveis: {{nome}} e {{curso}}. Vazio usa o texto padrão." },
              { name: "waClosing", label: "WhatsApp · fechamento (validade)", type: "textarea", rows: 2, helper: "Variáveis: {{nome}}, {{curso}} e {{hoje}}." },
              { name: "isDefault", label: "Modelo padrão", type: "switch", default: false },
            ]}
            columns={[
              { header: "Modelo", render: (r) => (<>{r.name}{r.isDefault ? " (padrão)" : ""}</>) },
              { header: "Matrícula", render: (r) => Number(r.enrollmentFee).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) },
              { header: "Bolsa 1º / demais", render: (r) => `${Number(r.bolsaFirst)}% / ${Number(r.bolsaNext)}%` },
              { header: "Regras", render: (r) => [r.fixedUntilEnd ? "Fixa até o fim" : null, !r.fixedUntilEnd && r.hasRegression === false ? "Sem regressão" : null, !r.fixedUntilEnd && r.hasAdjustment === false ? "Sem reajuste" : null, r.firstExempt ? "1ª isenta" : null, r.installmentsFixed ? `${r.installmentsFixed} parcelas` : null].filter(Boolean).join(" · ") || "Padrão" },
              { header: "Instituições", render: (r) => ((r.institutions || []).map((i) => i.name).join(", ") || "Todas") },
            ]} />
        )}
        {tab === 4 && <Capture s={s} setS={setS} save={save} />}
        {tab === 5 && <EfiSettings stages={stages} />}
        {tab === 6 && <Automation s={s} setS={setS} save={save} users={users} />}
      </div>
    </MainContainer>
  );
};

export default CrmSettings;
