import React, { useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { Button, Checkbox, FormControlLabel, MenuItem, Switch, TextField, Typography, makeStyles } from "@material-ui/core";
import { ChevronDown, Play, SlidersHorizontal } from "lucide-react";

import WhatsPreview from "./Preview";
import api from "../../services/api";
import toastError from "../../errors/toastError";

// The settings of the retention, one block per thing it does. Each block lives in the tab where the thing happens (the survey in Satisfação,
// the message to who is at risk in Risco de evasão, the re-enrollment in Rematrícula) and in the composer of Envios; "Configurar" keeps only the number.
const useStyles = makeStyles((theme) => {
  const line = theme.palette.type === "dark" ? "rgba(255,255,255,.09)" : "#d5deeb";
  return {
    card: { background: theme.palette.cards.background, border: `1px solid ${line}`, borderRadius: 16, padding: theme.spacing(2.25), marginBottom: theme.spacing(2) },
    hint: { fontSize: 13, color: theme.palette.text.secondary },
    row: { display: "flex", gap: theme.spacing(1.25), flexWrap: "wrap", alignItems: "center" },
    preview: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: theme.spacing(2), alignItems: "start", [theme.breakpoints.down("sm")]: { gridTemplateColumns: "1fr" } },
    adjust: { border: `1px solid ${line}`, borderRadius: 16, marginBottom: theme.spacing(2), background: theme.palette.type === "dark" ? "rgba(6,147,227,.06)" : "#eef4fb", overflow: "hidden" },
    adjustHead: { display: "flex", alignItems: "center", gap: 10, width: "100%", border: 0, background: "transparent", cursor: "pointer", font: "inherit", color: "inherit", padding: theme.spacing(1.5, 2), textAlign: "left", "&:focus-visible": { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: -2 } },
    adjustBody: { padding: theme.spacing(0, 2, 0.5) },
    chev: { marginLeft: "auto", transition: "transform .2s", opacity: 0.6 },
  };
});

const KIND = { onboarding: "Após a ambientação", d30: "30 dias de matrícula", d90: "90 dias de matrícula" };

// the configuration of the retention, loaded once and saved by pieces
export const useRetentionConfig = () => {
  const [c, setC] = useState(null);
  const load = () => api.get("/retention/config").then(({ data }) => setC(data)).catch(toastError);
  useEffect(() => { load(); }, []);
  const save = async (patch, ok = "Salvo.") => {
    try { const { data } = await api.put("/retention/config", patch); setC(data); toast.success(ok); return data; } catch (e) { toastError(e); return null; }
  };
  return { c, setC, save, reload: load };
};

// a panel that opens over the content of a tab: "Ajustar" what happens here, without leaving the screen
export const Adjust = ({ title, hint, children, defaultOpen = false, onSaved }) => {
  const classes = useStyles();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={classes.adjust}>
      <button type="button" className={classes.adjustHead} aria-expanded={open} onClick={() => setOpen((x) => !x)}>
        <SlidersHorizontal size={18} />
        <span><b>{title}</b>{hint && <span className={classes.hint} style={{ display: "block" }}>{hint}</span>}</span>
        <ChevronDown size={18} className={classes.chev} style={{ transform: open ? "rotate(180deg)" : "none" }} />
      </button>
      {open && <div className={classes.adjustBody}>{children}</div>}
    </div>
  );
};

// the blocks: each one takes the loaded configuration and saves its own part
export const RelationshipBlock = ({ c, setC, save, bare }) => {
  const classes = useStyles();
  const history = useHistory();
  const [numbers, setNumbers] = useState([]);
  useEffect(() => {
    api.get("/whatsapp").then(({ data }) => setNumbers((Array.isArray(data) ? data : data.whatsapps || []).filter((w) => ["whatsapp", "whatsapp_cloud"].includes(w.channel)))).catch(() => undefined);
  }, []);
  const rel = c.relationship || {};
  const cloud = rel.channel === "whatsapp_cloud";
  const down = rel.whatsappId && rel.status !== "CONNECTED";
  return (
    <>
      <div className={classes.card} style={down || !rel.whatsappId ? { borderColor: "#d97706" } : undefined}>
      <Typography style={{ fontWeight: 600 }}>Número do relacionamento</Typography>
      <Typography className={classes.hint} gutterBottom>
        A pesquisa de satisfação, a mensagem de retenção, o aviso de rematrícula e os envios da aba Envios saem por este número, o da instituição, separado do número do tutor. As respostas caem na fila Relacionamento.
      </Typography>
      <TextField select size="small" variant="outlined" label="Conexão" value={rel.whatsappId || 0} style={{ minWidth: 280 }}
        onChange={(e) => save({ relationshipWhatsappId: Number(e.target.value) }, "Número do relacionamento salvo.")}>
        <MenuItem value={0}>Nenhum (segue a última conversa do aluno)</MenuItem>
        {numbers.map((w) => <MenuItem key={w.id} value={w.id}>{w.name}{w.channel === "whatsapp_cloud" ? " · API oficial" : " · QR Code"}</MenuItem>)}
      </TextField>
      <Typography className={classes.hint} style={{ marginTop: 8 }}>
        Ainda não tem o número? Conecte o número do mantenedor em <b style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => history.push("/connections")}>Conexões</b> (QR Code ou API oficial) e escolha-o aqui.
      </Typography>
      {!rel.whatsappId && <Typography className={classes.hint} style={{ marginTop: 8, color: "#b45309" }}>Sem número escolhido, as mensagens saem pela conversa mais recente do aluno, que depois da matrícula é a da tutoria. Escolha o número do mantenedor para separar.</Typography>}
      {down && <Typography className={classes.hint} style={{ marginTop: 8, color: "#b91c1c" }}>{rel.status === "MISSING" ? "A conexão escolhida não existe mais." : `A conexão ${rel.name || ""} está desconectada.`} Enquanto isso nada é enviado, para não sair pelo número do tutor. Reconecte em Conexões.</Typography>}
      {rel.whatsappId > 0 && !down && cloud && <Typography className={classes.hint} style={{ marginTop: 8 }}>API oficial: a pesquisa vai com botões dentro de 24 horas depois da última mensagem do aluno. Fora disso, só com modelo aprovado (campo mais abaixo).</Typography>}
      {rel.whatsappId > 0 && !down && !cloud && (
        <Typography className={classes.hint} style={{ marginTop: 8 }}>
          QR Code: sem botões (o aluno digita a nota). {rel.riskMode === "relaxed" ? "Modo flexível: escreve para quem nunca escreveu para este número, por sua conta e risco." : "Modo seguro: só escreve para quem já escreveu para este número. Para pesquisar toda a base, use a API oficial."} Há limite diário de envios para proteger o número.
        </Typography>
      )}
    </div>
    </>
  );
};

