import React, { useRef, useState, useEffect } from "react";
import { Button, TextField, Typography, makeStyles } from "@material-ui/core";
import { Send, RotateCcw, GraduationCap } from "lucide-react";
import { toast } from "react-toastify";

import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => ({
  chat: { borderRadius: 14, padding: theme.spacing(1.5), height: 340, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, background: theme.palette.type === "dark" ? "#0b141a" : "#efeae2", ...theme.scrollbarStyles },
  me: { alignSelf: "flex-end", maxWidth: "80%", padding: "6px 10px", borderRadius: "10px 10px 2px 10px", background: theme.palette.type === "dark" ? "#005c4b" : "#d9fdd3", fontSize: 14, whiteSpace: "pre-wrap" },
  bot: { alignSelf: "flex-start", maxWidth: "80%", padding: "6px 10px", borderRadius: "10px 10px 10px 2px", background: theme.palette.type === "dark" ? "#202c33" : "#fff", fontSize: 14, whiteSpace: "pre-wrap" },
  meta: { alignSelf: "flex-start", fontSize: 11.5, color: theme.palette.text.secondary, margin: "0 4px" },
  row: { display: "flex", gap: theme.spacing(1), marginTop: theme.spacing(1.25), alignItems: "flex-start" },
}));

const TOOL = { buscar_curso: "consultou o catálogo de cursos", listar_polos: "consultou os polos", simular_bolsa: "simulou a bolsa", salvar_lead: "guardou dados do aluno" };

// Talks to the agent exactly like a student would, without sending anything on WhatsApp or changing any record.
const TestTab = ({ agentId }) => {
  const classes = useStyles();
  const [turns, setTurns] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [collected, setCollected] = useState({});
  const end = useRef();
  const [teaching, setTeaching] = useState(null);
  const [lesson, setLesson] = useState("");
  const teach = async (t) => {
    try {
      await api.post(`/ai-agents/${agentId}/learnings`, { question: t.question, answer: lesson });
      toast.success("Pronto: o agente vai usar essa resposta.");
      setTeaching(null);
    } catch (err) { toastError(err); }
  };
  useEffect(() => { if (end.current) end.current.scrollTop = end.current.scrollHeight; }, [turns, busy]);

  const send = async () => {
    const content = text.trim();
    if (!content || busy) return;
    const next = [...turns, { role: "user", content }];
    setTurns(next);
    setText("");
    setBusy(true);
    try {
      const { data } = await api.post(`/ai-agents/${agentId}/test`, { messages: next.map(({ role, content: c }) => ({ role, content: c })), collected });
      setCollected(data.collected || {});
      setTurns([...next, { role: "assistant", content: data.text || "(sem resposta)", question: content, sources: data.sources || [], meta: `${(data.tools || []).map((t) => TOOL[t] || t).join(", ")}${data.tools?.length ? " · " : ""}${data.tokens.input + data.tokens.output} tokens` }]);
    } catch (err) {
      toastError(err);
      setTurns(turns);
      setText(content);
    }
    setBusy(false);
  };

  return (
    <div>
      <Typography variant="body2" color="textSecondary" style={{ marginBottom: 8 }}>
        Converse como se fosse um aluno. Nada é enviado por WhatsApp e nenhum cadastro é alterado. O uso entra no consumo, mas não conta no limite diário.
      </Typography>
      <div className={classes.chat} ref={end}>
        {turns.length === 0 && <span className={classes.meta}>Escreva a primeira mensagem do aluno, por exemplo: “Quero saber o valor do curso de Direito”.</span>}
        {turns.map((t, i) => (
          <React.Fragment key={i}>
            <div className={t.role === "user" ? classes.me : classes.bot}>{t.content}</div>
            {t.meta && <span className={classes.meta}>{t.meta}{t.sources && t.sources.length ? ` · baseado em: ${t.sources.join(", ")}` : ""}</span>}
            {t.role === "assistant" && (
              teaching === i ? (
                <div style={{ alignSelf: "stretch", display: "flex", gap: 6 }}>
                  <TextField fullWidth multiline rows={2} size="small" variant="outlined" placeholder="Escreva a resposta certa" value={lesson} onChange={(e) => setLesson(e.target.value)} style={{ background: "rgba(255,255,255,.6)", borderRadius: 4 }} />
                  <Button variant="contained" color="primary" size="small" disabled={!lesson.trim()} onClick={() => teach(t)}>Ensinar</Button>
                  <Button size="small" onClick={() => setTeaching(null)}>Cancelar</Button>
                </div>
              ) : (
                <Button size="small" style={{ alignSelf: "flex-start", textTransform: "none" }} startIcon={<GraduationCap size={14} />} onClick={() => { setTeaching(i); setLesson(""); }}>Corrigir esta resposta</Button>
              )
            )}
          </React.Fragment>
        ))}
        {busy && <span className={classes.meta}>digitando…</span>}
      </div>
      {Object.keys(collected).length > 0 && (
        <Typography variant="caption" color="textSecondary" display="block" style={{ marginTop: 6 }}>
          Dados que o agente já guardou: {Object.entries(collected).map(([k, v]) => `${k}: ${v}`).join(" · ")}
        </Typography>
      )}
      <div className={classes.row}>
        <TextField fullWidth variant="outlined" size="small" placeholder="Mensagem do aluno" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} disabled={busy} />
        <Button variant="contained" color="primary" onClick={send} disabled={busy || !text.trim()} startIcon={<Send size={16} />}>Enviar</Button>
        <Button variant="outlined" onClick={() => { setTurns([]); setCollected({}); }} startIcon={<RotateCcw size={16} />}>Recomeçar</Button>
      </div>
    </div>
  );
};

export default TestTab;
