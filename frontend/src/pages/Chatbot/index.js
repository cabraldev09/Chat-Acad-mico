import React, { useCallback, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Menu, MenuItem, TextField, Tooltip, makeStyles } from "@material-ui/core";
import { AlertTriangle, Copy, FileInput, History, MoreVertical, Plus, Sparkles, Trash2, Workflow } from "lucide-react";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import ConfirmationModal from "../../components/ConfirmationModal";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import Triggers from "./Triggers";

const useStyles = makeStyles((theme) => ({
  body: { flex: 1, overflowY: "auto", overflowX: "hidden", ...theme.scrollbarStyles, paddingBottom: theme.spacing(3) },
  tabs: { display: "inline-flex", gap: 4, padding: 4, borderRadius: 14, background: theme.palette.action.hover, marginBottom: theme.spacing(2) },
  tab: { border: 0, background: "transparent", color: theme.palette.text.secondary, borderRadius: 10, padding: "7px 16px", cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 600 },
  tabOn: { background: theme.palette.cards.background, color: theme.palette.text.primary, boxShadow: "0 1px 4px rgba(11,66,121,.16)" },
  intro: { color: theme.palette.text.secondary, fontSize: 14, maxWidth: 760, marginBottom: theme.spacing(2) },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: theme.spacing(1.5) },
  card: { background: theme.palette.cards.background, border: theme.border.divider, borderRadius: 16, padding: theme.spacing(2), cursor: "pointer", transition: "transform .15s, box-shadow .15s, border-color .15s", "&:hover": { transform: "translateY(-2px)", boxShadow: "0 8px 22px rgba(11,66,121,.14)", borderColor: theme.palette.primary.main } },
  chip: { display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 999, padding: "2px 9px", fontSize: 12, fontWeight: 700 },
  nums: { display: "flex", gap: 18, marginTop: 14, paddingTop: 12, borderTop: theme.border.divider },
  num: { fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1, fontVariantNumeric: "tabular-nums" },
  hint: { fontSize: 12.5, color: theme.palette.text.secondary },
  empty: { textAlign: "center", color: theme.palette.text.secondary, padding: theme.spacing(6, 2), border: `1px dashed ${theme.palette.divider}`, borderRadius: 16 },
  choice: { display: "flex", gap: 12, alignItems: "flex-start", padding: 12, borderRadius: 12, border: theme.border.divider, cursor: "pointer", marginBottom: 8, "&:hover": { borderColor: theme.palette.primary.main }, "&[data-on=true]": { borderColor: theme.palette.primary.main, background: "rgba(6,147,227,.08)" } },
}));

const ENTRY = { first_message: "Primeira mensagem", keyword: "Palavra-chave", any: "Qualquer primeira mensagem", manual: "Só por gatilho" };
const EXAMPLES = [
  "Pergunte se a pessoa quer conhecer os cursos, falar do financeiro ou já é aluno. Para quem quer conhecer, peça nome, curso e cidade e envie ao CRM com um consultor.",
  "Se a mensagem chegar fora do horário, avise, peça o nome e deixe o contato no CRM para o primeiro horário.",
  "Quando a pessoa escrever “bolsa”, pergunte o curso, a modalidade (EAD, semipresencial ou presencial) e envie ao CRM.",
];

