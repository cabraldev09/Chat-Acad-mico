import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import {
  Paper, Tabs, Tab, Typography, Switch, FormControlLabel, TextField, MenuItem, Button, makeStyles,
} from "@material-ui/core";
import { Copy, RefreshCw, DatabaseBackup } from "lucide-react";

import CrudPage from "../../components/CrudPage";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
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

const CrmSettings = () => {
  const [tab, setTab] = useState(0);
  const [s, setS] = useState({});
  const [users, setUsers] = useState([]);
  const [options, setOptions] = useState({});

  const load = () => api.get("/crm/settings").then(({ data }) => setS(data)).catch(toastError);
  useEffect(() => {
    load();
    api.get("/users", { params: { pageNumber: 1 } }).then(({ data }) => setUsers(data.users || []));
    api.get("/crm/options").then(({ data }) => setOptions(data));
  }, []);
  const save = async (patch) => {
    try { const { data } = await api.put("/crm/settings", patch); setS(data); toast.success("Salvo"); } catch (err) { toastError(err); }
  };

  const opts = (arr = []) => arr.map((v) => ({ value: v, label: v }));

  return (
    <MainContainer>
      <MainHeader><Title>Configurações do CRM</Title></MainHeader>
      <Paper variant="outlined" style={{ marginBottom: 8 }}>
        <Tabs value={tab} onChange={(e, v) => setTab(v)}>
          <Tab label="Etapas do funil" /><Tab label="Cursos" /><Tab label="Captação" /><Tab label="Automação" />
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
          <CrudPage embedded title="Cursos" endpoint="/courses" addLabel="Novo curso" socketEvent="course"
            emptyText="Cadastre os cursos para classificar o interesse dos leads."
            fields={[
              { name: "name", label: "Nome do curso", required: true },
              { name: "level", label: "Nível", type: "select", options: opts(["Bacharelado", "Licenciatura", "Tecnólogo", "Pós-graduação", "MBA", "Técnico", "Extensão"]) },
              { name: "modality", label: "Modalidade", type: "select", options: opts(options.modalities) },
              { name: "monthlyFee", label: "Mensalidade (R$)", type: "number" },
              { name: "active", label: "Ativo (aparece no formulário)", type: "switch", default: true },
            ]}
            columns={[
              { header: "Curso", field: "name" }, { header: "Nível", render: (r) => r.level || "—" }, { header: "Modalidade", render: (r) => r.modality || "—" },
              { header: "Mensalidade", render: (r) => (r.monthlyFee ? Number(r.monthlyFee).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—") },
              { header: "Ativo", render: (r) => (r.active ? "Sim" : "Não") },
            ]} />
        )}
        {tab === 2 && <Capture s={s} setS={setS} save={save} />}
        {tab === 3 && <Automation s={s} setS={setS} save={save} users={users} />}
      </div>
    </MainContainer>
  );
};

export default CrmSettings;
