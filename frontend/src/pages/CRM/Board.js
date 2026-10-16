import React, { useCallback, useEffect, useRef, useState } from "react";
import { useHistory, useLocation } from "react-router-dom";
import { toast } from "react-toastify";
import {
  Button, TextField, MenuItem, InputAdornment, Dialog, DialogTitle, DialogContent, DialogActions,
  Typography, makeStyles, ButtonGroup, Chip, Table, TableHead, TableRow, TableCell, TableBody, Paper,
} from "@material-ui/core";
import { HeartHandshake, Search, Plus, Upload, LayoutGrid, List, Calendar, BadgeCheck, Rocket, Hourglass } from "lucide-react";
import { format, parseISO } from "date-fns";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import openSocket from "../../services/socket-io";
import LeadDrawer, { LostDialog } from "./LeadDrawer";
import LeadFields from "./LeadFields";
import EnrollDialog from "./EnrollDialog";
import ImportDialog from "./ImportDialog";
import { useCrmOptions, SourceIcon, ScoreRing, OwnerAvatar, ago, short, isOverdue, burst } from "./shared";

const useStyles = makeStyles((theme) => ({
  filters: { display: "flex", gap: theme.spacing(1), flexWrap: "wrap", marginBottom: theme.spacing(1.5) },
  board: {
    display: "grid", gap: theme.spacing(1.5), alignItems: "start", flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", paddingBottom: theme.spacing(2), ...theme.scrollbarStyles,
  },
  col: {
    background: theme.palette.type === "dark" ? "#0a1322" : "#eef2f7", borderRadius: 14, padding: theme.spacing(1),
    display: "flex", flexDirection: "column", gap: theme.spacing(1), border: "1px solid transparent",
    transition: "border-color .15s, background .15s, box-shadow .2s",
  },
  colOver: { borderColor: theme.palette.accent.main, boxShadow: `0 0 0 3px ${theme.palette.accent.main}26`, background: theme.palette.action.selected },
  colHead: { display: "flex", alignItems: "center", gap: 8, padding: theme.spacing(0.5, 0.75) },
  dot: { width: 9, height: 9, borderRadius: "50%", flex: "none" },
  colName: { fontWeight: 600, fontSize: 13.5, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  count: { fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, background: theme.palette.cards.background, borderRadius: 999, padding: "1px 8px", border: theme.border.divider },
  colBody: { display: "flex", flexDirection: "column", gap: theme.spacing(1), maxHeight: "calc(100vh - 330px)", minHeight: 40, overflowY: "auto", overflowX: "hidden", ...theme.scrollbarStyles },
  card: {
    background: theme.palette.cards.background, border: theme.border.divider, borderRadius: 12, padding: theme.spacing(1.25),
    cursor: "grab", display: "grid", gap: 8, animation: "pop-in .25s var(--ease-out) both",
    transition: "transform .18s var(--ease-out), box-shadow .2s, border-color .2s",
    "&:hover": { transform: "translateY(-2px)", borderColor: theme.palette.accent.main, boxShadow: "0 8px 20px -10px rgba(11,66,121,.4)" },
    "&:active": { cursor: "grabbing" },
  },
  cardDragging: { opacity: 0.45, transform: "rotate(-1.5deg) scale(.98)" },
  cardTop: { display: "flex", alignItems: "flex-start", gap: 8 },
  cardName: { fontWeight: 600, fontSize: 14, lineHeight: 1.25, flex: 1, minWidth: 0, overflowWrap: "anywhere" },
  cardCourse: { fontSize: 12.5, color: theme.palette.text.secondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  // the chips wrap onto a second line instead of being cut ("Out…", "Quer r…"): every one stays readable
  cardFoot: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, fontSize: 12, color: theme.palette.text.secondary, minWidth: 0 },
  chip: { display: "inline-flex", alignItems: "center", gap: 4, borderRadius: 999, padding: "1px 8px", fontSize: 11.5, fontWeight: 500, background: theme.palette.action.selected, whiteSpace: "nowrap", minWidth: 0, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" },
  chipLate: { background: "rgba(220,38,38,.12)", color: "#dc2626" },
  chipHot: { background: "rgba(254,248,76,.45)", color: "#6b5d00" },
  chipPaid: { background: "rgba(22,163,74,.14)", color: "#15803d" },
  more: { fontSize: 12.5, color: theme.palette.text.secondary, textAlign: "center", cursor: "pointer", padding: 4, "&:hover": { color: theme.palette.text.primary } },
  empty: { fontSize: 12.5, color: theme.palette.text.secondary, textAlign: "center", padding: theme.spacing(2, 1), border: `1px dashed ${theme.palette.divider}`, borderRadius: 10 },
  tableWrap: { flex: 1, overflowY: "auto", overflowX: "hidden", ...theme.scrollbarStyles },
}));

const LeadCard = ({ lead, onOpen, onDragStart, onDragEnd, dragging }) => {
  const classes = useStyles();
  return (
    <div className={`${classes.card} ${dragging ? classes.cardDragging : ""}`} draggable onClick={() => onOpen(lead.id)}
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(lead.id)); e.dataTransfer.effectAllowed = "move"; onDragStart(lead); }} onDragEnd={onDragEnd}>
      <div className={classes.cardTop}>
        <div className={classes.cardName}>{lead.name}</div>
        <ScoreRing value={lead.score} />
      </div>
      {lead.course && <div className={classes.cardCourse}>{lead.course.name}{lead.course.modality ? ` · ${lead.course.modality}` : ""}</div>}
      {lead.tags && lead.tags.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {lead.tags.slice(0, 3).map((t) => (<span key={t.id} className={classes.chip} style={{ background: t.color, color: "#fff" }}>{t.name}</span>))}
        </div>
      )}
      <div className={classes.cardFoot}>
        {/* an enrolled student is past "where did it come from" and "wants to enrol": only what still matters is shown */}
        {!lead.wonAt && <span className={classes.chip} title={`Origem: ${lead.source}`}><SourceIcon source={lead.source} size={12} />{lead.source}</span>}
        {lead.affiliate && <span className={`${classes.chip} ${classes.chipHot}`} title={`Indicado pelo afiliado ${lead.affiliate.name}`}>Afiliado: {String(lead.affiliate.name || "").split(" ")[0]}</span>}
        {lead.slaAlertedAt && !lead.firstContactAt && (
          <span className={`${classes.chip} ${classes.chipLate}`} title="Este lead novo passou do tempo de resposta e ainda não foi atendido">
            <Hourglass size={12} />Sem resposta
          </span>
        )}
        {!lead.wonAt && lead.decisionTimeline === "Quer matricular agora" && (
          <span className={`${classes.chip} ${classes.chipHot}`} title="Quer matricular agora"><Rocket size={12} />Quer matricular</span>
        )}
        {lead.payments && lead.payments.length > 0 && (
          <span className={`${classes.chip} ${classes.chipPaid}`} title="Taxa de matrícula paga"><BadgeCheck size={12} />Taxa paga</span>
        )}
        {lead.onboardingStatus && lead.onboardingStatus !== "none" && (
          <span className={`${classes.chip} ${lead.onboardingStatus === "done" ? classes.chipPaid : ""}`} title="Situação da ambientação com o tutor">
            <HeartHandshake size={12} />{{ pending: "Aguarda tutor", started: "Em ambientação", done: "Ambientado" }[lead.onboardingStatus]}
          </span>
        )}
        {lead.nextFollowUpAt && (
          <span className={`${classes.chip} ${isOverdue(lead.nextFollowUpAt) ? classes.chipLate : ""}`} title="Próximo contato">
            <Calendar size={12} />{format(parseISO(lead.nextFollowUpAt), "dd/MM HH:mm")}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span title={`Último contato ${ago(lead.lastContactAt || lead.createdAt)}`} style={{ whiteSpace: "nowrap" }}>{short(lead.lastContactAt || lead.createdAt)}</span>
        <OwnerAvatar owner={lead.owner} />
      </div>
    </div>
  );
};

