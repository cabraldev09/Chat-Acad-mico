import React, { useContext, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { isManager } from "../../utils/access";
import { Button, Paper, Tab, Tabs, TextField } from "@material-ui/core";
import { useLocation, useHistory } from "react-router-dom";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import { AuthContext } from "../../context/Auth/AuthContext";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import AffiliatesTab from "./AffiliatesTab";
import MaterialsTab from "./MaterialsTab";
import CampaignsTab from "./CampaignsTab";
import BonusesTab from "./BonusesTab";
import RulesTab from "./RulesTab";
import { useStyles } from "./shared";

// the WhatsApp the person's affiliates see as "support": each person sets their own
const SupportPhone = () => {
  const [phone, setPhone] = useState(null);
  const [value, setValue] = useState("");
  useEffect(() => { api.get("/me/phone").then(({ data }) => setPhone(data.phone || "")).catch(() => setPhone("")); }, []);
  if (phone === null) return null;
  const save = async () => {
    try {
      const { data } = await api.put("/me/phone", { phone: value });
      setPhone(data.phone || "");
      setValue("");
      toast.success("Pronto: seus afiliados passam a ver este WhatsApp como suporte.");
    } catch (e) { toastError(e); }
  };
  return (
    <Paper variant="outlined" style={{ padding: 12, marginBottom: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 240, fontSize: 14 }}>
        <b>Seu WhatsApp de suporte para os afiliados</b>
        <div style={{ opacity: 0.75, fontSize: 13 }}>{phone ? `Atual: +${phone}. É o botão “Falar com o suporte” da Central.` : "Ainda não informado: o botão de suporte da Central usa o número geral, se houver."}</div>
      </div>
      <TextField size="small" variant="outlined" placeholder="(69) 99999-0000" value={value} onChange={(e) => setValue(e.target.value)} />
      <Button variant="contained" color="primary" onClick={save} disabled={value.replace(/\D/g, "").length < 10}>Salvar</Button>
    </Paper>
  );
};

const Affiliates = () => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);
  const location = useLocation();
  const history = useHistory();
  const isAdmin = isManager(user);
  const tabs = [
    ["afiliados", "Afiliados", AffiliatesTab],
    ["materiais", "Materiais de apoio", MaterialsTab],
    ["campanhas", "Campanhas", CampaignsTab],
    ["bonificacoes", "Bonificações", BonusesTab],
    ...(isAdmin ? [["regras", "Regras", RulesTab]] : []),
  ];
  const wanted = tabs.findIndex(([k]) => k === new URLSearchParams(location.search).get("aba"));
  const [tab, setTab] = useState(wanted >= 0 ? wanted : 0);
  const Current = tabs[tab][2];

  return (
    <MainContainer>
      <MainHeader><Title>Afiliados</Title></MainHeader>
      <SupportPhone />
      <Paper variant="outlined" style={{ marginBottom: 12 }}>
        <Tabs value={tab} onChange={(e, v) => { setTab(v); history.replace(`/afiliados?aba=${tabs[v][0]}`); }} variant="scrollable" scrollButtons="auto" indicatorColor="primary" textColor="primary">
          {tabs.map(([k, l]) => <Tab key={k} label={l} />)}
        </Tabs>
      </Paper>
      <div className={`${classes.page} page-enter`} key={tabs[tab][0]}>
        <Current />
      </div>
    </MainContainer>
  );
};

export default Affiliates;
