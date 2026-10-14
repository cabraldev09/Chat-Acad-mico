import React from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, makeStyles } from "@material-ui/core";
import { QUICK_VARIABLES } from "../../utils/quickVars";

const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "");
const MOD = mac ? "⌘" : "Ctrl";
const ALT = mac ? "⌥" : "Alt";

const SHORTCUTS = [
  { keys: `${MOD} + K`, what: "Pesquisar conversas" },
  { keys: `${ALT} + N`, what: "Nova conversa" },
  { keys: `${ALT} + ↓ / ${ALT} + ↑`, what: "Próxima / anterior conversa da lista" },
  { keys: `${ALT} + M`, what: "Ir para o campo de mensagem" },
  { keys: "Esc", what: "Fechar a conversa aberta (ou a lista de respostas rápidas)" },
  { keys: "Enter", what: "Enviar a mensagem" },
  { keys: "Shift + Enter", what: "Quebrar linha sem enviar" },
  { keys: `${MOD} + V`, what: "Colar uma imagem copiada para enviar" },
  { keys: `${MOD} + /`, what: "Abrir esta lista de atalhos" },
];

const useStyles = makeStyles((theme) => ({
  row: { display: "flex", alignItems: "center", gap: theme.spacing(2), padding: theme.spacing(0.75, 0), borderBottom: `1px solid ${theme.palette.divider}` },
  keys: { flex: "none", minWidth: 170, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13, fontWeight: 600, color: theme.palette.primary.main },
  what: { fontSize: 14 },
  h: { fontWeight: 700, margin: theme.spacing(2, 0, 0.5) },
  code: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12.5, background: theme.palette.action.hover, borderRadius: 6, padding: "1px 6px" },
}));

const ShortcutsDialog = ({ open, onClose }) => {
  const classes = useStyles();
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Atalhos do teclado</DialogTitle>
      <DialogContent>
        {SHORTCUTS.map((s) => (
          <div key={s.keys} className={classes.row}>
            <span className={classes.keys}>{s.keys}</span>
            <span className={classes.what}>{s.what}</span>
          </div>
        ))}
        <Typography className={classes.h}>Respostas rápidas</Typography>
        <Typography variant="body2" color="textSecondary">
          Digite <span className={classes.code}>/</span> no campo de mensagem para ver as respostas rápidas, e continue digitando para filtrar. Use as setas, e Enter ou Tab para inserir; Esc fecha a lista. Você pode editar o texto antes de enviar. As respostas são criadas em Respostas Rápidas, no menu.
        </Typography>
        <Typography className={classes.h}>Variáveis que você pode usar no texto</Typography>
        {QUICK_VARIABLES.map((v) => (
          <Typography key={v.token} variant="body2" color="textSecondary">
            <span className={classes.code}>{v.token}</span> {v.help}
          </Typography>
        ))}
      </DialogContent>
      <DialogActions><Button onClick={onClose} color="primary">Fechar</Button></DialogActions>
    </Dialog>
  );
};

export default ShortcutsDialog;