const NewFlow = ({ open, onClose, onCreated }) => {
  const classes = useStyles();
  const [mode, setMode] = useState("blank");
  const [name, setName] = useState("");
  const [templates, setTemplates] = useState([]);
  const [template, setTemplate] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setMode("blank"); setName(""); setDescription(""); setTemplate("");
    api.get("/flow-templates").then(({ data }) => { setTemplates(data); setTemplate(data[0] ? data[0].key : ""); }).catch(() => undefined);
  }, [open]);

  const create = async () => {
    setBusy(true);
    try {
      let data;
      if (mode === "ai") ({ data } = await api.post("/flows/generate", { description, name: name || undefined }));
      else ({ data } = await api.post("/flows", { name: name || (mode === "template" ? (templates.find((t) => t.key === template) || {}).name : "Novo fluxo"), template: mode === "template" ? template : undefined }));
      onCreated(data);
    } catch (e) { toastError(e); }
    setBusy(false);
  };
  const choice = (key, icon, title, text) => (
    <div className={classes.choice} data-on={mode === key} onClick={() => setMode(key)} role="button" tabIndex={0}>
      <span style={{ marginTop: 2 }}>{icon}</span><span><b style={{ fontSize: 14 }}>{title}</b><div className={classes.hint}>{text}</div></span>
    </div>
  );
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Novo fluxo</DialogTitle>
      <DialogContent>
        {choice("ai", <Sparkles size={20} color="#db2777" />, "Descrever e a IA cria", "Conte como o atendimento deve ser. A IA desenha os botões, as perguntas e o envio ao CRM, e você confere no quadro antes de publicar.")}
        {mode === "ai" && (
          <div style={{ marginBottom: 12 }}>
            <TextField fullWidth multiline rows={4} variant="outlined" size="small" label="Como deve ser o atendimento?" value={description} onChange={(e) => setDescription(e.target.value)} InputLabelProps={{ shrink: true }} />
            <div className={classes.hint} style={{ margin: "6px 0 4px" }}>Exemplos (clique para usar):</div>
            {EXAMPLES.map((x) => <div key={x} role="button" tabIndex={0} onClick={() => setDescription(x)} style={{ fontSize: 12.5, padding: "5px 8px", borderRadius: 8, border: "1px solid rgba(127,140,160,.3)", marginBottom: 4, cursor: "pointer" }}>{x}</div>)}
          </div>
        )}
        {choice("template", <Workflow size={20} color="#0693E3" />, "Começar de um modelo", "Boas-vindas com qualificação, fora do horário ou interesse em bolsa. Tudo editável.")}
        {mode === "template" && (
          <TextField select fullWidth variant="outlined" size="small" label="Modelo" value={template} onChange={(e) => setTemplate(e.target.value)} InputLabelProps={{ shrink: true }} style={{ marginBottom: 12 }}>
            {templates.map((t) => <MenuItem key={t.key} value={t.key}>{t.name}</MenuItem>)}
          </TextField>
        )}
        {choice("blank", <Plus size={20} />, "Em branco", "Só o bloco de início: você monta o resto no quadro.")}
        <TextField fullWidth variant="outlined" size="small" label="Nome do fluxo (opcional)" value={name} onChange={(e) => setName(e.target.value)} InputLabelProps={{ shrink: true }} style={{ marginTop: 8 }} />
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="contained" color="primary" onClick={create} disabled={busy || (mode === "ai" && description.trim().length < 10)}>{busy ? "Criando..." : mode === "ai" ? "Criar com IA" : "Criar"}</Button>
      </DialogActions>
    </Dialog>
  );
};

