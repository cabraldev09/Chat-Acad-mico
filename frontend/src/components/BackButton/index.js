import React, { useContext } from "react";
import { useHistory, useLocation } from "react-router-dom";
import { IconButton, Tooltip } from "@material-ui/core";
import { ArrowLeft } from "lucide-react";

import { AuthContext } from "../../context/Auth/AuthContext";
import { isManager } from "../../utils/access";

// Pages that sit one level below another (the setup screens under Configurações, the flow editor under its list):
// they get a way back. The main screens of the menu do not need one.
const CHILD_PAGES = [
  "/connections", "/quickAnswers", "/users", "/polos", "/queues", "/tags", "/chatbot", "/chatbot-antigo", "/ai-agents", "/monitor",
  "/crm/config", "/settings", "/integrations",
];

const BackButton = () => {
  const history = useHistory();
  const { pathname } = useLocation();
  const { user } = useContext(AuthContext);
  const child = CHILD_PAGES.some((p) => pathname.toLowerCase() === p.toLowerCase() || pathname.toLowerCase().startsWith(`${p.toLowerCase()}/`));
  if (!child) return null;
  // opened by a link or a bookmark there is nothing behind: go to the parent screen
  const back = () => (history.length > 1 ? history.goBack() : history.push(user && isManager(user) ? "/configuracoes" : "/tickets"));
  return (
    <Tooltip title="Voltar">
      <IconButton size="small" onClick={back} aria-label="Voltar para a página anterior" style={{ marginRight: 8 }}>
        <ArrowLeft size={20} />
      </IconButton>
    </Tooltip>
  );
};

export default BackButton;
