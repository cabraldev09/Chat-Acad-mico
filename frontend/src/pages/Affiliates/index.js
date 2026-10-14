import React, { useContext, useState } from "react";
import { isManager } from "../../utils/access";
import { Paper, Tab, Tabs } from "@material-ui/core";
import { useLocation, useHistory } from "react-router-dom";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import { AuthContext } from "../../context/Auth/AuthContext";
import AffiliatesTab from "./AffiliatesTab";
import MaterialsTab from "./MaterialsTab";
import CampaignsTab from "./CampaignsTab";
import BonusesTab from "./BonusesTab";
import RulesTab from "./RulesTab";
import { useStyles } from "./shared";

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
