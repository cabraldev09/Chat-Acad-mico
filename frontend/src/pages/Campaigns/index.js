import React, { useEffect, useState, useCallback } from "react";
import { toast } from "react-toastify";
import {
  Button,
  Paper,
  Tabs,
  Tab,
  Typography,
  IconButton,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Chip,
  makeStyles,
} from "@material-ui/core";
import PlayArrow from "@material-ui/icons/PlayArrow";
import Pause from "@material-ui/icons/Pause";
import Stop from "@material-ui/icons/Stop";
import Assessment from "@material-ui/icons/Assessment";
import People from "@material-ui/icons/People";
import { DeleteOutline } from "@material-ui/icons";
import { format, parseISO } from "date-fns";

import { Plus as PlusIcon, Users as UsersIcon, Copy, Download, RotateCcw, SendHorizontal, AlertTriangle } from "lucide-react";
import CrudPage from "../../components/CrudPage";
import IconAction from "../../components/IconAction";
import ConfirmationModal from "../../components/ConfirmationModal";
import StepsEditor, { emptyStep } from "./StepsEditor";
import NewListDialog from "./NewListDialog";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { downloadFile } from "../../utils/saveBlob";

const useStyles = makeStyles((theme) => ({
  body: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0 },
  scroll: { maxHeight: 360, overflowY: "auto", ...theme.scrollbarStyles },
  code: { fontFamily: "monospace", fontSize: 12 },
}));

const STATUS = {
  draft: ["Rascunho", "default"],
  scheduled: ["Agendada", "primary"],
  running: ["Em andamento", "primary"],
  paused: ["Pausada", "default"],
  finished: ["Concluída", "default"],
  cancelled: ["Cancelada", "default"],
};

// "cerca de 1 h 20 min"
const duration = (sec) => {
  const m = Math.max(1, Math.round(sec / 60));
  if (m < 60) return `cerca de ${m} min`;
  const h = Math.floor(m / 60);
  if (h >= 24) return `cerca de ${Math.round(h / 24)} dia${Math.round(h / 24) === 1 ? "" : "s"}`;
  return `cerca de ${h} h${m % 60 ? ` ${String(m % 60).padStart(2, "0")} min` : ""}`;
};

const RISK = {
  cloud: ["API oficial", "#15803d"],
  strict: ["QR Code · modo seguro", "#b45309"],
  relaxed: ["QR Code · modo flexível", "#b91c1c"],
};
const riskOf = (c) => (c.channel === "whatsapp_cloud" ? RISK.cloud : c.riskMode === "relaxed" ? RISK.relaxed : RISK.strict);

// tiny CSV/TSV/“name;number” parser: header optional
const parseRows = (text) => {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const delim = [";", "\t", ","].find((d) => lines[0].includes(d)) || ",";
  const split = (l) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));
  let head = split(lines[0]).map((h) => h.toLowerCase());
  const hasHeader = head.some((h) => ["nome", "name", "numero", "número", "number", "telefone", "phone", "whatsapp"].includes(h));
  const idx = (names, fallback) => {
    const i = head.findIndex((h) => names.includes(h));
    return i >= 0 ? i : fallback;
  };
  const nameI = hasHeader ? idx(["nome", "name"], 0) : 0;
  const numI = hasHeader ? idx(["numero", "número", "number", "telefone", "phone", "whatsapp"], 1) : 1;
  const mailI = hasHeader ? idx(["email", "e-mail"], 2) : 2;
  return lines.slice(hasHeader ? 1 : 0).map((l) => {
    const c = split(l);
    // single column = just numbers
    if (c.length === 1) return { name: "", number: c[0], email: "" };
    return { name: c[nameI] || "", number: c[numI] || "", email: c[mailI] || "" };
  });
};

