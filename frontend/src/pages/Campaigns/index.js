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

import CrudPage from "../../components/CrudPage";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";

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
      toast.success(`${data.imported} importados, ${data.skipped} ignorados (duplicados/inválidos)`);
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
              onChange={async (e) => {
                const f = e.target.files[0];
                if (f) doImport(parseRows(await f.text()));
                e.target.value = "";
              }}
            />
          </Button>
          <Button variant="outlined" onClick={importSystemContacts}>Importar contatos do sistema</Button>
        </div>
        <div className={classes.scroll}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Nome</TableCell>
                <TableCell>Número</TableCell>
                <TableCell>Email</TableCell>
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
                    <IconButton
                      size="small"
                      onClick={async () => {
                        await api.delete(`/contact-lists/${list.id}/items/${i.id}`);
                        load();
                      }}
                    >
                      <DeleteOutline fontSize="small" />
                    </IconButton>
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

const ReportDialog = ({ campaignId, onClose }) => {
  const classes = useStyles();
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get(`/campaigns/${campaignId}/report`).then(({ data: d }) => setData(d)).catch(toastError);
  }, [campaignId]);
  const c = data?.campaign;
  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Relatório{c ? ` — ${c.name}` : ""}</DialogTitle>
      <DialogContent dividers>
        {c && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <Chip label={`Total ${c.counters.total}`} />
              <Chip color="primary" label={`Enviadas ${c.counters.sent}`} />
              <Chip label={`Pendentes ${c.counters.pending}`} />
              <Chip style={{ background: c.counters.failed ? "#ffcdd2" : undefined }} label={`Falhas ${c.counters.failed}`} />
            </div>
            <div className={classes.scroll}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Nome</TableCell>
                    <TableCell>Número</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Quando / erro</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.shippings.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.name}</TableCell>
                      <TableCell>{s.number}</TableCell>
                      <TableCell>{{ pending: "Pendente", sent: "Enviada", failed: "Falhou", cancelled: "Cancelada" }[s.status] || s.status}</TableCell>
                      <TableCell>{s.error || (s.sentAt ? format(parseISO(s.sentAt), "dd/MM HH:mm:ss") : "—")}</TableCell>
                    </TableRow>
                  ))}
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

const Campaigns = () => {
  const [tab, setTab] = useState(0);
  const [lists, setLists] = useState([]);
  const [connections, setConnections] = useState([]);
  const [listDialog, setListDialog] = useState(null);
  const [report, setReport] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    api.get("/contact-lists").then(({ data }) => setLists(data));
    api.get("/whatsapp").then(({ data }) =>
      setConnections(data.filter((w) => ["whatsapp", "whatsapp_cloud"].includes(w.channel)))
    );
  }, [tab, listDialog]);

  const act = (id, action, reload) => async () => {
    try {
      await api.post(`/campaigns/${id}/${action}`);
      reload();
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <MainContainer>
      {listDialog && <ListItemsDialog list={listDialog} onClose={() => { setListDialog(null); setReloadKey((k) => k + 1); }} />}
      {report && <ReportDialog campaignId={report} onClose={() => setReport(null)} />}
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
            emptyText="Nenhuma campanha. Crie uma lista de contatos e depois a campanha."
            canEdit={(r) => ["draft", "scheduled", "paused"].includes(r.status)}
            canDelete={(r) => !["running"].includes(r.status)}
            fields={[
              { name: "name", label: "Nome da campanha", required: true },
              {
                name: "contactListId",
                label: "Lista de contatos",
                type: "select",
                required: true,
                options: lists.map((l) => ({ value: l.id, label: `${l.name} (${l.itemCount})` })),
              },
              {
                name: "whatsappId",
                label: "Enviar pela conexão (vazio = padrão)",
                type: "select",
                options: connections.map((c) => ({
                  value: c.id,
                  label: c.channel === "whatsapp" ? `${c.name} (WhatsApp não oficial · modo ${c.riskMode === "relaxed" ? "flexível" : "seguro"})` : c.name,
                })),
                helper:
                  "Conexões por QR Code (não oficiais) só disparam para quem já conversou com você, respeitam um limite diário de aquecimento e pausam sozinhas se o WhatsApp encerrar a sessão. Para contatos novos use a API oficial (Cloud).",
              },
              {
                name: "message",
                label: "Mensagem",
                type: "textarea",
                rows: 5,
                required: true,
                helper: "Variáveis: {{name}} (nome) e {{number}}. Varie o texto entre campanhas para reduzir risco de bloqueio.",
              },
              { name: "mediaUrl", label: "Anexar imagem/documento (opcional)", type: "file" },
              { name: "scheduledAt", label: "Agendar início (vazio = iniciar manualmente)", type: "datetime" },
              { name: "intervalMin", label: "Intervalo mínimo entre mensagens (s)", type: "number", default: 20 },
              { name: "intervalMax", label: "Intervalo máximo entre mensagens (s)", type: "number", default: 60 },
              { name: "batchSize", label: "Pausar a cada N mensagens", type: "number", default: 20 },
              { name: "batchPause", label: "Duração da pausa (s)", type: "number", default: 300 },
            ]}
            columns={[
              { header: "Campanha", field: "name" },
              { header: "Lista", render: (r) => r.contactList?.name },
              {
                header: "Status",
                render: (r) => {
                  const [label, color] = STATUS[r.status] || [r.status, "default"];
                  return (
                    <div>
                      <Chip size="small" label={label} color={color} />
                      {r.pauseReason && (
                        <Typography variant="caption" color="error" display="block" style={{ maxWidth: 260 }}>
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
                  const { sent, failed, total } = r.counters || { sent: 0, failed: 0, total: 0 };
                  const done = sent + failed;
                  return (
                    <div style={{ minWidth: 120 }}>
                      <LinearProgress variant="determinate" value={total ? (done / total) * 100 : 0} />
                      <Typography variant="caption">
                        {sent}/{total} enviadas{failed ? ` · ${failed} falhas` : ""}
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
                  <IconButton size="small" title="Iniciar" onClick={act(r.id, "start", reload)}><PlayArrow /></IconButton>
                )}
                {["running", "scheduled"].includes(r.status) && (
                  <IconButton size="small" title="Pausar" onClick={act(r.id, "pause", reload)}><Pause /></IconButton>
                )}
                {["running", "paused", "scheduled"].includes(r.status) && (
                  <IconButton size="small" title="Cancelar" onClick={act(r.id, "cancel", reload)}><Stop /></IconButton>
                )}
                <IconButton size="small" title="Relatório" onClick={() => setReport(r.id)}><Assessment /></IconButton>
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
            emptyText="Nenhuma lista ainda."
            fields={[{ name: "name", label: "Nome da lista", required: true }]}
            columns={[
              { header: "Lista", field: "name" },
              { header: "Contatos", field: "itemCount" },
            ]}
            rowActions={(r) => (
              <IconButton size="small" title="Gerenciar contatos" onClick={() => setListDialog(r)}><People /></IconButton>
            )}
          />
        )}
      </div>
    </MainContainer>
  );
};

export default Campaigns;