const Chatbot = () => {
  const classes = useStyles();
  const history = useHistory();
  const [tab, setTab] = useState("fluxos");
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(null);
  const [del, setDel] = useState(null);

  const load = useCallback(() => api.get("/flows").then(({ data }) => setRows(data)).catch((e) => { toastError(e); setRows([]); }), []);
  useEffect(() => { load(); }, [load]);

  const importLegacy = async () => {
    try {
      const { data } = await api.post("/flows/import-legacy", {});
      toast.success("Menu atual importado como rascunho. Veja no quadro antes de publicar.");
      history.push(`/chatbot/${data.id}`);
    } catch (e) { toastError(e); }
  };
  const duplicate = async (f) => { setMenu(null); try { await api.post(`/flows/${f.id}/duplicate`); toast.success("Fluxo duplicado."); load(); } catch (e) { toastError(e); } };
  const remove = async () => { try { await api.delete(`/flows/${del.id}`); toast.success("Fluxo excluído."); setDel(null); load(); } catch (e) { toastError(e); } };

  return (
    <MainContainer>
      <MainHeader>
        <Title>Chatbot e fluxos</Title>
        <MainHeaderButtonsWrapper>
          <Button variant="outlined" startIcon={<History size={16} />} onClick={() => history.push("/chatbot-antigo")}>Menu antigo</Button>
          <Button variant="outlined" startIcon={<FileInput size={16} />} onClick={importLegacy}>Importar o menu atual</Button>
          <Button variant="contained" color="primary" startIcon={<Plus size={16} />} onClick={() => setOpen(true)}>Novo fluxo</Button>
        </MainHeaderButtonsWrapper>
      </MainHeader>
      <div className={classes.body}>
        <div className={classes.tabs} role="tablist">
          <button type="button" role="tab" aria-selected={tab === "fluxos"} className={`${classes.tab} ${tab === "fluxos" ? classes.tabOn : ""}`} onClick={() => setTab("fluxos")}>Fluxos</button>
          <button type="button" role="tab" aria-selected={tab === "gatilhos"} className={`${classes.tab} ${tab === "gatilhos" ? classes.tabOn : ""}`} onClick={() => setTab("gatilhos")}>Gatilhos</button>
        </div>

        {tab === "gatilhos" && <Triggers flows={rows || []} />}

        {tab === "fluxos" && (
          <>
            <div className={classes.intro}>Desenhe o atendimento arrastando blocos: mensagens, perguntas com botões, condições e o envio ao CRM. Veja e teste tudo no quadro antes de publicar. Um fluxo publicado atende primeiro; se nenhum valer, o menu antigo e o agente de IA seguem como antes.</div>
            {!rows && <CircularProgress size={24} />}
            {rows && rows.length === 0 && (
              <div className={classes.empty}>
                <Workflow size={36} style={{ opacity: 0.6 }} />
                <div style={{ fontWeight: 700, margin: "8px 0 4px" }}>Nenhum fluxo ainda</div>
                <div style={{ marginBottom: 12 }}>Crie o primeiro descrevendo o atendimento para a IA, ou comece de um modelo.</div>
                <Button variant="contained" color="primary" startIcon={<Sparkles size={16} />} onClick={() => setOpen(true)}>Criar o primeiro fluxo</Button>
              </div>
            )}
            <div className={classes.grid}>
              {(rows || []).map((f) => (
                <div key={f.id} className={classes.card} role="button" tabIndex={0} onClick={() => history.push(`/chatbot/${f.id}`)} onKeyDown={(e) => { if (e.key === "Enter") history.push(`/chatbot/${f.id}`); }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                      <div className={classes.hint}>{ENTRY[f.entry.type]}{f.entry.type === "keyword" && f.entry.keywords.length ? `: ${f.entry.keywords.join(", ")}` : ""} · {f.blocks} blocos</div>
                    </div>
                    <IconButton size="small" aria-label="Mais ações" onClick={(e) => { e.stopPropagation(); setMenu({ anchor: e.currentTarget, flow: f }); }}><MoreVertical size={17} /></IconButton>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                    <span className={classes.chip} style={{ background: f.status === "published" ? "rgba(22,163,74,.16)" : "rgba(100,116,139,.18)", color: f.status === "published" ? "#15803d" : "#475569" }}>{f.status === "published" ? `Publicado v${f.version}` : "Rascunho"}</span>
                    {f.status === "published" && f.changed && <span className={classes.chip} style={{ background: "rgba(217,119,6,.16)", color: "#b45309" }}>Alterações não publicadas</span>}
                    {f.errors > 0 && <Tooltip title="Corrija antes de publicar"><span className={classes.chip} style={{ background: "rgba(220,38,38,.14)", color: "#b91c1c" }}><AlertTriangle size={12} /> {f.errors} {f.errors === 1 ? "erro" : "erros"}</span></Tooltip>}
                  </div>
                  <div className={classes.nums}>
                    <div><div className={classes.num}>{f.stats.started}</div><div className={classes.hint}>começaram</div></div>
                    <div><div className={classes.num}>{f.stats.crm}</div><div className={classes.hint}>foram ao CRM</div></div>
                    <div><div className={classes.num}>{f.stats.waiting}</div><div className={classes.hint}>em andamento</div></div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <Menu anchorEl={menu && menu.anchor} open={!!menu} onClose={() => setMenu(null)}>
        <MenuItem onClick={() => { const f = menu.flow; setMenu(null); history.push(`/chatbot/${f.id}`); }}>Editar</MenuItem>
        <MenuItem onClick={() => duplicate(menu.flow)}><Copy size={15} style={{ marginRight: 8 }} />Duplicar</MenuItem>
        <MenuItem onClick={() => { setDel(menu.flow); setMenu(null); }}><Trash2 size={15} style={{ marginRight: 8 }} />Excluir</MenuItem>
      </Menu>
      <ConfirmationModal open={!!del} onClose={() => setDel(null)} title={`Excluir “${del ? del.name : ""}”?`} onConfirm={remove}>
        As conversas que estão dentro dele passam para o menu antigo ou para o agente de IA. Isso não pode ser desfeito.
      </ConfirmationModal>
      <NewFlow open={open} onClose={() => setOpen(false)} onCreated={(f) => { setOpen(false); history.push(`/chatbot/${f.id}`); }} />
    </MainContainer>
  );
};

export default Chatbot;
