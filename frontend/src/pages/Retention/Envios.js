import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import {
  Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, MenuItem, TextField, Typography, makeStyles,
} from "@material-ui/core";
import { Autocomplete } from "@material-ui/lab";
import { Download, MessageSquare, Send } from "lucide-react";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { downloadFile } from "../../utils/saveBlob";
import WhatsPreview from "./Preview";

const useStyles = makeStyles((theme) => {
  const line = theme.palette.type === "dark" ? "rgba(255,255,255,.09)" : "#e3e9f1";
  return {
    card: { background: theme.palette.cards.background, border: `1px solid ${line}`, borderRadius: 16, padding: theme.spacing(2.25), marginBottom: theme.spacing(2) },
    hint: { fontSize: 13, color: theme.palette.text.secondary },
    toolbar: { display: "flex", gap: theme.spacing(1.25), flexWrap: "wrap", alignItems: "center", marginBottom: theme.spacing(1.5) },
    row: { display: "flex", gap: 12, padding: "12px 0", borderTop: `1px solid ${line}`, flexWrap: "wrap", alignItems: "flex-start", "&:first-of-type": { borderTop: 0 } },
    when: { width: 92, flex: "none", fontSize: 12.5, color: theme.palette.text.secondary, lineHeight: 1.35 },
    chip: { fontSize: 11.5, fontWeight: 700, padding: "2px 9px", borderRadius: 999, display: "inline-block" },
    msg: { marginTop: 8 },
    grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: theme.spacing(2), [theme.breakpoints.down("sm")]: { gridTemplateColumns: "1fr" } },
  };
});

