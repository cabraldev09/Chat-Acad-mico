import React, { useState } from "react";
import { toast } from "react-toastify";
import { Button, Menu, MenuItem } from "@material-ui/core";
import { Heart, UserX, Users } from "lucide-react";

import ConfirmationModal from "../../components/ConfirmationModal";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const TEXT = {
  friend: "amigo ou da família",
  staff: "da equipe da empresa",
};

// "This is not a lead": a friend, a relative or someone of the company who wrote to the system. It leaves the funnel and every
// number (nothing is deleted, and Contatos brings it back). `compact` is the small version for lists.
const NotALead = ({ lead, onDone, compact = false, variant = "outlined" }) => {
  const [anchor, setAnchor] = useState(null);
  const [ask, setAsk] = useState(null);
  const confirm = async () => {
    const relation = ask;
    setAsk(null);
    try {
      await api.post(`/leads/${lead.id}/relation`, { relation });
      toast.success(relation === "friend" ? `${lead.name} saiu do funil: marcado como amigo ou família.` : `${lead.name} saiu do funil: marcado como da equipe.`);
      if (onDone) onDone(relation);
    } catch (err) { toastError(err); }
  };
  return (
    <>
      <Button size="small" variant={variant} startIcon={<UserX size={15} />} onClick={(e) => setAnchor(e.currentTarget)} aria-haspopup="menu"
        title="Não é um possível aluno: sai do funil e das estatísticas">
        {compact ? "Não é lead" : "Não é um lead"}
      </Button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} getContentAnchorEl={null} anchorOrigin={{ vertical: "bottom", horizontal: "left" }}>
        <MenuItem onClick={() => { setAnchor(null); setAsk("friend"); }}><Heart size={15} style={{ marginRight: 10 }} /> É amigo ou família</MenuItem>
        <MenuItem onClick={() => { setAnchor(null); setAsk("staff"); }}><Users size={15} style={{ marginRight: 10 }} /> É da equipe da empresa</MenuItem>
      </Menu>
      <ConfirmationModal title="Tirar do funil?" open={!!ask} onClose={() => setAsk(null)} onConfirm={confirm}>
        {ask ? `${lead.name} é ${TEXT[ask]}? Ele sai do funil e das estatísticas, e não vira lead de novo quando escrever. A conversa continua normal. Dá para desfazer em Contatos.` : ""}
      </ConfirmationModal>
    </>
  );
};

export default NotALead;