export const NpsBlock = ({ c, setC, save, bare }) => {
  const classes = useStyles();
  return (
    <>
      <div className={bare ? undefined : classes.card} style={bare ? { padding: "4px 0 12px" } : undefined}>
      <Typography style={{ fontWeight: 600 }}>Pesquisa de satisfação (NPS)</Typography>
      <Typography className={classes.hint} gutterBottom>Começa desligada. Ligada, o sistema pergunta pelo WhatsApp, de 0 a 10, o quanto o aluno recomendaria a instituição, e guarda a nota e o motivo. Nota de 0 a 6 vira tarefa para o tutor.</Typography>
      <FormControlLabel control={<Switch color="primary" checked={!!c.nps.enabled} onChange={(e) => save({ nps: { enabled: e.target.checked } })} />} label={c.nps.enabled ? "Pesquisa ligada" : "Pesquisa desligada"} />
      <div className={classes.row}>
        {c.npsKinds.map((k) => (
          <FormControlLabel key={k} control={<Checkbox color="primary" checked={c.nps.moments.includes(k)} onChange={(e) => save({ nps: { moments: e.target.checked ? [...c.nps.moments, k] : c.nps.moments.filter((m) => m !== k) } })} />} label={KIND[k]} />
        ))}
      </div>
      <FormControlLabel control={<Switch color="primary" checked={c.nps.buttons !== false} onChange={(e) => save({ nps: { buttons: e.target.checked } })} />}
        label="Botões no WhatsApp (API oficial): o aluno toca em vez de digitar" />
      <div className={classes.preview}>
        <TextField fullWidth multiline rows={3} size="small" variant="outlined" label="Pergunta (use {{nome}})" value={c.nps.question} onChange={(e) => setC({ ...c, nps: { ...c.nps, question: e.target.value } })} onBlur={() => save({ nps: { question: c.nps.question } })} />
        <div>
          <div className={classes.hint} style={{ marginBottom: 6 }}>Como o aluno recebe</div>
          <WhatsPreview text={c.nps.question} buttons={c.nps.buttons !== false ? ["Recomendo (9-10)", "Neutro (7-8)", "Não recomendo (0-6)"] : []}
            note={c.nps.buttons !== false ? "Depois do toque, vem a nota exata (por exemplo 9 ou 10). Quem usa conexão por QR Code responde digitando de 0 a 10." : "O aluno responde digitando a nota de 0 a 10."} />
        </div>
      </div>
      <div className={classes.row} style={{ marginTop: 8 }}>
        <TextField size="small" variant="outlined" label="Modelo aprovado (fora das 24 h da API oficial)" value={c.nps.templateName || ""} onChange={(e) => setC({ ...c, nps: { ...c.nps, templateName: e.target.value } })} onBlur={() => save({ nps: { templateName: c.nps.templateName || "" } })}
          helperText="Opcional. Sem ele, a pesquisa só sai para quem escreveu nas últimas 24 horas." style={{ flex: 1, minWidth: 280 }} />
        <TextField size="small" variant="outlined" label="Idioma do modelo" value={c.nps.templateLanguage || "pt_BR"} onChange={(e) => setC({ ...c, nps: { ...c.nps, templateLanguage: e.target.value } })} onBlur={() => save({ nps: { templateLanguage: c.nps.templateLanguage || "pt_BR" } })} style={{ width: 160 }} />
      </div>
      <Typography className={classes.hint} style={{ marginTop: 6 }}>Crie o modelo no painel da Meta com o texto da pergunta ({"{{1}}"} é o primeiro nome) e três botões de resposta rápida com os mesmos textos acima. Os botões só aparecem na API oficial; conexões por QR Code recebem a pergunta em texto e o aluno digita a nota.</Typography>
      <Typography className={classes.hint} style={{ marginTop: 8 }}>Cada resposta é registrada com a nota e o motivo. Nota de 0 a 6 gera um alerta na hora, uma tarefa para o tutor e a etiqueta “Detrator NPS”.</Typography>
    </div>
    </>
  );
};

