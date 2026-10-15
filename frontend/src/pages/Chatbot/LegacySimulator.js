import React, { useEffect, useRef, useState } from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Typography, makeStyles } from "@material-ui/core";
import { Send, RotateCcw } from "lucide-react";

const useStyles = makeStyles((theme) => ({
  chat: { borderRadius: 14, padding: theme.spacing(1.5), height: 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, background: theme.palette.type === "dark" ? "#0b141a" : "#efeae2", ...theme.scrollbarStyles },
  me: { alignSelf: "flex-end", maxWidth: "80%", padding: "6px 10px", borderRadius: "10px 10px 2px 10px", background: theme.palette.type === "dark" ? "#005c4b" : "#d9fdd3", fontSize: 14, whiteSpace: "pre-wrap" },
  bot: { alignSelf: "flex-start", maxWidth: "80%", padding: "6px 10px", borderRadius: "10px 10px 10px 2px", background: theme.palette.type === "dark" ? "#202c33" : "#fff", fontSize: 14, whiteSpace: "pre-wrap" },
  sys: { alignSelf: "center", fontSize: 12, color: theme.palette.text.secondary, background: theme.palette.action.hover, borderRadius: 999, padding: "2px 10px", textAlign: "center" },
  row: { display: "flex", gap: theme.spacing(1), marginTop: theme.spacing(1.25) },
}));

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// Walks the same decisions the bot makes, without sending anything: actions that change records are only described.
const Simulator = ({ open, onClose, nodes, queues, polos, greeting }) => {
  const classes = useStyles();
  const [log, setLog] = useState([]);
  const [text, setText] = useState("");
  const [at, setAt] = useState(null); // null = not started, 0 = root, node id = waiting there, -1 = finished
  const end = useRef();

  const kids = (parentId) => nodes.filter((n) => (n.parentId || null) === (parentId || null)).sort((a, b) => a.position - b.position || a.id - b.id);
  const menu = (intro, list, back) => `${intro ? `${intro}\n\n` : ""}${list.map((n, i) => `${i + 1} - ${n.title}`).join("\n")}${back ? "\n0 - Voltar" : ""}`;

  useEffect(() => { if (end.current) end.current.scrollTop = end.current.scrollHeight; }, [log]);
  useEffect(() => { if (open) reset(); /* eslint-disable-next-line */ }, [open]);

  const reset = () => {
    const roots = kids(null);
    setAt(roots.length ? 0 : -1);
    setLog(roots.length ? [{ k: "bot", t: menu(greeting || "Olá! Como posso ajudar? Escolha uma opção:", roots, false) }] : [{ k: "sys", t: "Nenhuma opção cadastrada neste fluxo." }]);
    setText("");
  };

  // returns the new position and the lines to show
  const run = (node) => {
    const out = [];
    const finish = (extra) => { if (extra) out.push({ k: "sys", t: extra }); return -1; };
    const next = () => { const [n] = kids(node.id); if (n) { const r = run(n); out.push(...r.out); return r.at; } return finish("Fim do fluxo."); };
    switch (node.action) {
      case "menu": {
        const c = kids(node.id);
        if (!c.length) { if (node.message) out.push({ k: "bot", t: node.message }); return { at: finish("Fim do fluxo."), out }; }
        out.push({ k: "bot", t: menu(node.message || node.title, c, true) });
        return { at: node.id, out };
      }
      case "queue": if (node.message) out.push({ k: "bot", t: node.message }); return { at: finish(`A conversa vai para a fila “${(queues.find((q) => q.id === node.targetId) || {}).name || "?"}”.`), out };
      case "user": if (node.message) out.push({ k: "bot", t: node.message }); return { at: finish("A conversa vai para um atendente."), out };
      case "close": if (node.message) out.push({ k: "bot", t: node.message }); return { at: finish("O atendimento é encerrado."), out };
      case "ai": if (node.message) out.push({ k: "bot", t: node.message }); return { at: finish("A conversa passa para o agente de IA."), out };
      case "ask": out.push({ k: "bot", t: node.message || node.title }); return { at: node.id, out };
      case "polo": out.push({ k: "bot", t: `${node.message || "Qual polo fica mais perto de você?"}\n\n${polos.map((p, i) => `${i + 1} - ${p.name}${p.city ? ` (${p.city})` : ""}`).join("\n")}` }); return { at: node.id, out };
      case "stage": case "tag": case "webhook": {
        out.push({ k: "sys", t: { stage: "O lead muda de etapa no funil.", tag: "O lead recebe uma etiqueta.", webhook: "O sistema avisa o endereço configurado." }[node.action] });
        if (node.message) out.push({ k: "bot", t: node.message });
        return { at: next(), out };
      }
      default: if (node.message) out.push({ k: "bot", t: node.message }); return { at: finish("Fim do fluxo."), out };
    }
  };

  const send = () => {
    const body = text.trim();
    if (!body || at === -1 || at === null) return;
    const lines = [{ k: "me", t: body }];
    let position = at;
    const cur = at === 0 ? null : nodes.find((n) => n.id === at);
    if (cur && cur.action === "ask") {
      const [n] = kids(cur.id);
      if (n) { const r = run(n); lines.push(...r.out); position = r.at; } else { lines.push({ k: "sys", t: "Fim do fluxo." }); position = -1; }
    } else if (cur && cur.action === "polo") {
      const a = norm(body);
      const p = (/^\d+$/.test(a) ? polos[Number(a) - 1] : null) || polos.find((x) => norm(x.name) === a);
      if (!p) lines.push({ k: "bot", t: "Não encontrei esse polo. Responda com o número de um polo da lista." });
      else { lines.push({ k: "sys", t: `Polo escolhido: ${p.name}. A conversa vai para a equipe comercial dele.` }); const [n] = kids(cur.id); if (n) { const r = run(n); lines.push(...r.out); position = r.at; } else position = -1; }
    } else {
      const options = kids(cur ? cur.id : null);
      const a = norm(body);
      if (a === "0" && cur) {
        const parent = cur.parentId ? nodes.find((n) => n.id === cur.parentId) : null;
        const r = parent ? run(parent) : { at: 0, out: [{ k: "bot", t: menu(greeting || "Olá! Como posso ajudar? Escolha uma opção:", kids(null), false) }] };
        lines.push(...r.out); position = r.at;
      } else {
        const chosen = options[/^\d+$/.test(a) ? Number(a) - 1 : -1] || options.find((n) => norm(n.title) === a) || options.find((n) => (n.keywords || "").split(",").map(norm).filter(Boolean).includes(a));
        if (!chosen) lines.push({ k: "bot", t: `Opção inválida. Escolha uma das opções:\n\n${menu(null, options, !!cur)}` });
        else { const r = run(chosen); lines.push(...r.out); position = r.at; }
      }
    }
    setLog((l) => [...l, ...lines]);
    setAt(position);
    setText("");
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Testar o fluxo</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="textSecondary" style={{ marginBottom: 8 }}>Responda como o cliente. Nada é enviado e nenhum cadastro muda: as ações aparecem só descritas.</Typography>
        <div className={classes.chat} ref={end}>
          {log.map((l, i) => (<div key={i} className={classes[l.k]}>{l.t}</div>))}
        </div>
        <div className={classes.row}>
          <TextField fullWidth size="small" variant="outlined" placeholder={at === -1 ? "O fluxo terminou. Clique em Recomeçar." : "Resposta do cliente"} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} disabled={at === -1} />
          <Button variant="contained" color="primary" onClick={send} disabled={!text.trim() || at === -1} startIcon={<Send size={16} />}>Enviar</Button>
        </div>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={reset} startIcon={<RotateCcw size={16} />}>Recomeçar</Button>
        <Button variant="contained" color="primary" onClick={onClose}>Fechar</Button>
      </DialogActions>
    </Dialog>
  );
};

export default Simulator;