export const KIND_LABEL = { nps: "Pesquisa de satisfação", risk: "Mensagem de retenção", remat: "Aviso de rematrícula", custom: "Mensagem escrita na hora" };
const KIND_STYLE = {
  nps: { background: "rgba(6,147,227,.14)", color: "#0b6bb5" },
  risk: { background: "rgba(234,88,12,.15)", color: "#c2410c" },
  remat: { background: "rgba(14,165,233,.15)", color: "#0369a1" },
  custom: { background: "rgba(100,116,139,.18)", color: "#475569" },
};
const when = (iso) => { const d = new Date(iso); return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`; };
const RANGES = [["7", "Últimos 7 dias"], ["30", "Últimos 30 dias"], ["90", "Últimos 90 dias"], ["365", "Último ano"]];
const periodOf = (range) => {
  const day = (t) => t.toLocaleDateString("en-CA", { timeZone: "America/Porto_Velho" });
  const to = new Date();
  return { from: day(new Date(to.getTime() - (Number(range) - 1) * 86400000)), to: day(to) };
};

// choosing who gets a message and seeing it before it goes
const MAX_PEOPLE = 200;
const SOURCES = [
  ["students", "Alunos matriculados", "Quem já está matriculado"],
  ["crm", "Leads do CRM", "Inclui quem ainda não se matriculou. Filtre por etapa, curso, polo ou etiqueta"],
  ["list", "Lista de contatos", "Uma lista criada em Campanhas"],
  ["contacts", "Contatos do sistema", "Qualquer contato salvo, mesmo fora do CRM"],
];
const NO_FILTER = { stageId: "", courseId: "", poloId: "", tagId: "", enrolled: "" };
const asList = (d, key) => (Array.isArray(d) ? d : (d && d[key]) || []);

export const Composer = ({ open, onClose, onSent, manager, initialIds = [] }) => {
  const classes = useStyles();
  const [kind, setKind] = useState("nps");
  const [text, setText] = useState("");
  const [source, setSource] = useState("students");
  const [filters, setFilters] = useState(NO_FILTER);
  const [listId, setListId] = useState("");
  const [whatsappId, setWhatsappId] = useState("");
  const [picked, setPicked] = useState([]);
  const [found, setFound] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [lookups, setLookups] = useState({ stages: [], courses: [], polos: [], tags: [], lists: [], connections: [] });
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  // a tutor reaches their own students; the management reaches everyone (the survey and the retention message are for students:
  // choosing someone who is not one yet switches to the message written by hand)
  const sources = SOURCES.filter(([k]) => k === "students" || k === "crm" || manager);
  const outside = picked.filter((x) => !x.leadId);
  const notYet = picked.filter((x) => !x.leadId || x.enrolled === false);
  const toHand = (why) => { if (kind !== "custom") { setKind("custom"); toast.info(why); } };

  useEffect(() => {
    if (!open) return;
    setKind("nps"); setText(""); setPicked([]); setResult(null); setPreview(null); setSource("students"); setFilters(NO_FILTER); setListId(""); setWhatsappId(""); setSearch("");
    const get = (url, key, field) => api.get(url).then(({ data }) => setLookups((l) => ({ ...l, [field]: asList(data, key) }))).catch(() => undefined);
    get("/lead-stages", "stages", "stages");
    get("/courses", "courses", "courses");
    get("/polos", "polos", "polos");
    get("/tags", "tags", "tags");
    if (manager) {
      get("/contact-lists", "lists", "lists");
      api.get("/whatsapp").then(({ data }) => setLookups((l) => ({ ...l, connections: asList(data, "whatsapps").filter((w) => ["whatsapp", "whatsapp_cloud"].includes(w.channel)) }))).catch(() => undefined);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // coming from a list of students already chosen elsewhere (Risco, Rematrícula)
  useEffect(() => {
    if (!open || !initialIds.length) return;
    api.get("/retention/students", { params: { search: "" } })
      .then(({ data }) => setPicked(data.filter((x) => initialIds.includes(x.id)).map((x) => ({ key: `l${x.id}`, kind: "lead", leadId: x.id, name: x.name, sub: [x.polo, x.tutor ? `tutor ${x.tutor}` : null].filter(Boolean).join(" · ") }))))
      .catch(() => undefined);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // texto livre é o único que alcança quem não é aluno: ao trocar, sai quem não pode receber
  const changeKind = (value) => {
    setKind(value);
    if (value !== "custom") {
      if (notYet.length) toast.info(`${notYet.length} ${notYet.length === 1 ? "pessoa que ainda não é aluna saiu" : "pessoas que ainda não são alunas saíram"} da seleção: essa mensagem só vai para alunos matriculados.`);
      setPicked((cur) => cur.filter((x) => x.leadId && x.enrolled !== false));
      if (source === "list" || source === "contacts") setSource("students");
      setFilters((f) => ({ ...f, enrolled: f.enrolled === "no" ? "" : f.enrolled }));
      setWhatsappId("");
    }
  };
  const changeSource = (value) => {
    setSource(value); setSearch(""); setFound({ items: [], total: 0 });
    if (value === "list" || value === "contacts") toHand("Para quem ainda não é aluno, a mensagem é escrita na hora.");
  };

  const query = useMemo(() => ({
    source, search: search || undefined, listId: source === "list" ? listId || undefined : undefined,
    ...(source === "crm" ? { stageId: filters.stageId || undefined, courseId: filters.courseId || undefined, poloId: filters.poloId || undefined, tagId: filters.tagId || undefined, enrolled: filters.enrolled || (kind !== "custom" ? "yes" : undefined) } : {}),
  }), [source, search, listId, filters, kind]);

  useEffect(() => {
    if (!open) return undefined;
    if (source === "list" && !listId) { setFound({ items: [], total: 0 }); return undefined; }
    let live = true;
    setLoading(true);
    const t = setTimeout(() => {
      api.get("/retention/audience", { params: query })
        .then(({ data }) => { if (live) setFound(data); })
        .catch(() => { if (live) setFound({ items: [], total: 0 }); })
        .then(() => { if (live) setLoading(false); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [open, query, source, listId]);

  // the message as it will arrive, for the first chosen people
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => {
      api.post("/retention/preview", { kind, text, leadIds: picked.filter((x) => x.leadId).slice(0, 3).map((x) => x.leadId), names: picked.filter((x) => !x.leadId).slice(0, 3).map((x) => x.name) })
        .then(({ data }) => setPreview(data)).catch(() => setPreview(null));
    }, 250);
    return () => clearTimeout(t);
  }, [open, kind, text, picked]);

  const add = (items) => {
    const have = new Set(picked.map((x) => x.key));
    const more = items.filter((x) => !have.has(x.key));
    const room = MAX_PEOPLE - picked.length;
    if (more.length > room) toast.info(`O limite de cada envio é de ${MAX_PEOPLE} pessoas. Foram adicionadas ${room}.`);
    setPicked([...picked, ...more.slice(0, Math.max(0, room))]);
  };

  const addAllFound = async () => {
    try {
      const { data } = await api.get("/retention/audience", { params: { ...query, all: "1" } });
      add(data.items);
    } catch (err) { toastError(err); }
  };

  const addRisk = async () => {
    try {
      const { data } = await api.get("/retention/risk");
      add(data.students.map((x) => ({ key: `l${x.id}`, kind: "lead", leadId: x.id, name: x.name, sub: [x.polo, x.tutor ? `tutor ${x.tutor}` : null].filter(Boolean).join(" · ") })));
    } catch (err) { toastError(err); }
  };

  const send = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/retention/send", {
        kind,
        text: kind === "custom" ? text : undefined,
        leadIds: picked.filter((x) => x.leadId).map((x) => x.leadId),
        recipients: outside.map((x) => ({ contactId: x.contactId, number: x.number, name: x.name })),
        whatsappId: outside.length && whatsappId ? Number(whatsappId) : undefined,
      });
      setResult(data);
      onSent();
    } catch (err) { toastError(err); }
    setBusy(false);
  };

  const canSend = picked.length > 0 && (kind !== "custom" || text.trim().length > 0);
  const setFilter = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const sel = (label, key, options, empty) => (
    <TextField select size="small" variant="outlined" label={label} value={filters[key]} onChange={setFilter(key)} style={{ minWidth: 150, flex: 1 }}>
      <MenuItem value="">{empty}</MenuItem>
      {options.map((o) => <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>)}
    </TextField>
  );
  const unmatched = source === "list" ? found.unmatched || 0 : 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{result ? "Envio concluído" : "Novo envio"}</DialogTitle>
      <DialogContent dividers>
        {busy && <LinearProgress />}
        {result ? (
          <div>
            {result.background ? (
              <Typography gutterBottom>
                <b>{result.queued}</b> mensagens entraram na fila. Para proteger o número do WhatsApp, elas saem uma a cada poucos segundos. Acompanhe uma a uma na aba <b>Envios</b>.
              </Typography>
            ) : (
              <Typography gutterBottom><b>{result.sent}</b> enviado{result.sent === 1 ? "" : "s"}{result.failed ? <> · <b style={{ color: "#dc2626" }}>{result.failed}</b> com problema</> : ""}.</Typography>
            )}
            {result.results.map((r, i) => (
              <div key={`${r.leadId}-${i}`} className={classes.row} style={{ padding: "6px 0" }}>
                <span style={{ flex: 1 }}>{r.name || `Aluno ${r.leadId}`}</span>
                <span className={classes.chip} style={r.ok ? { background: "rgba(22,163,74,.15)", color: "#15803d" } : { background: "rgba(220,38,38,.14)", color: "#b91c1c" }}>{r.ok ? "Enviada" : r.error}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className={classes.grid}>
            <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
              <TextField select size="small" variant="outlined" label="O que enviar" value={kind} onChange={(e) => changeKind(e.target.value)}>
                <MenuItem value="nps">Pesquisa de satisfação (nota de 0 a 10)</MenuItem>
                <MenuItem value="risk">Mensagem de retenção (a das configurações)</MenuItem>
                <MenuItem value="custom">Escrever uma mensagem agora</MenuItem>
              </TextField>
              {kind === "custom" && (
                <TextField multiline rows={4} size="small" variant="outlined" label="Mensagem (use {{nome}} para o primeiro nome)" value={text} onChange={(e) => setText(e.target.value)} inputProps={{ maxLength: 1000 }} />
              )}
              {kind !== "custom" && <Typography className={classes.hint}>O texto vem das configurações{manager ? " (aba Configurar)" : ""}. Esta mensagem vai só para alunos matriculados. Para falar com quem ainda não se matriculou, escolha “Escrever uma mensagem agora”.</Typography>}

              <div>
                <Typography variant="subtitle2" gutterBottom>De onde vêm as pessoas</Typography>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {sources.map(([k, label]) => (
                    <Chip key={k} clickable size="small" label={label} color={source === k ? "primary" : "default"} variant={source === k ? "default" : "outlined"} onClick={() => changeSource(k)} />
                  ))}
                </div>
                <Typography className={classes.hint} style={{ marginTop: 6 }}>{(sources.find(([k]) => k === source) || [])[2]}</Typography>
              </div>

              {source === "crm" && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {sel("Etapa", "stageId", lookups.stages, "Todas")}
                  {sel("Curso", "courseId", lookups.courses, "Todos")}
                  {sel("Polo", "poloId", lookups.polos, "Todos")}
                  {sel("Etiqueta", "tagId", lookups.tags, "Todas")}
                  {manager && (
                    <TextField select size="small" variant="outlined" label="Matrícula" value={filters.enrolled || (kind !== "custom" ? "yes" : "")}
                      onChange={(e) => { setFilters({ ...filters, enrolled: e.target.value }); if (e.target.value !== "yes") toHand("Para quem ainda não é aluno, a mensagem é escrita na hora."); }} style={{ minWidth: 150, flex: 1 }}>
                      <MenuItem value="">Todos</MenuItem>
                      <MenuItem value="yes">Já matriculados</MenuItem>
                      <MenuItem value="no">Ainda não matriculados</MenuItem>
                    </TextField>
                  )}
                </div>
              )}
              {source === "list" && (
                <TextField select size="small" variant="outlined" label="Lista de contatos" value={listId} onChange={(e) => setListId(e.target.value)}
                  helperText={lookups.lists.length ? undefined : "Nenhuma lista ainda. Crie uma em Campanhas e importe os números."}>
                  {lookups.lists.map((l) => <MenuItem key={l.id} value={l.id}>{l.name}{l.itemsCount !== undefined ? ` (${l.itemsCount})` : ""}</MenuItem>)}
                </TextField>
              )}

              <Autocomplete
                multiple options={found.items} value={picked} loading={loading}
                onChange={(e, v) => setPicked(v.slice(0, MAX_PEOPLE))} getOptionLabel={(o) => o.name} getOptionSelected={(o, v) => o.key === v.key}
                onInputChange={(e, v, reason) => { if (reason === "input") setSearch(v); }} filterOptions={(x) => x} noOptionsText={loading ? "Buscando..." : "Ninguém encontrado"} loadingText="Buscando..."
                renderOption={(o) => (
                  <div style={{ minWidth: 0 }}>
                    <div>{o.name}</div>
                    <div className={classes.hint}>{[o.number, o.sub].filter(Boolean).join(" · ")}</div>
                  </div>
                )}
                renderTags={(value, getTagProps) => value.map((o, i) => <Chip size="small" label={o.name} {...getTagProps({ index: i })} />)}
                renderInput={(params) => <TextField {...params} variant="outlined" size="small" label="Para quem" placeholder="Busque pelo nome ou telefone" />}
              />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {source !== "students" && found.total > 0 && <Button size="small" variant="outlined" onClick={addAllFound}>Adicionar {found.total > MAX_PEOPLE ? `os primeiros ${MAX_PEOPLE}` : `os ${found.total}`} {source === "crm" ? "do filtro" : source === "list" ? "da lista" : "encontrados"}</Button>}
                <Button size="small" variant="outlined" onClick={addRisk}>Adicionar quem está em risco</Button>
                {picked.length > 0 && <Button size="small" onClick={() => setPicked([])}>Limpar</Button>}
                <span className={classes.hint}>{picked.length} escolhida{picked.length === 1 ? "" : "s"} (até {MAX_PEOPLE})</span>
              </div>
              {unmatched > 0 && <Typography className={classes.hint}>{unmatched} {unmatched === 1 ? "número da lista não está" : "números da lista não estão"} no CRM. Recebem só a mensagem escrita agora.</Typography>}

              {outside.length > 0 && (
                <div>
                  <TextField select fullWidth size="small" variant="outlined" label="Enviar pela conexão" value={whatsappId} onChange={(e) => setWhatsappId(e.target.value)}>
                    <MenuItem value="">A conexão padrão</MenuItem>
                    {lookups.connections.map((w) => <MenuItem key={w.id} value={w.id}>{w.name}{w.channel === "whatsapp_cloud" ? " · API oficial" : " · QR Code"}</MenuItem>)}
                  </TextField>
                  <Typography className={classes.hint} style={{ marginTop: 6 }}>
                    {outside.length} {outside.length === 1 ? "pessoa não está" : "pessoas não estão"} no CRM. Quem pediu para sair (SAIR) não recebe. Por QR Code, quem nunca respondeu também fica de fora, e o envio sai aos poucos para proteger o número.
                  </Typography>
                </div>
              )}
            </div>
            <div>
              <Typography variant="subtitle2" gutterBottom>Como a pessoa vai receber</Typography>
              {preview && preview.samples.map((sm, i) => (
                <div key={`${sm.leadId}-${sm.name}-${i}`} style={{ marginBottom: 10 }}>
                  <WhatsPreview text={sm.text} name={sm.name} buttons={preview.buttons} extra={{}} />
                </div>
              ))}
              {preview && preview.buttons.length > 0 && <Typography className={classes.hint}>Os botões aparecem na conexão da API oficial (Cloud), dentro de 24 horas depois da última mensagem do aluno. Nas demais, ele responde digitando a nota de 0 a 10.</Typography>}
              {picked.length > 3 && <Typography className={classes.hint}>E mais {picked.length - 3} {picked.length - 3 === 1 ? "pessoa" : "pessoas"} com a mesma mensagem.</Typography>}
            </div>
          </div>
        )}
      </DialogContent>
      <DialogActions>
        {result ? <Button variant="contained" color="primary" onClick={onClose}>Fechar</Button> : (
          <>
            <Button onClick={onClose}>Cancelar</Button>
            <Button variant="contained" color="primary" startIcon={<Send size={15} />} disabled={!canSend || busy} onClick={send}>
              {picked.length ? `Enviar para ${picked.length} ${picked.length === 1 ? "pessoa" : "pessoas"}` : "Enviar"}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

// the log: what was sent, to whom, by whom, and how the student answered
const Envios = ({ manager, canCompose }) => {
  const classes = useStyles();
  const history = useHistory();
  const [range, setRange] = useState("30");
  const [kind, setKind] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState({});
  const [compose, setCompose] = useState(false);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);
  const period = useMemo(() => periodOf(range), [range]);

  const load = useCallback((p = 1, replace = true) => {
    api.get("/retention/log", { params: { ...period, kind: kind || undefined, search: search || undefined, page: p } })
      .then(({ data }) => { setMissing(false); setFailed(false); setTotal(data.total); setPage(p); setRows((cur) => (replace || !cur ? data.rows : [...cur, ...data.rows])); })
      .catch((err) => {
        // the server still runs a version without the log: the screen says so instead of an error and a bar that never ends
        if (err && err.response && err.response.status === 404) { setMissing(true); return; }
        setFailed(true);
        toastError(err);
      });
  }, [period, kind, search]);
  useEffect(() => { const t = setTimeout(() => load(1, true), search ? 300 : 0); return () => clearTimeout(t); }, [load, search]);

  return (
    <div>
      <Composer open={compose} onClose={() => setCompose(false)} onSent={() => load(1, true)} manager={manager} />
      <div className={classes.toolbar}>
        <TextField select size="small" variant="outlined" label="Período" value={range} onChange={(e) => setRange(e.target.value)} style={{ width: 170 }}>
          {RANGES.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
        </TextField>
        <TextField select size="small" variant="outlined" label="Tipo" value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: 220 }}>
          <MenuItem value="">Todos</MenuItem>
          {Object.entries(KIND_LABEL).map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
        </TextField>
        <TextField size="small" variant="outlined" label="Buscar aluno" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 190 }} />
        <span style={{ flex: 1 }} />
        <Button size="small" variant="outlined" startIcon={<Download size={15} />} onClick={() => downloadFile("/retention/log.csv", { ...period, kind: kind || undefined, search: search || undefined }, "envios-retencao.csv")}>Baixar planilha</Button>
      </div>
      <div className={classes.card}>
        {missing && <Typography>O registro de envios chega com a próxima atualização do servidor. Quando ela for instalada, tudo o que for enviado aparece aqui.</Typography>}
        {failed && !rows && (
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <Typography>Não foi possível carregar os envios.</Typography>
            <Button size="small" variant="outlined" onClick={() => load(1, true)}>Tentar de novo</Button>
          </div>
        )}
        {!rows && !missing && !failed && <LinearProgress />}
        {rows && rows.length === 0 && <Typography className={classes.hint}>Nenhum envio neste período. {canCompose ? "Use “Novo envio” para escolher os alunos e mandar uma mensagem." : ""}</Typography>}
        {rows && rows.map((r) => (
          <div key={r.id} className={classes.row}>
            <div className={classes.when}>{when(r.createdAt)}</div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span className={classes.chip} style={KIND_STYLE[r.kind]}>{KIND_LABEL[r.kind]}</span>
                <b>{r.lead}</b>
                {r.status === "failed" && <span className={classes.chip} style={{ background: "rgba(220,38,38,.14)", color: "#b91c1c" }} title={r.error || ""}>Falhou</span>}
              </div>
              <div className={classes.hint}>
                {[r.polo, r.tutor ? `tutor: ${r.tutor}` : null, `enviado por ${r.sentBy || "o sistema (automático)"}`, r.withButtons ? "com botões" : null].filter(Boolean).join(" · ")}
              </div>
              {r.kind === "nps" && r.surveyStatus && (
                <div style={{ marginTop: 4, fontSize: 13 }}>
                  {r.surveyStatus === "answered"
                    ? <>Respondeu <b style={{ color: Number(r.score) >= 9 ? "#15803d" : Number(r.score) >= 7 ? "#b45309" : "#dc2626" }}>nota {r.score}</b>{r.comment ? ` · “${r.comment}”` : ""}</>
                    : <span className={classes.hint}>Ainda sem resposta</span>}
                </div>
              )}
              {open[r.id] && <div className={classes.msg}><WhatsPreview text={r.body} name={r.lead} note={r.status === "failed" ? `Não foi enviada: ${r.error || "erro ao enviar"}` : undefined} /></div>}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Button size="small" onClick={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))}>{open[r.id] ? "Esconder" : "Ver mensagem"}</Button>
              {manager && <Button size="small" startIcon={<MessageSquare size={14} />} onClick={() => history.push(`/crm?lead=${r.leadId}`)}>Abrir lead</Button>}
            </div>
          </div>
        ))}
        {rows && rows.length < total && <Button style={{ marginTop: 8 }} onClick={() => load(page + 1, false)}>Mostrar mais ({total - rows.length})</Button>}
      </div>
    </div>
  );
};

export default Envios;