const NewLeadDialog = ({ open, onClose, ctx, onCreated }) => {
  const [lead, setLead] = useState({ source: "WhatsApp" });
  useEffect(() => { if (open) setLead({ source: "WhatsApp" }); }, [open]);
  const save = async () => {
    try {
      const { data } = await api.post("/leads", { ...lead, tagIds: undefined });
      if (lead.tagIds && lead.tagIds.length) await api.put(`/leads/${data.lead.id}`, { tagIds: lead.tagIds });
      toast.success(data.created ? "Lead criado" : "Esse contato já existia — dados atualizados");
      onCreated(data.lead.id);
      onClose();
    } catch (err) { toastError(err); }
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth scroll="paper">
      <DialogTitle>Novo lead</DialogTitle>
      <DialogContent><LeadFields lead={lead} onChange={setLead} {...ctx} /></DialogContent>
      <DialogActions>
        <Button variant="outlined" color="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="contained" color="primary" onClick={save} disabled={!lead.name || (!lead.phone && !lead.email)}>Criar lead</Button>
      </DialogActions>
    </Dialog>
  );
};

const Board = () => {
  const classes = useStyles();
  const history = useHistory();
  const location = useLocation();
  const ctx = useCrmOptions();
  const [view, setView] = useState("board");
  const [filters, setFilters] = useState({ search: "", ownerId: "", courseId: "", source: "", affiliate: "", followUp: new URLSearchParams(location.search).get("followUp") || "" });
  const [board, setBoard] = useState(null);
  const [list, setList] = useState({ leads: [], count: 0 });
  const [openId, setOpenId] = useState(Number(new URLSearchParams(location.search).get("lead")) || null);
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [lostFor, setLostFor] = useState(null);
  const [enrollFor, setEnrollFor] = useState(null);
  const timer = useRef(null);

  const params = useCallback(() => {
    const p = {};
    Object.entries(filters).forEach(([k, v]) => { if (v) p[k] = v; });
    return p;
  }, [filters]);

  const load = useCallback(async () => {
    try {
      if (view === "board") {
        const { data } = await api.get("/crm/board", { params: params() });
        setBoard(data.stages);
      } else {
        const { data } = await api.get("/leads", { params: { ...params(), limit: 100 } });
        setList(data);
      }
    } catch (err) { toastError(err); }
  }, [params, view]);

  useEffect(() => { const t = setTimeout(load, filters.search ? 350 : 0); return () => clearTimeout(t); }, [load, filters.search]);

  useEffect(() => {
    const socket = openSocket();
    socket.on("lead", () => { clearTimeout(timer.current); timer.current = setTimeout(load, 500); });
    return () => { clearTimeout(timer.current); socket.disconnect(); };
  }, [load]);

  const moveLead = async (leadId, stage, e, extra = {}) => { e && e.persist && e.persist();
    // optimistic update so the card lands instantly
    setBoard((prev) => {
      if (!prev) return prev;
      let moved;
      const without = prev.map((s) => {
        const found = s.leads.find((l) => l.id === leadId);
        if (found) { moved = found; return { ...s, count: s.count - 1, leads: s.leads.filter((l) => l.id !== leadId) }; }
        return s;
      });
      return without.map((s) => (s.id === stage.id && moved ? { ...s, count: s.count + 1, leads: [moved, ...s.leads] } : s));
    });
    try {
      await api.put(`/leads/${leadId}/stage`, { stageId: stage.id, ...extra });
      if (stage.type === "won" && e) burst(e.clientX, e.clientY);
    } catch (err) { toastError(err); }
    load();
  };

  const onDrop = (e, stage) => {
    e.preventDefault();
    setOver(null);
    const id = Number(e.dataTransfer.getData("text/plain")) || (drag && drag.id);
    setDrag(null);
    if (!id) return;
    const current = board.find((s) => s.leads.some((l) => l.id === id));
    if (current && current.id === stage.id) return;
    if (stage.type === "lost") setLostFor({ id, stage });
    else if (stage.type === "won") {
      // enrollment goes through the confirmation (polo, tutor, fee)
      const lead = board.flatMap((s) => s.leads).find((l) => l.id === id);
      if (lead) setEnrollFor(lead);
    } else moveLead(id, stage, e);
  };

  const loadMore = async (stage) => {
    const { data } = await api.get("/leads", { params: { ...params(), stageId: stage.id, offset: stage.leads.length, limit: 30 } });
    setBoard((prev) => prev.map((s) => (s.id === stage.id ? { ...s, leads: [...s.leads, ...data.leads] } : s)));
  };

  const totalOpen = board ? board.filter((s) => s.type === "open").reduce((a, s) => a + s.count, 0) : 0;

  return (
    <MainContainer>
      {enrollFor && <EnrollDialog open lead={enrollFor} onClose={() => setEnrollFor(null)} onDone={() => load()} />}
      <LostDialog open={!!lostFor} reasons={ctx.options.lostReasons} onClose={() => setLostFor(null)}
        onConfirm={(reason, note) => { const f = lostFor; setLostFor(null); moveLead(f.id, f.stage, null, { lostReason: reason, lostNote: note }); }} />
      <NewLeadDialog open={newOpen} onClose={() => setNewOpen(false)} ctx={ctx} onCreated={(id) => { setOpenId(id); load(); }} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onDone={load} />
      <LeadDrawer leadId={openId} ctx={ctx} onClose={() => { setOpenId(null); if (location.search) history.replace("/crm"); }} onChanged={load} />

      <MainHeader>
        <Title>Funil de captação</Title>
        {board && <Chip size="small" label={`${totalOpen} em andamento`} />}
        <MainHeaderButtonsWrapper>
          <ButtonGroup size="small">
            <Button onClick={() => setView("board")} variant={view === "board" ? "contained" : "outlined"} color={view === "board" ? "primary" : "default"} startIcon={<LayoutGrid size={15} />}>Funil</Button>
            <Button onClick={() => setView("list")} variant={view === "list" ? "contained" : "outlined"} color={view === "list" ? "primary" : "default"} startIcon={<List size={15} />}>Lista</Button>
          </ButtonGroup>
          <Button variant="outlined" startIcon={<Upload size={16} />} onClick={() => setImportOpen(true)}>Importar</Button>
          <Button variant="contained" color="primary" startIcon={<Plus size={16} />} onClick={() => setNewOpen(true)}>Novo lead</Button>
        </MainHeaderButtonsWrapper>
      </MainHeader>

      <div className={classes.filters}>
        <TextField size="small" variant="outlined" placeholder="Buscar nome, telefone ou e-mail" value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })} style={{ minWidth: 260 }}
          InputProps={{ startAdornment: (<InputAdornment position="start"><Search size={16} /></InputAdornment>) }} />
        <TextField select size="small" variant="outlined" label="Responsável" value={filters.ownerId} onChange={(e) => setFilters({ ...filters, ownerId: e.target.value })} style={{ minWidth: 160 }}>
          <MenuItem value="">Todos</MenuItem>
          <MenuItem value="none">Sem responsável</MenuItem>
          {ctx.users.map((u) => (<MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>))}
        </TextField>
        <TextField select size="small" variant="outlined" label="Curso" value={filters.courseId} onChange={(e) => setFilters({ ...filters, courseId: e.target.value })} style={{ minWidth: 170 }}>
          <MenuItem value="">Todos</MenuItem>
          {ctx.courses.map((c) => (<MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>))}
        </TextField>
        <TextField select size="small" variant="outlined" label="Origem" value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })} style={{ minWidth: 150 }}>
          <MenuItem value="">Todas</MenuItem>
          {(ctx.options.sources || []).map((s) => (<MenuItem key={s} value={s}>{s}</MenuItem>))}
        </TextField>
        <TextField select size="small" variant="outlined" label="Afiliados" value={filters.affiliate} onChange={(e) => setFilters({ ...filters, affiliate: e.target.value })} style={{ minWidth: 150 }}>
          <MenuItem value="">Todos os leads</MenuItem>
          <MenuItem value="any">Só indicados por afiliado</MenuItem>
        </TextField>
        <TextField select size="small" variant="outlined" label="Retorno" value={filters.followUp} onChange={(e) => setFilters({ ...filters, followUp: e.target.value })} style={{ minWidth: 140 }}>
          <MenuItem value="">Todos</MenuItem>
          <MenuItem value="overdue">Atrasados</MenuItem>
          <MenuItem value="today">Hoje</MenuItem>
        </TextField>
      </div>

      {view === "board" ? (
        <div className={classes.board}>
          {(board || []).map((stage) => (
            <div key={stage.id} className={`${classes.col} ${over === stage.id ? classes.colOver : ""}`}
              onDragOver={(e) => { e.preventDefault(); if (over !== stage.id) setOver(stage.id); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(null); }}
              onDrop={(e) => onDrop(e, stage)}>
              <div className={classes.colHead}>
                <span className={classes.dot} style={{ background: stage.color }} />
                <span className={classes.colName} title={stage.name}>{stage.name}</span>
                <span className={classes.count}>{stage.count}</span>
              </div>
              <div className={classes.colBody}>
                {stage.leads.map((l) => (
                  <LeadCard key={l.id} lead={l} onOpen={setOpenId} dragging={drag && drag.id === l.id}
                    onDragStart={setDrag} onDragEnd={() => { setDrag(null); setOver(null); }} />
                ))}
                {stage.count === 0 && <div className={classes.empty}>Arraste um lead para cá</div>}
                {stage.count > stage.leads.length && (
                  <div className={classes.more} onClick={() => loadMore(stage)}>Carregar mais ({stage.count - stage.leads.length})</div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Paper variant="outlined" className={classes.tableWrap}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Lead</TableCell><TableCell>Curso</TableCell><TableCell>Etapa</TableCell><TableCell>Origem</TableCell>
                <TableCell>Responsável</TableCell><TableCell align="center">Pontos</TableCell><TableCell>Último contato</TableCell><TableCell>Retorno</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {list.leads.map((l) => (
                <TableRow key={l.id} hover style={{ cursor: "pointer" }} onClick={() => setOpenId(l.id)}>
                  <TableCell><b>{l.name}</b><div style={{ fontSize: 12, opacity: 0.7 }}>{l.phone || l.email}</div></TableCell>
                  <TableCell>{l.course ? l.course.name : "—"}</TableCell>
                  <TableCell><Chip size="small" label={l.stage.name} style={{ background: l.stage.color, color: "#fff" }} /></TableCell>
                  <TableCell><span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><SourceIcon source={l.source} />{l.source}</span></TableCell>
                  <TableCell>{l.owner ? l.owner.name : <i>sem responsável</i>}</TableCell>
                  <TableCell align="center"><ScoreRing value={l.score} size={28} /></TableCell>
                  <TableCell>{ago(l.lastContactAt || l.createdAt)}</TableCell>
                  <TableCell style={{ color: isOverdue(l.nextFollowUpAt) ? "#dc2626" : undefined }}>{l.nextFollowUpAt ? format(parseISO(l.nextFollowUpAt), "dd/MM HH:mm") : "—"}</TableCell>
                </TableRow>
              ))}
              {list.leads.length === 0 && (<TableRow><TableCell colSpan={8}><Typography align="center" color="textSecondary" style={{ padding: 24 }}>Nenhum lead encontrado.</Typography></TableCell></TableRow>)}
            </TableBody>
          </Table>
        </Paper>
      )}
    </MainContainer>
  );
};

export default Board;