const ListItemsDialog = ({ list, onClose }) => {
  const classes = useStyles();
  const [items, setItems] = useState([]);
  const [text, setText] = useState("");

  const load = useCallback(async () => {
    const { data } = await api.get(`/contact-lists/${list.id}/items`);
    setItems(data);
  }, [list.id]);

  useEffect(() => {
    load().catch(toastError);
  }, [load]);

  const doImport = async (rows) => {
    try {
      const { data } = await api.post(`/contact-lists/${list.id}/import`, { items: rows });
      const parts = [`${data.imported} importados`];
      if (data.duplicated) parts.push(`${data.duplicated} já estavam na lista`);
      if (data.invalid) parts.push(`${data.invalid} sem número válido (precisa de DDD)`);
      toast.success(`${parts.join(", ")}.`);
      setText("");
      load();
    } catch (err) {
      toastError(err);
    }
  };

  const importSystemContacts = async () => {
    try {
      let page = 1;
      let all = [];
      for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const { data } = await api.get("/contacts", { params: { pageNumber: page } });
        all = all.concat(data.contacts.filter((c) => !c.isGroup && /^\d+$/.test(c.number)));
        if (!data.hasMore) break;
        page += 1;
      }
      await doImport(all.map((c) => ({ name: c.name, number: c.number, email: c.email })));
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Contatos da lista “{list.name}” ({items.length})</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" gutterBottom>
          Cole linhas no formato <b>nome;número;email</b> (ou só os números), ou envie um arquivo .csv. Número com DDI, ex.: 5511999999999.
        </Typography>
        <TextField fullWidth multiline rows={4} variant="outlined" value={text} onChange={(e) => setText(e.target.value)} placeholder={"Maria;5511999990000;maria@email.com\nJoão;5521988880000"} />
        <div style={{ display: "flex", gap: 8, margin: "8px 0 16px" }}>
          <Button variant="contained" color="primary" disabled={!text.trim()} onClick={() => doImport(parseRows(text))}>
            Importar texto
          </Button>
          <Button variant="outlined" component="label">
            Enviar CSV
            <input
              hidden
              type="file"
              accept=".csv,.txt"
              onChange={async (e) => { e && e.persist && e.persist();
                const f = e.target.files[0];
                if (f) doImport(parseRows(await f.text()));
                e.target.value = "";
              }}
            />
          </Button>
          <Button variant="outlined" onClick={importSystemContacts}>Importar contatos do sistema</Button>
          <span style={{ flex: 1 }} />
          <Button variant="outlined" startIcon={<Download size={15} />} disabled={!items.length} onClick={() => downloadFile(`/contact-lists/${list.id}/export.csv`, undefined, `lista-${list.name}.csv`)}>Baixar a lista</Button>
        </div>
        {items.length === 0 && (
          <Typography color="textSecondary" style={{ textAlign: "center", padding: "24px 0" }}>
            Esta lista está vazia. Cole os contatos acima, envie um arquivo ou importe os contatos do sistema.
          </Typography>
        )}
        <div className={classes.scroll} style={items.length === 0 ? { display: "none" } : undefined}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Nome</TableCell>
                <TableCell>Número</TableCell>
                <TableCell>E-mail</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>{i.name}</TableCell>
                  <TableCell>{i.number}</TableCell>
                  <TableCell>{i.email}</TableCell>
                  <TableCell align="right">
                    <IconAction
                      title="Remover da lista"
                      onClick={async () => {
                        await api.delete(`/contact-lists/${list.id}/items/${i.id}`);
                        load();
                      }}
                    >
                      <DeleteOutline fontSize="small" />
                    </IconAction>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="primary" variant="contained">Fechar</Button>
      </DialogActions>
    </Dialog>
  );
};

const SHIP_STATUS = { pending: "Pendente", sent: "Enviada", failed: "Falhou", cancelled: "Cancelada" };

