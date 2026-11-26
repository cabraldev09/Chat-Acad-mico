import React from "react";
import { useHistory } from "react-router-dom";

import StandaloneProposals from "./StandaloneProposals";
import { useCrmOptions } from "./shared";

// CRM → Propostas: the proposals of a scholarship for someone who is not a lead of yours (a colleague's lead, a simulation). The same list
// and studio of "Proposta avulsa" in the funnel, reached from the menu.
const Proposals = () => {
  const ctx = useCrmOptions();
  const history = useHistory();
  return <StandaloneProposals open onClose={() => history.push("/crm")} ctx={ctx} />;
};

export default Proposals;