export const RiskBlock = ({ c, setC, save, bare }) => {
  const classes = useStyles();
  return (
    <>
      <div className={bare ? undefined : classes.card} style={bare ? { padding: "4px 0 12px" } : undefined}>
      <Typography style={{ fontWeight: 600 }}>Risco de evasão</Typography>
      <Typography className={classes.hint} gutterBottom>Aluno matriculado que não escreve há esse tempo entra em risco.</Typography>
      <div className={classes.row}>
        <TextField size="small" variant="outlined" type="number" label="Dias sem notícias" value={c.risk.days} onChange={(e) => setC({ ...c, risk: { ...c.risk, days: e.target.value } })} onBlur={() => save({ risk: { days: c.risk.days } })} style={{ width: 170 }} />
      </div>
      <div className={classes.preview} style={{ marginTop: 8 }}>
        <TextField fullWidth multiline rows={3} size="small" variant="outlined" label="Mensagem de retenção (use {{nome}})" value={c.risk.message} onChange={(e) => setC({ ...c, risk: { ...c.risk, message: e.target.value } })} onBlur={() => save({ risk: { message: c.risk.message } })} />
        <div><div className={classes.hint} style={{ marginBottom: 6 }}>Como o aluno recebe</div><WhatsPreview text={c.risk.message} /></div>
      </div>
    </div>
    </>
  );
};

export const RematBlock = ({ c, setC, save, bare }) => {
  const classes = useStyles();
  const r = c.rematricula;
  return (
    <>
      <div className={bare ? undefined : classes.card} style={bare ? { padding: "4px 0 12px" } : undefined}>
      <Typography style={{ fontWeight: 600 }}>Rematrícula</Typography>
      <Typography className={classes.hint} gutterBottom>O período a renovar e a janela em que os alunos podem fazer isso. Durante a janela, quem ainda não renovou fica com a etiqueta “Rematrícula pendente” e o tutor recebe uma tarefa.</Typography>
      <div className={classes.row}>
        <TextField size="small" variant="outlined" label="Período (ex.: 2026/2)" value={r.term} onChange={(e) => setC({ ...c, rematricula: { ...r, term: e.target.value } })} onBlur={() => save({ rematricula: { term: r.term } })} style={{ width: 170 }} />
        <TextField size="small" variant="outlined" type="date" label="Abre em" InputLabelProps={{ shrink: true }} value={r.startsAt} onChange={(e) => setC({ ...c, rematricula: { ...r, startsAt: e.target.value } })} onBlur={() => save({ rematricula: { startsAt: r.startsAt } })} style={{ width: 170 }} />
        <TextField size="small" variant="outlined" type="date" label="Fecha em" InputLabelProps={{ shrink: true }} value={r.endsAt} onChange={(e) => setC({ ...c, rematricula: { ...r, endsAt: e.target.value } })} onBlur={() => save({ rematricula: { endsAt: r.endsAt } })} style={{ width: 170 }} />
      </div>
      <FormControlLabel control={<Switch color="primary" checked={!!r.auto} onChange={(e) => save({ rematricula: { auto: e.target.checked } })} />} label="Avisar os alunos por WhatsApp (na abertura, 7 dias antes e na véspera do fim)" />
      {r.auto && (
        <div className={classes.preview}>
          <TextField fullWidth multiline rows={3} size="small" variant="outlined" label="Mensagem (use {{nome}} e {{periodo}})" value={r.message} onChange={(e) => setC({ ...c, rematricula: { ...r, message: e.target.value } })} onBlur={() => save({ rematricula: { message: r.message } })} />
          <div><div className={classes.hint} style={{ marginBottom: 6 }}>Como o aluno recebe</div><WhatsPreview text={r.message} extra={{ periodo: r.term || "2026/2" }} /></div>
        </div>
      )}
    </div>
    </>
  );
};

export const RunNow = () => {
  const classes = useStyles();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { const { data } = await api.post("/retention/run"); toast.success(`Rodado: ${data.nps} pesquisa(s), ${data.risk} aluno(s) em risco novo(s), ${data.rematricula} lembrete(s) de rematrícula.`); } catch (e) { toastError(e); }
    setBusy(false);
  };
  return (
    <div>
      <Button variant="outlined" startIcon={<Play size={15} />} disabled={busy} onClick={run}>Rodar agora</Button>
      <Typography className={classes.hint} style={{ marginTop: 6 }}>O sistema roda sozinho a cada 10 minutos; este botão serve para ver o resultado na hora.</Typography>
    </div>
  );
};
