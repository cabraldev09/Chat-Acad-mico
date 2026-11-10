import React, { useState } from "react";
import { toast } from "react-toastify";
import { IconButton, ListItemText, Menu, MenuItem, Tooltip } from "@material-ui/core";
import { Check, Heart, Users } from "lucide-react";

import api from "../../services/api";
import toastError from "../../errors/toastError";

export const relationOf = (c) => (c && c.isStaff ? "staff" : c && c.isPersonal ? "friend" : "customer");

const OPTIONS = [
  ["customer", "Cliente", "Entra no funil e nas estatísticas."],
  ["friend", "Amigo ou família", "Fica fora do funil e das estatísticas."],
  ["staff", "Equipe da empresa", "Fica fora do funil e das estatísticas."],
];

// Who this contact is for the company. A friend or someone of the team never counts in the CRM or in the numbers.
const RelationMenu = ({ contact, onChanged }) => {
  const [anchor, setAnchor] = useState(null);
  const current = relationOf(contact);
  const choose = async (relation) => {
    setAnchor(null);
    if (relation === current) return;
    try {
      await api.put(`/contacts/${contact.id}/relation`, { relation });
      toast.success(relation === "customer" ? "Voltou a ser tratado como cliente." : relation === "friend" ? "Marcado como amigo ou família: fora do funil e das estatísticas." : "Marcado como da equipe: fora do funil e das estatísticas.");
      if (onChanged) onChanged(relation);
    } catch (err) { toastError(err); }
  };
  return (
    <>
      <Tooltip arrow title="Quem é: cliente, amigo ou da equipe (amigos e equipe ficam fora do funil e das estatísticas)">
        <IconButton size="small" aria-label="Quem é este contato" style={current === "customer" ? undefined : { color: current === "staff" ? "#15803d" : "#be185d" }} onClick={(e) => setAnchor(e.currentTarget)}>
          {current === "friend" ? <Heart size={20} /> : <Users size={20} />}
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} getContentAnchorEl={null} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
        {OPTIONS.map(([value, label, hint]) => (
          <MenuItem key={value} onClick={() => choose(value)} selected={value === current}>
            <ListItemText primary={label} secondary={hint} />
            {value === current && <Check size={16} style={{ marginLeft: 12 }} />}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

export default RelationMenu;