const ReportDialog = ({ campaignId, onClose, onChanged }) => {
  const classes = useStyles();
  const [data, setData] = useState(null);
  const [only, setOnly] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get(`/campaigns/${campaignId}/report`, { params: { status: only || undefined } }).then(({ data: d }) => setData(d)).catch(toastError), [campaignId, only]);
  useEffect(() => { load(); }, [load]);
  const c = data?.campaign;
  // while it is going, the report follows it
  const live = c && ["running", "scheduled"].includes(c.status);
  useEffect(() => {
    if (!live) return undefined;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [live, load]);
  const retry = async () => {
    setBusy(true);
    try {
      const { data: r } = await api.post(`/campaigns/${campaignId}/retry-failed`);
      toast.success(`${r.requeued} envio${r.requeued === 1 ? "" : "s"} voltou${r.requeued === 1 ? "" : "ram"} para a fila.`);
      await load();
      onChanged();
    } catch (err) { toastError(err); }
    setBusy(false);
  };
  const chip = (key, label, n, color) => (
    <Chip key={key} clickable color={only === key ? "primary" : "default"} variant={only === key ? "default" : "outlined"} style={color && only !== key ? { borderColor: color } : undefined}
      label={`${label} ${n}`} onClick={() => setOnly(only === key ? "" : key)} />
  );
  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Relatório{c ? ` — ${c.name}` : ""}</DialogTitle>
      <DialogContent dividers>
        {!c && <LinearProgress />}
        {c && (
          <>
            {c.pauseReason && <Typography variant="body2" style={{ marginBottom: 8, color: "#b45309" }}>{c.pauseReason}</Typography>}
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
              <Chip label={`Total ${c.counters.total}`} />
              {chip("sent", "Enviadas", c.counters.sent)}
              {chip("pending", "Pendentes", c.counters.pending)}
              {chip("failed", "Falhas", c.counters.failed, c.counters.failed ? "#dc2626" : undefined)}
              {c.counters.cancelled > 0 && chip("cancelled", "Canceladas", c.counters.cancelled)}
              <span style={{ flex: 1 }} />
              {c.counters.failed > 0 && ["running", "paused", "finished"].includes(c.status) && (
                <Button size="small" variant="outlined" startIcon={<RotateCcw size={15} />} disabled={busy} onClick={retry}>Reenviar as falhas</Button>
              )}
              <Button size="small" variant="outlined" startIcon={<Download size={15} />} onClick={() => downloadFile(`/campaigns/${campaignId}/report`, { format: "csv", status: only || undefined }, `campanha-${campaignId}.csv`)}>Baixar planilha</Button>
            </div>
            {data.truncated && <Typography variant="caption" color="textSecondary" display="block" style={{ marginBottom: 6 }}>Mostrando os primeiros {data.shippings.length} envios. A planilha traz todos.</Typography>}
            <div className={classes.scroll}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Nome</TableCell>
                    <TableCell>Número</TableCell>
                    <TableCell>Situação</TableCell>
                    <TableCell>Quando / motivo</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.shippings.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.name}</TableCell>
                      <TableCell>{s.number}</TableCell>
                      <TableCell>{SHIP_STATUS[s.status] || s.status}</TableCell>
                      <TableCell>{s.errorText || s.error || (s.sentAt ? format(parseISO(s.sentAt), "dd/MM HH:mm:ss") : "—")}</TableCell>
                    </TableRow>
                  ))}
                  {data.shippings.length === 0 && <TableRow><TableCell colSpan={4} align="center">Nenhum envio nesta situação.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="primary" variant="contained">Fechar</Button>
      </DialogActions>
    </Dialog>
  );
};

