import React, { useContext, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { isManager } from "../../utils/access";
import { Button, Paper, TextField } from "@material-ui/core";
import { useLocation, useHistory } from "react-router-dom";

import MainContainer from "../../components/MainContainer";
import { AuthContext } from "../../context/Auth/AuthContext";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import AffiliatesTab from "./AffiliatesTab";
import MaterialsTab from "./MaterialsTab";
import CampaignsTab from "./CampaignsTab";
import BonusesTab from "./BonusesTab";
import RulesTab from "./RulesTab";
import { useStyles } from "./shared";
import { PageHeader, Segmented } from "../../components/ui";

// the WhatsApp the person's affiliates see as "support": each person sets their own
import SectionBoundary from "../../components/SectionBoundary";

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
    <Paper variant="outlined" className="ui-card" style={{ padding: 14, marginBottom: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
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
  // the list of tabs can shrink (a change of role while the screen is open): an index beyond it falls back to the first
  const current = tabs[tab] || tabs[0];
  const Current = current[2];

  return (
    <MainContainer>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingBottom: 24 }}>
      <PageHeader title="Afiliados" subtitle="Quem indica, o que cada um trouxe e quanto há para pagar. Acompanhe os afiliados, os materiais, as campanhas e as bonificações num só lugar." />
      <SupportPhone />
      <div style={{ marginBottom: 18, overflowX: "auto" }}>
        <Segmented label="Seções de afiliados" items={tabs.map(([k, l]) => [k, l])} value={current[0]} onChange={(k) => { const i = tabs.findIndex(([x]) => x === k); setTab(i); history.replace(`/afiliados?aba=${k}`); }} />
      </div>
      <div className={`${classes.page} page-enter`} key={current[0]}>
        <SectionBoundary name={current[0]} resetKey={tab}><Current /></SectionBoundary>
      </div>
      </div>
    </MainContainer>
  );
};

export default Affiliates;
