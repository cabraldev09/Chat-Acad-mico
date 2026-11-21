import React, { useContext, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import clsx from "clsx";

import { makeStyles } from "@material-ui/core/styles";
import ListItem from "@material-ui/core/ListItem";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import ListItemText from "@material-ui/core/ListItemText";
import ListSubheader from "@material-ui/core/ListSubheader";
import Divider from "@material-ui/core/Divider";
import MessagesSquareIcon from "lucide-react/dist/esm/icons/messages-square";
// one icon per entry, never repeated (src/layout/menuIcons.test.js checks it)
import PlugIcon from "lucide-react/dist/esm/icons/plug-2";
import ContactIcon from "lucide-react/dist/esm/icons/contact";
import ZapIcon from "lucide-react/dist/esm/icons/zap";
import CalendarClockIcon from "lucide-react/dist/esm/icons/calendar-clock";
import MegaphoneIcon from "lucide-react/dist/esm/icons/megaphone";
import BarChartIcon from "lucide-react/dist/esm/icons/bar-chart-3";
import GaugeIcon from "lucide-react/dist/esm/icons/gauge";
import LineChartIcon from "lucide-react/dist/esm/icons/line-chart";
import KanbanSquareIcon from "lucide-react/dist/esm/icons/kanban-square";
import LayoutDashboardIcon from "lucide-react/dist/esm/icons/layout-dashboard";
import { canOperateRetention, isManager } from "../utils/access";
import { useMyTasks } from "../components/TaskAlert";
import ListTodoIcon from "lucide-react/dist/esm/icons/list-todo";
import MonitorCheckIcon from "lucide-react/dist/esm/icons/monitor-check";
import UsersRoundIcon from "lucide-react/dist/esm/icons/users";
import HeartPulseIcon from "lucide-react/dist/esm/icons/heart-pulse";
import Share2Icon from "lucide-react/dist/esm/icons/share-2";
import WalletIcon from "lucide-react/dist/esm/icons/wallet";
import GoalIcon from "lucide-react/dist/esm/icons/goal";
import SlidersIcon from "lucide-react/dist/esm/icons/sliders-horizontal";
import GraduationCapIcon from "lucide-react/dist/esm/icons/graduation-cap";
import CoursesIcon from "lucide-react/dist/esm/icons/book-open";
import FileSearchIcon from "lucide-react/dist/esm/icons/file-search";
import LibraryIcon from "lucide-react/dist/esm/icons/library";
import BookOpenCheckIcon from "lucide-react/dist/esm/icons/book-open-check";
import BotIcon from "lucide-react/dist/esm/icons/bot";
import WorkflowIcon from "lucide-react/dist/esm/icons/workflow";

import api from "../services/api";
import openSocket from "../services/socket-io";
import { i18n } from "../translate/i18n";
import { WhatsAppsContext } from "../context/WhatsApp/WhatsAppsContext";
import { AuthContext } from "../context/Auth/AuthContext";

const useStyles = makeStyles((theme) => ({
  navItem: {
    position: "relative",
    gap: theme.spacing(1.25),
    margin: theme.spacing(0.125, 0),
    padding: theme.spacing(0.875, 1.25),
    borderRadius: theme.borderRadius.small,
    // on the navy side menu (layout/index.js): light text, the hover and the current page as before, in white tones
    color: "rgba(255,255,255,.78)",
    transition: "background-color .15s, color .15s",
    "&:hover": {
      backgroundColor: "rgba(255,255,255,.08)",
      color: "#fff",
    },
  },
  navItemCollapsed: {
    position: "relative",
    justifyContent: "center",
    padding: theme.spacing(1, 1),
  },
  // the current page: a lighter band and the light blue of the logo (#4595D8) on the icon
  navItemActive: {
    color: "#fff",
    backgroundColor: "rgba(255,255,255,.14)",
    "&:hover": { backgroundColor: "rgba(255,255,255,.14)" },
    "& $navIcon": {
      color: "#4595D8",
    },
    "& $navText": {
      fontWeight: 500,
    },
  },
  navIcon: {
    minWidth: 0,
    color: "inherit",
    "& svg": { fontSize: 20 },
  },
  navTextRoot: {
    flex: "0 1 auto",
  },
  navText: { fontSize: 14 },
  connectionDot: {
    width: 8,
    height: 8,
    flexShrink: 0,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.palette.error.main,
    boxShadow: `0 0 0 3px ${theme.palette.error.main}33`,
  },
  countBadge: {
    minWidth: 18,
    height: 18,
    padding: "0 5px",
    borderRadius: 9,
    fontSize: 11,
    fontWeight: 700,
    lineHeight: "18px",
    textAlign: "center",
    color: "#111",
    backgroundColor: "#FEF84C",
    flexShrink: 0,
  },
  connectionDotCollapsed: {},
  // with the menu closed the number (or the dot) sits on the corner of the icon: the icons stay in one column, in order
  collapsedAdornment: {
    position: "absolute",
    top: 2,
    right: 2,
    transform: "scale(.82)",
    transformOrigin: "top right",
    pointerEvents: "none",
    display: "flex",
  },
  divider: {
    margin: theme.spacing(1.25, 0.5),
  },
  sectionLabel: {
    ...theme.typography.sectionLabel,
    padding: theme.spacing(0.5, 1.25, 0.75),
    lineHeight: 1.4,
    color: "rgba(255,255,255,.55)",
  },
}));

function ListItemLink(props) {
  const { icon, primary, to, collapsed, adornment, alsoActive } = props;
  const classes = useStyles();

  const renderLink = React.useMemo(
    () =>
      React.forwardRef((itemProps, ref) => (
        <NavLink
          to={to}
          // "/" and "/crm" are the start of other addresses ("/crm/painel"...): only the exact address lights them
          exact={to === "/" || to === "/crm"}
          // a group stays lit while one of its pages is open (Configurações over Conexões, Usuários...)
          isActive={alsoActive ? (match, location) => !!match || alsoActive.some((p) => location.pathname === p || location.pathname.startsWith(`${p}/`)) : undefined}
          activeClassName={classes.navItemActive}
          ref={ref}
          {...itemProps}
        />
      )),
    [to, classes.navItemActive, alsoActive]
  );

  return (
    <li>
      <ListItem
        button
        component={renderLink}
        className={clsx(classes.navItem, collapsed && classes.navItemCollapsed)}
      >
        {icon ? (
          <ListItemIcon className={classes.navIcon}>{icon}</ListItemIcon>
        ) : null}
        {!collapsed && (
          <ListItemText
            primary={primary}
            primaryTypographyProps={{ variant: "body2", noWrap: true, className: classes.navText }}
            classes={{ root: classes.navTextRoot, primary: classes.navText }}
          />
        )}
        {adornment ? collapsed ? <span className={classes.collapsedAdornment}>{adornment}</span> : adornment : null}
      </ListItem>
    </li>
  );
}

const MainListItems = (props) => {
  const { drawerClose, collapsed } = props;
  const classes = useStyles();
  const { whatsApps } = useContext(WhatsAppsContext);
  const { user } = useContext(AuthContext);
  const [connectionWarning, setConnectionWarning] = useState(false);
  const [aiReview, setAiReview] = useState(0);
  const [followUps, setFollowUps] = useState(0);
  const myTasks = useMyTasks();

  // curricular analyses whose 24-hour return is waiting for an answer (mine; the management sees all)
  useEffect(() => {
    if (!user || !user.id) return undefined;
    const load = () => api.get("/analysis/follow-ups").then(({ data }) => setFollowUps(Number(data.total) || 0)).catch(() => {});
    load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, 5 * 60 * 1000);
    window.addEventListener("followups:changed", load);
    const socket = openSocket();
    // the live notice refreshes this counter and any open list (they listen to the same event)
    const live = () => { try { window.dispatchEvent(new Event("followups:changed")); } catch (e) { /* old browser */ } };
    socket.on("followUp", live);
    return () => { clearInterval(timer); window.removeEventListener("followups:changed", load); socket.off("followUp", live); socket.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user && user.id]);

  // answers the team gave that the owner has not reviewed yet
  useEffect(() => {
    if (!isManager(user)) return undefined;
    const load = () => api.get("/ai-learnings/pending").then(({ data }) => setAiReview(data.count)).catch(() => {});
    load();
    const socket = openSocket();
    socket.on("aiLearning", load);
    return () => socket.disconnect();
  }, [user]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (whatsApps.length > 0) {
        const offlineWhats = whatsApps.filter((whats) => {
          // only the numbers this person can reconnect (all for the management, their own for the others)
          if (!isManager(user) && whats.ownerId !== user.id) return false;
          return (
            whats.status === "qrcode" ||
            whats.status === "PAIRING" ||
            whats.status === "DISCONNECTED" ||
            whats.status === "TIMEOUT" ||
            whats.status === "OPENING"
          );
        });
        if (offlineWhats.length > 0) {
          setConnectionWarning(true);
        } else {
          setConnectionWarning(false);
        }
      }
    }, 2000);
    return () => clearTimeout(delayDebounceFn);
  }, [whatsApps, user && user.id]);

  // the same entry for everybody (the managers find it in the group of the automations)
  const connectionsLink = (
    <ListItemLink
      to="/connections"
      primary={i18n.t("mainDrawer.listItems.connections")}
      icon={<PlugIcon className="ico" />}
      collapsed={collapsed}
      adornment={connectionWarning && <span className={clsx(classes.connectionDot, collapsed && classes.connectionDotCollapsed)} title="Há conexão com problema" />}
    />
  );

  // my late tasks (red) or, when none is late, the ones for today: visible without opening anything
  const tasksBadge = (myTasks.overdue + myTasks.today > 0) && (
    <span className={classes.countBadge} style={myTasks.overdue > 0 ? { background: "#dc2626", color: "#fff" } : undefined} title={`${myTasks.overdue} atrasada(s) · ${myTasks.today} para hoje`}>{myTasks.overdue > 0 ? myTasks.overdue : myTasks.today}</span>
  );

  return (
    <div onClick={drawerClose}>
      {/* the conversations come first: they are the home of the system */}
      <ListItemLink
        to="/tickets"
        primary="Conversas"
        icon={<MessagesSquareIcon className="ico" />}
        collapsed={collapsed}
      />
      {/* the team works from the conversations and the CRM; the full list of contacts is for the management */}
      {isManager(user) && (
        <ListItemLink
          to="/contacts"
          primary={i18n.t("mainDrawer.listItems.contacts")}
          icon={<ContactIcon className="ico" />}
          collapsed={collapsed}
        />
      )}
      {/* administration and coordination find these two in Configurações; everyone else keeps them here */}
      {!isManager(user) && (
        <>
          {connectionsLink}
          <ListItemLink
            to="/quickAnswers"
            primary={i18n.t("mainDrawer.listItems.quickAnswers")}
            icon={<ZapIcon className="ico" />}
            collapsed={collapsed}
          />
        </>
      )}
      {!collapsed && (
        <ListSubheader disableSticky className={classes.sectionLabel}>CRM</ListSubheader>
      )}
      {/* the funnel and its panel: the sales pipeline (a tutor sees their own leads too); not for the relationship team */}
      {user.role !== "relacionamento" && (
        <>
          <ListItemLink to="/crm" primary="Funil de captação" icon={<KanbanSquareIcon className="ico" />} collapsed={collapsed} />
          <ListItemLink to="/crm/painel" primary="Painel do CRM" icon={<LayoutDashboardIcon className="ico" />} collapsed={collapsed} adornment={myTasks.triage > 0 && <span className={classes.countBadge} style={myTasks.triageLate > 0 ? { background: "#dc2626", color: "#fff" } : undefined} title="Leads novos para conferir até o fim do dia">{myTasks.triage}</span>} />
        </>
      )}
      {<ListItemLink to="/crm/tarefas" primary="Tarefas" icon={<ListTodoIcon className="ico" />} collapsed={collapsed} adornment={tasksBadge} />}
      {["admin", "coordenacao", "consultor"].includes(user.profile === "admin" ? "admin" : user.role || "consultor") && (
        <ListItemLink to="/crm/comissoes" primary="Comissões" icon={<WalletIcon className="ico" />} collapsed={collapsed} />
      )}
      {isManager(user) && <ListItemLink to="/crm/metas-polos" alsoActive={["/crm/metas", "/crm/matriculas"]} primary="Metas" icon={<GoalIcon className="ico" />} collapsed={collapsed} />}
      {!collapsed && (
        <ListSubheader disableSticky className={classes.sectionLabel}>Cursos e alunos</ListSubheader>
      )}
      <ListItemLink to="/grades" primary="Grades" icon={<LibraryIcon className="ico" />} collapsed={collapsed} />
      <ListItemLink to="/cursos" primary="Cursos e materiais" icon={<CoursesIcon className="ico" />} collapsed={collapsed} />
      <ListItemLink
        to="/analise-curricular"
        primary="Análise curricular"
        icon={<FileSearchIcon className="ico" />}
        collapsed={collapsed}
        adornment={followUps > 0 && <span className={classes.countBadge} title="Retornos de 24 horas para registrar">{followUps}</span>}
      />
      {/* the tutoring department in one place: the students, their ambientação, retention, academic analyses and the portal */}
      {!collapsed && (
        <ListSubheader disableSticky className={classes.sectionLabel}>Tutoria</ListSubheader>
      )}
      {/* the ambientação is a tab of "Alunos da tutoria" for whoever works the tutoring; the others keep the board on its own */}
      {(isManager(user) || ["tutor", "academico"].includes(user.role)) ? (
        <ListItemLink to="/meus-alunos" alsoActive={["/ambientacao"]} primary={isManager(user) ? "Alunos da tutoria" : "Meus alunos"} icon={<UsersRoundIcon className="ico" />} collapsed={collapsed} adornment={myTasks.onboarding > 0 && <span className={classes.countBadge} title="Alunos esperando a ambientação">{myTasks.onboarding}</span>} />
      ) : (
        <ListItemLink to="/ambientacao" primary="Ambientação" icon={<MonitorCheckIcon className="ico" />} collapsed={collapsed} adornment={myTasks.onboarding > 0 && <span className={classes.countBadge} title="Alunos esperando a ambientação">{myTasks.onboarding}</span>} />
      )}
      {canOperateRetention(user) && (
        <ListItemLink to="/crm/retencao" primary="Retenção" icon={<HeartPulseIcon className="ico" />} collapsed={collapsed} />
      )}
      {(isManager(user) || ["tutor", "academico"].includes(user.role)) && (
        <>
          <ListItemLink to="/analise-academica" primary="Análise acadêmica" icon={<BookOpenCheckIcon className="ico" />} collapsed={collapsed} />
          <ListItemLink to="/alunos" primary="Alunos do portal" icon={<GraduationCapIcon className="ico" />} collapsed={collapsed} />
        </>
      )}
      {["admin", "coordenacao", "consultor"].includes(user.profile === "admin" ? "admin" : user.role || "consultor") && (
        <ListItemLink to="/afiliados" primary="Afiliados" icon={<Share2Icon className="ico" />} collapsed={collapsed} />
      )}
      {/* the tools that make the company advance are one click away, not inside Configurações */}
      {isManager(user) && (
        <>
          {!collapsed && <ListSubheader disableSticky className={classes.sectionLabel}>Automação e IA</ListSubheader>}
          <ListItemLink
            to="/ai-agents"
            primary="Agentes de IA"
            icon={<BotIcon className="ico" />}
            collapsed={collapsed}
            adornment={aiReview > 0 && <span className={classes.countBadge} title="Respostas da equipe para você revisar">{aiReview}</span>}
          />
          <ListItemLink to="/chatbot" primary="Chatbot e fluxos" icon={<WorkflowIcon className="ico" />} collapsed={collapsed} />
          {connectionsLink}
        </>
      )}
      <Divider className={classes.divider} />
      <ListItemLink
        to="/schedules"
        primary="Agendamentos"
        icon={<CalendarClockIcon className="ico" />}
        collapsed={collapsed}
      />
      {["admin", "coordenacao", "consultor", "tutor", "academico"].includes(user.profile === "admin" ? "admin" : user.role || "consultor") && (
        <ListItemLink
          to="/campaigns"
          primary="Campanhas"
          icon={<MegaphoneIcon className="ico" />}
          collapsed={collapsed}
        />
      )}
      {/* two separate places: the management sees the whole team (Gestão comercial); a consultant sees only their own (Meu desempenho);
          the tutor keeps the numbers of the tutoring */}
      {isManager(user) ? (
        <ListItemLink
          to="/estatisticas"
          alsoActive={["/gestao-comercial", "/reports", "/estatisticas/tutoria", "/estatisticas/captacao"]}
          primary="Gestão comercial"
          icon={<BarChartIcon className="ico" />}
          collapsed={collapsed}
          adornment={tasksBadge}
        />
      ) : ["tutor", "academico"].includes(user.role) ? (
        <ListItemLink to="/estatisticas/tutoria" primary="Minha tutoria" icon={<LineChartIcon className="ico" />} collapsed={collapsed} />
      ) : (
        <ListItemLink to="/meu-desempenho" alsoActive={["/estatisticas", "/reports", "/estatisticas/captacao"]} primary="Meu desempenho" icon={<GaugeIcon className="ico" />} collapsed={collapsed} />
      )}
      {isManager(user) && (
        <>
          <Divider className={classes.divider} />
          <ListItemLink
            to="/configuracoes"
            alsoActive={["/quickAnswers", "/users", "/polos", "/queues", "/tags", "/crm/config", "/settings", "/integrations"]}
            primary="Configurações"
            icon={<SlidersIcon className="ico" />}
            collapsed={collapsed}
            adornment={
              (connectionWarning || aiReview > 0) && (
                connectionWarning
                  ? <span className={clsx(classes.connectionDot, collapsed && classes.connectionDotCollapsed)} title="Há conexão desconectada" />
                  : <span className={classes.countBadge} title="Respostas da equipe para você revisar">{aiReview}</span>
              )
            }
          />
        </>
      )}
    </div>
  );
};

export default MainListItems;
