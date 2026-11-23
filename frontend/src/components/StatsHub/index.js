import React, { useContext, useEffect, useRef } from "react";
import { useHistory, useLocation } from "react-router-dom";
import { Briefcase } from "lucide-react";

import { AuthContext } from "../../context/Auth/AuthContext";
import { isManager } from "../../utils/access";

// The statistics hub: one place with the two departments (Comercial and Tutoria). Each page of the hub shows this bar on top,
// so the manager moves between the commercial management, the reports and the tutoring numbers without going back to the menu.
// One area, one row of tabs: every statistics screen shows the same tabs on top, so the person moves between them as in a single
// screen (each tab keeps its own address, so a link opens the right one). The order goes from the overview to the details.
export const hubSections = (user) => {
  const manager = isManager(user);
  const tutor = !!user && ["tutor", "academico"].includes(user.role);
  const items = manager
    ? [
        { to: "/estatisticas", label: "Visão geral" },
        { to: "/estatisticas?aba=consultores", label: "Consultores" },
        { to: "/estatisticas?aba=polos", label: "Polos e metas" },
        { to: "/estatisticas?aba=treinamento", label: "Treinamento" },
        { to: "/estatisticas/captacao", label: "Captação" },
        { to: "/reports", label: "Atendimento" },
        { to: "/estatisticas/tutoria", label: "Tutoria" },
      ]
    : tutor
    ? [{ to: "/estatisticas/tutoria", label: "Minha tutoria" }]
    : [];
  return [{ dept: "Estatísticas", icon: Briefcase, items }];
};

// the panel of /estatisticas is the home of the hub (each one sees what they may see there); the tutor starts on the tutoring
export const hubHome = (user) => (user && ["tutor", "academico"].includes(user.role) ? "/estatisticas/tutoria" : isManager(user) ? "/estatisticas" : "/meu-desempenho");

const StatsHubBar = () => {
  const { user } = useContext(AuthContext);
  const history = useHistory();
  const { pathname, search } = useLocation();
  const here = `${pathname}${new URLSearchParams(search).get("aba") ? `?aba=${new URLSearchParams(search).get("aba")}` : ""}`;
  const sections = hubSections(user);
  const bar = useRef(null);
  // on the phone the bar slides: the current tab is brought into view
  useEffect(() => {
    const on = bar.current && bar.current.querySelector(".stats-hub__item.is-on");
    if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest", inline: "center" });
  }, [here]);
  if (sections.reduce((n, s) => n + s.items.length, 0) < 2) return null;
  return (
    <nav aria-label="Estatísticas" className="stats-hub" ref={bar}>
      <span className="stats-hub__title">Estatísticas</span>
      {sections.map(({ dept, icon: Icon, items }) => {
        const on = items.some((i) => here === i.to);
        return (
          <div key={dept} className={`stats-hub__dept${on ? " is-on" : ""}`}>
            <span className="stats-hub__label"><Icon size={15} /> {dept}</span>
            {items.map((i) => (
              <button key={i.to} type="button" aria-current={here === i.to ? "page" : undefined} className={`stats-hub__item${here === i.to ? " is-on" : ""}`} onClick={() => history.push(i.to)}>{i.label}</button>
            ))}
          </div>
        );
      })}
    </nav>
  );
};

export default StatsHubBar;
