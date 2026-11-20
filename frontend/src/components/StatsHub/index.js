import React, { useContext, useEffect, useRef } from "react";
import { useHistory, useLocation } from "react-router-dom";
import { Briefcase, GraduationCap } from "lucide-react";

import { AuthContext } from "../../context/Auth/AuthContext";
import { isManager } from "../../utils/access";

// The statistics hub: one place with the two departments (Comercial and Tutoria). Each page of the hub shows this bar on top,
// so the manager moves between the commercial management, the reports and the tutoring numbers without going back to the menu.
export const hubSections = (user) => {
  const manager = isManager(user);
  return [
    { dept: "Comercial", icon: Briefcase, items: [
      manager && { to: "/gestao-comercial", label: "Gestão comercial" },
      manager && { to: "/crm/matriculas", label: "Matrículas realizadas" },
      { to: "/reports", label: manager ? "Atendimento e canais" : "Meus números" },
    ].filter(Boolean) },
    manager && { dept: "Tutoria", icon: GraduationCap, items: [{ to: "/estatisticas/tutoria", label: "Desempenho da tutoria" }] },
  ].filter(Boolean);
};

export const hubHome = (user) => (isManager(user) ? "/gestao-comercial" : "/reports");

const StatsHubBar = () => {
  const { user } = useContext(AuthContext);
  const history = useHistory();
  const { pathname } = useLocation();
  const sections = hubSections(user);
  const bar = useRef(null);
  // on the phone the bar slides: the current tab is brought into view
  useEffect(() => {
    const on = bar.current && bar.current.querySelector(".stats-hub__item.is-on");
    if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);
  if (sections.reduce((n, s) => n + s.items.length, 0) < 2) return null;
  return (
    <nav aria-label="Estatísticas" className="stats-hub" ref={bar}>
      <span className="stats-hub__title">Estatísticas</span>
      {sections.map(({ dept, icon: Icon, items }) => {
        const on = items.some((i) => pathname === i.to);
        return (
          <div key={dept} className={`stats-hub__dept${on ? " is-on" : ""}`}>
            <span className="stats-hub__label"><Icon size={15} /> {dept}</span>
            {items.map((i) => (
              <button key={i.to} type="button" aria-current={pathname === i.to ? "page" : undefined} className={`stats-hub__item${pathname === i.to ? " is-on" : ""}`} onClick={() => history.push(i.to)}>{i.label}</button>
            ))}
          </div>
        );
      })}
    </nav>
  );
};

export default StatsHubBar;