// Before it starts: how many people can really receive it through the chosen connection, why the others cannot, how long it takes.
const StartDialog = ({ campaign, onClose, onStarted }) => {
  const [pre, setPre] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get(`/campaigns/${campaign.id}/preflight`).then(({ data }) => setPre(data)).catch((e) => { toastError(e); onClose(); }); }, [campaign.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const waiting = campaign.status === "scheduled";
  const verb = waiting ? "Iniciar agora" : campaign.status === "paused" ? "Retomar" : "Iniciar";
  const go = async () => {
    setBusy(true);
    try {
      await api.post(`/campaigns/${campaign.id}/start`, waiting ? { now: true } : {});
      toast.success(waiting ? "Campanha iniciada agora." : campaign.status === "paused" ? "Campanha retomada." : "Campanha iniciada.");
      onStarted();
      onClose();
    } catch (err) { toastError(err); setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{verb} “{campaign.name}”?</DialogTitle>
      <DialogContent dividers>
        {!pre ? <LinearProgress /> : (
          <>
            <Typography variant="body1" gutterBottom>
              <b>{pre.canReceive}</b> de <b>{pre.total}</b> {pre.total === 1 ? "pessoa pode" : "pessoas podem"} receber{pre.messagesPerPerson > 1 ? `, ${pre.messagesPerPerson} mensagens cada` : ""}.
            </Typography>
            {pre.connection && (
              <Typography variant="body2" color="textSecondary" gutterBottom>
                Conexão: <b>{pre.connection.name}</b> · {riskOf(pre.connection)[0]}{pre.connection.status !== "CONNECTED" ? " · desconectada agora" : ""}
              </Typography>
            )}
            {pre.canReceive > 0 && <Typography variant="body2" color="textSecondary" gutterBottom>Duração do envio: {duration(pre.estimatedSeconds)} (com as pausas de segurança).</Typography>}
            {waiting && campaign.scheduledAt && <Typography variant="body2" color="textSecondary" gutterBottom>Estava agendada para {format(parseISO(campaign.scheduledAt), "dd/MM 'às' HH:mm")}. Iniciando agora, essa data deixa de valer.</Typography>}
            {pre.warnings.map((w) => (
              <div key={w} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 8, padding: "8px 10px", borderRadius: 10, background: "rgba(245,158,11,.14)", fontSize: 13.5 }}>
                <AlertTriangle size={16} color="#d97706" style={{ marginTop: 2, flex: "none" }} /> <span>{w}</span>
              </div>
            ))}
            {pre.total > 0 && pre.canReceive === 0 && <Typography variant="body2" color="error" style={{ marginTop: 10 }}>Ninguém receberia por esta conexão: resolva os avisos acima antes de iniciar.</Typography>}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Voltar</Button>
        <Button variant="contained" color="primary" disabled={!pre || busy || pre.total === 0 || pre.canReceive === 0} onClick={go}>{waiting ? "Iniciar agora" : campaign.status === "paused" ? "Retomar" : "Iniciar campanha"}</Button>
      </DialogActions>
    </Dialog>
  );
};

// sends the campaign's messages to the person's own number to see how they look
const TestDialog = ({ campaign, onClose }) => {
  const [number, setNumber] = useState(() => { try { return window.localStorage.getItem("campaignTestNumber") || ""; } catch (e) { return ""; } });
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/campaigns/${campaign.id}/test`, { number, name: "Teste" });
      try { window.localStorage.setItem("campaignTestNumber", number); } catch (e) { /* the number is just a convenience */ }
      toast.success(`${data.sent} mensagem${data.sent === 1 ? "" : "ns"} enviada${data.sent === 1 ? "" : "s"} para ${number}.`);
      onClose();
    } catch (err) { toastError(err); setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Enviar um teste</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" gutterBottom>Envia “{campaign.name}” para um número seu, pela conexão da campanha, com o nome “Teste”. Salve a campanha antes se mexeu nas mensagens.</Typography>
        <TextField fullWidth autoFocus variant="outlined" margin="dense" label="Seu WhatsApp com DDD" placeholder="(69) 99999-0000" value={number} onChange={(e) => setNumber(e.target.value)} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Voltar</Button>
        <Button variant="contained" color="primary" startIcon={<SendHorizontal size={15} />} disabled={busy || number.replace(/\D/g, "").length < 10} onClick={send}>Enviar teste</Button>
      </DialogActions>
    </Dialog>
  );
};

// the connection that sends: what it is, how risky and how much it can still send today
const ConnectionPicker = ({ value, setValue, connections }) => {
  const standard = connections.find((c) => c.isDefault);
  const current = connections.find((c) => c.id === value) || (value === "" || value === null || value === undefined ? standard : null);
  const [safety, setSafety] = useState(null);
  const currentId = current ? current.id : null;
  const currentChannel = current ? current.channel : null;
  useEffect(() => {
    setSafety(null);
    if (currentId && currentChannel === "whatsapp") api.get(`/channels/${currentId}/safety`).then(({ data }) => setSafety(data)).catch(() => {});
  }, [currentId, currentChannel]);
  const [label, color] = current ? riskOf(current) : [null, null];
  return (
    <div>
      <TextField select fullWidth variant="outlined" margin="dense" label="Conexão de envio" value={value === null || value === undefined ? "" : value} onChange={(e) => setValue(e.target.value)}
        helperText={current ? undefined : "Sem conexão padrão definida: escolha uma."}>
        <MenuItem value="">Conexão padrão{standard ? ` (${standard.name})` : ""}</MenuItem>
        {connections.map((c) => (<MenuItem key={c.id} value={c.id}>{c.name} · {riskOf(c)[0]}</MenuItem>))}
      </TextField>
      {current && (
        <Typography variant="caption" color="textSecondary" display="block">
          <b style={{ color }}>{label}</b>
          {current.status !== "CONNECTED" ? " · desconectada agora" : ""}
          {current.channel === "whatsapp"
            ? current.riskMode === "relaxed"
              ? ". Envia também a quem nunca respondeu, com risco maior de o WhatsApp bloquear o número."
              : ". Só envia a quem já respondeu você, para proteger o número."
            : ". Quem nunca conversou com você só recebe por um modelo aprovado."}
          {safety && safety.dailyLimit !== null ? ` Hoje: ${safety.sentToday} de até ${safety.dailyLimit} envios.` : ""}
        </Typography>
      )}
    </div>
  );
};

// list select plus a shortcut to create one without leaving the campaign form
const ListPicker = ({ value, lists, picked, onPicked, setValue, onNew }) => {
  useEffect(() => {
    if (picked) { setValue(picked.id); onPicked(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked]);
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <TextField
        select fullWidth required variant="outlined" margin="dense" label="Lista de contatos"
        value={lists.some((l) => l.id === value) ? value : ""}
        onChange={(e) => setValue(e.target.value)}
        helperText={lists.length ? "Quem vai receber as mensagens." : "Você ainda não tem listas: crie a primeira ao lado."}
      >
        {lists.map((l) => (<MenuItem key={l.id} value={l.id}>{l.name} ({l.itemCount} {Number(l.itemCount) === 1 ? "pessoa" : "pessoas"})</MenuItem>))}
      </TextField>
      <Button variant="outlined" color="primary" onClick={onNew} startIcon={<PlusIcon size={16} />} style={{ marginTop: 8, whiteSpace: "nowrap", height: 40 }}>Nova lista</Button>
    </div>
  );
};

const Campaigns = () => {
  const [tab, setTab] = useState(0);
  const [lists, setLists] = useState([]);
  const [connections, setConnections] = useState([]);
  const [listDialog, setListDialog] = useState(null);
  const [report, setReport] = useState(null);
  const [starting, setStarting] = useState(null);
  const [testing, setTesting] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [newList, setNewList] = useState(false);
  const [pickedList, setPickedList] = useState(null);
  const loadLists = useCallback(() => api.get("/contact-lists").then(({ data }) => setLists(data)), []);

  useEffect(() => {
    loadLists();
    api.get("/whatsapp").then(({ data }) =>
      setConnections(data.filter((w) => ["whatsapp", "whatsapp_cloud"].includes(w.channel)))
    );
  }, [tab, listDialog, loadLists]);

  const act = (id, action, reload, done) => async () => {
    try {
      await api.post(`/campaigns/${id}/${action}`);
      if (done) toast.success(done);
      reload();
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <MainContainer>
      {listDialog && <ListItemsDialog list={listDialog} onClose={() => { setListDialog(null); setReloadKey((k) => k + 1); }} />}
      {report && <ReportDialog campaignId={report} onClose={() => setReport(null)} onChanged={() => setReloadKey((k) => k + 1)} />}
      {starting && <StartDialog campaign={starting} onClose={() => setStarting(null)} onStarted={() => setReloadKey((k) => k + 1)} />}
      {testing && <TestDialog campaign={testing} onClose={() => setTesting(null)} />}
      <ConfirmationModal title="Cancelar a campanha?" open={!!cancelling} onClose={() => setCancelling(null)} onConfirm={async () => { const c = cancelling; try { await api.post(`/campaigns/${c.id}/cancel`); toast.success("Campanha cancelada."); setReloadKey((k) => k + 1); } catch (err) { toastError(err); } }}>
        {cancelling ? `“${cancelling.name}” para de enviar agora e os envios que faltam (${(cancelling.counters || {}).pending || 0}) são cancelados. Isso não pode ser desfeito.` : ""}
      </ConfirmationModal>
      <NewListDialog
        open={newList}
        onClose={() => setNewList(false)}
        onCreated={(l) => { loadLists(); setReloadKey((k) => k + 1); setPickedList(l); }}
      />
      <MainHeader>
        <Title>Campanhas em massa</Title>
      </MainHeader>
      <Paper variant="outlined" style={{ marginBottom: 8 }}>
        <Tabs value={tab} onChange={(e, v) => setTab(v)} indicatorColor="primary" textColor="primary">
          <Tab label="Campanhas" />
          <Tab label="Listas de contatos" />
        </Tabs>
      </Paper>

      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {tab === 0 ? (
          <CrudPage
            embedded
            title="Campanhas"
            endpoint="/campaigns"
            addLabel="Nova campanha"
            socketEvent="campaign"
            reloadKey={reloadKey}
            dialogWidth="md"
            mapIn={(row) => ({
              ...row,
              steps: Array.isArray(row.steps) && row.steps.length
                ? row.steps.map((st) => ({ ...st, mediaName: st.mediaUrl || "" }))
                : [{ ...emptyStep(), body: row.message || "", mediaUrl: row.mediaUrl || null, mediaName: row.mediaUrl || "", type: row.mediaUrl ? "media" : "text" }],
            })}
            mapOut={(payload) => {
              const steps = (payload.steps || []).map(({ mediaName, ...st }) => st);
              return { ...payload, steps, message: steps[0] ? steps[0].body : "" };
            }}
            emptyText="Nenhuma campanha ainda. Clique em Nova campanha: você pode criar a lista de contatos dentro do formulário."
            canEdit={(r) => ["draft", "scheduled", "paused"].includes(r.status)}
            canDelete={(r) => !["running"].includes(r.status)}
            fields={[
              { name: "name", label: "Nome da campanha", required: true },
              {
                name: "contactListId",
                type: "custom",
                required: true,
                label: "Lista de contatos",
                render: (value, setValue) => (
                  <ListPicker value={value} lists={lists} picked={pickedList} onPicked={() => setPickedList(null)} setValue={setValue} onNew={() => setNewList(true)} />
                ),
              },
              {
                name: "whatsappId",
                type: "custom",
                label: "Conexão de envio",
                render: (value, setValue) => <ConnectionPicker value={value} setValue={setValue} connections={connections} />,
              },
              {
                name: "templateName",
                label: "Modelo aprovado da API oficial (obrigatório para quem nunca conversou)",
                hideOn: (v) => (connections.find((c) => c.id === v.whatsappId) || {}).channel !== "whatsapp_cloud",
                helper: "Nome do modelo aprovado no painel da Meta. Com modelo, só a primeira mensagem é enviada e o {{1}} do modelo recebe o primeiro nome.",
              },
              {
                name: "templateLanguage",
                label: "Idioma do modelo",
                default: "pt_BR",
                hideOn: (v) => (connections.find((c) => c.id === v.whatsappId) || {}).channel !== "whatsapp_cloud",
              },
              {
                name: "steps",
                type: "custom",
                label: "Mensagens",
                default: [emptyStep()],
                render: (value, setValue) => (
                  <StepsEditor
                    steps={Array.isArray(value) && value.length ? value : [emptyStep()]}
                    onChange={setValue}
                    riskNote="Em conexão por QR Code, mensagens em sequência aumentam o risco: prefira poucas e curtas."
                  />
                ),
              },
              { name: "scheduledAt", label: "Agendar início (vazio = iniciar manualmente)", type: "datetime", helper: "Com uma data, a campanha começa sozinha nesse horário. Dá para iniciar antes pelo botão de iniciar." },
              { name: "intervalMin", label: "Intervalo mínimo entre mensagens (s)", type: "number", default: 20, helper: "Intervalos curtos aumentam o risco de bloqueio em conexão por QR Code." },
              { name: "intervalMax", label: "Intervalo máximo entre mensagens (s)", type: "number", default: 60 },
              { name: "batchSize", label: "Pausar a cada N mensagens", type: "number", default: 20 },
              { name: "batchPause", label: "Duração da pausa (s)", type: "number", default: 300 },
            ]}
            columns={[
              { header: "Campanha", field: "name" },
              { header: "Lista", render: (r) => r.contactList?.name },
              {
                header: "Situação",
                render: (r) => {
                  const [label, color] = STATUS[r.status] || [r.status, "default"];
                  return (
                    <div>
                      <Chip size="small" label={label} color={color} />
                      {r.pauseReason && (
                        <Typography variant="caption" display="block" style={{ maxWidth: 280, color: r.status === "paused" ? "#dc2626" : "#b45309" }}>
                          {r.pauseReason}
                        </Typography>
                      )}
                    </div>
                  );
                },
              },
              {
                header: "Progresso",
                render: (r) => {
                  const { sent, failed, cancelled = 0, total } = r.counters || { sent: 0, failed: 0, cancelled: 0, total: 0 };
                  const done = sent + failed + cancelled;
                  return (
                    <div style={{ minWidth: 120 }}>
                      <LinearProgress variant="determinate" value={total ? (done / total) * 100 : 0} />
                      <Typography variant="caption">
                        {sent}/{total} enviadas{failed ? ` · ${failed} falhas` : ""}{cancelled ? ` · ${cancelled} canceladas` : ""}
                      </Typography>
                    </div>
                  );
                },
              },
              { header: "Agendada", render: (r) => (r.scheduledAt ? format(parseISO(r.scheduledAt), "dd/MM HH:mm") : "—") },
            ]}
            rowActions={(r, reload) => (
              <>
                {["draft", "paused", "scheduled"].includes(r.status) && (
                  <IconAction title={r.status === "scheduled" ? "Iniciar agora" : r.status === "paused" ? "Retomar" : "Iniciar"} onClick={() => setStarting(r)}><PlayArrow /></IconAction>
                )}
                {["running", "scheduled"].includes(r.status) && (
                  <IconAction title="Pausar" onClick={act(r.id, "pause", reload, "Campanha pausada.")}><Pause /></IconAction>
                )}
                {["running", "paused", "scheduled"].includes(r.status) && (
                  <IconAction title="Cancelar campanha" onClick={() => setCancelling(r)}><Stop /></IconAction>
                )}
                {r.counters && r.counters.failed > 0 && ["running", "paused", "finished"].includes(r.status) && (
                  <IconAction title={`Reenviar as ${r.counters.failed} falhas`} onClick={act(r.id, "retry-failed", reload, "As falhas voltaram para a fila.")}><RotateCcw size={18} /></IconAction>
                )}
                <IconAction title="Enviar um teste para o meu número" onClick={() => setTesting(r)}><SendHorizontal size={18} /></IconAction>
                <IconAction title="Duplicar como rascunho" onClick={act(r.id, "duplicate", reload, "Campanha duplicada como rascunho.")}><Copy size={18} /></IconAction>
                <IconAction title="Ver relatório" onClick={() => setReport(r.id)}><Assessment /></IconAction>
              </>
            )}
          />
        ) : (
          <CrudPage
            embedded
            title="Listas de contatos"
            endpoint="/contact-lists"
            addLabel="Nova lista"
            reloadKey={reloadKey}
            emptyText="Nenhuma lista ainda. Use “Criar a partir do CRM” para montar uma lista com os leads do funil."
            headerExtra={<Button variant="outlined" color="primary" startIcon={<UsersIcon size={16} />} onClick={() => setNewList(true)}>Criar a partir do CRM</Button>}
            fields={[{ name: "name", label: "Nome da lista", required: true }]}
            columns={[
              { header: "Lista", field: "name" },
              { header: "Contatos", field: "itemCount" },
            ]}
            rowActions={(r) => (
              <IconAction title="Ver e editar os contatos" onClick={() => setListDialog(r)}><People /></IconAction>
            )}
          />
        )}
      </div>
    </MainContainer>
  );
};

export default Campaigns;
