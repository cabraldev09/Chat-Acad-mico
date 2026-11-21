import React, { useState, useContext, useEffect, useRef } from "react";
import clsx from "clsx";
import {
  makeStyles,
  Drawer,
  AppBar,
  Toolbar,
  List,
  IconButton,
  useMediaQuery,
} from "@material-ui/core";
import { useLocation } from "react-router-dom";
import MenuIcon from "@material-ui/icons/Menu";
import MenuOpenIcon from "@material-ui/icons/MenuOpen";
import Brightness4Icon from "@material-ui/icons/Brightness4";
import Brightness7Icon from "@material-ui/icons/Brightness7";
import BrightnessAutoIcon from "@material-ui/icons/BrightnessAuto";
import Tooltip from "@material-ui/core/Tooltip";

import MainListItems from "./MainListItems";
import NotificationsPopOver from "../components/NotificationsPopOver";
import SidebarUserMenu from "../components/SidebarUserMenu";
import { AuthContext } from "../context/Auth/AuthContext";
import BackdropLoading from "../components/BackdropLoading";
import CrmReminders from "../components/CrmReminders";
import ConnectionAlert from "../components/ConnectionAlert";
import TaskAlert from "../components/TaskAlert";
import { Notices } from "../components/Notices";
import { i18n } from "../translate/i18n";
import { useThemeContext } from "../context/DarkMode";
import BrandLogo from "../components/BrandLogo";

const drawerWidth = 264;
const drawerCollapsedWidth = 72;

const useStyles = makeStyles((theme) => ({
  root: {
    display: "flex",
    height: "100vh",
    [theme.breakpoints.down("sm")]: {
      height: "100dvh",
    },
  },
  toolbar: {
    minHeight: theme.sizing.appBar,
    paddingRight: 24, // keep right padding when drawer closed
  },
  appBar: {
    zIndex: theme.zIndex.drawer + 1,
    backgroundColor: theme.palette.appBar.background,
    backdropFilter: "saturate(180%) blur(12px)",
    borderBottom: theme.border.divider,
    boxShadow: "none",
    color: theme.palette.text.primary,
  },
  menuButton: {
    marginRight: theme.spacing(2),
    color: theme.palette.text.secondary,
  },
  logo: {
    height: 24,
  },
  grow: {
    flexGrow: 1,
  },
  headerIcon: {
    color: theme.palette.text.secondary,
  },
  drawerPaper: {
    position: "relative",
    whiteSpace: "nowrap",
    width: drawerWidth,
    transition: theme.transitions.create("width", {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.enteringScreen,
    }),
  },
  drawerPaperClose: {
    overflowX: "hidden",
    transition: theme.transitions.create("width", {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.leavingScreen,
    }),
    width: drawerCollapsedWidth,
  },
  // the side menu on the navy of the brand (same in light and dark mode), white text; MainListItems and SidebarUserMenu follow it
  drawerSurface: {
    padding: 0,
    // light: the navy of the brand; dark: the neutral grey of the rest of the dark screens (like WhatsApp), the highlight stays light blue
    backgroundColor: theme.palette.type === "dark" ? "#1d1f1f" : "#0B4279",
    backgroundImage: theme.palette.type === "dark" ? "none" : "linear-gradient(180deg, #0B4279 0%, #0a3a6d 100%)",
    color: "rgba(255,255,255,.86)",
    borderRight: "1px solid rgba(255,255,255,.08)",
    "& .MuiDivider-root": { backgroundColor: "rgba(255,255,255,.12)" },
    "& .MuiTypography-colorTextSecondary": { color: "rgba(255,255,255,.6)" },
    "& .MuiAvatar-root": { backgroundColor: "rgba(255,255,255,.16)", color: "#fff" },
    "& ::-webkit-scrollbar-thumb": { backgroundColor: "rgba(255,255,255,.22)" },
    [theme.breakpoints.down("xs")]: {
      pointerEvents: "none",
    },
  },
  drawerDocked: {
    borderRight: 0,
  },
  // opened by the mouse over the collapsed menu: it floats over the page (the conversation does not move) and closes when the mouse leaves
  // it opens under the top bar: the logo and the menu button stay in sight (over the bar the top of the menu was an empty block)
  drawerPeek: {
    position: "absolute",
    top: theme.sizing.appBar,
    left: 0,
    bottom: 0,
    zIndex: theme.zIndex.drawer + 2,
    boxShadow: "8px 0 24px -12px rgba(15,23,42,.45)",
  },
  drawerHolder: {
    position: "relative",
    flex: "none",
    width: drawerCollapsedWidth,
  },
  sidebarCard: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    padding: theme.spacing(1.5, 1.25, 1),
    backgroundColor: "transparent",
    overflow: "hidden",
    [theme.breakpoints.down("xs")]: {
      pointerEvents: "auto",
    },
  },
  navList: {
    flex: 1,
    padding: 0,
    overflowX: "hidden",
    overflowY: "auto",
    ...theme.scrollbarStyles,
  },
  sidebarFooter: {
    borderTop: "1px solid rgba(255,255,255,.12)",
    paddingTop: theme.spacing(1),
    marginTop: theme.spacing(1),
  },
  appBarSpacer: {
    minHeight: theme.sizing.appBar,
  },
  content: {
    flex: 1,
    minWidth: 0,
    overflowY: "auto",
    // a page wider than the screen scrolls instead of being cut silently
    overflowX: "auto",
  },
}));

const LoggedInLayout = ({ children }) => {
  const classes = useStyles();
  const { loading } = useContext(AuthContext);
  const isMobile = useMediaQuery((theme) => theme.breakpoints.down("xs"), {
    noSsr: true,
  });
  // tablets and landscape phones (up to 960px): the menu stays as a column of icons, so the page keeps its width
  const isCompact = useMediaQuery((theme) => theme.breakpoints.down("sm"), { noSsr: true });
  const [drawerOpen, setDrawerOpen] = useState(false);
  // desktop: the menu folds by itself when the person clicks anywhere else (a contact, the conversation) and opens again under the mouse
  const [peek, setPeek] = useState(false);
  const drawerRef = useRef(null);
  const peekTimer = useRef(null);
  useEffect(() => {
    if (isCompact || !drawerOpen) return undefined;
    const fold = (e) => {
      if (drawerRef.current && drawerRef.current.contains(e.target)) return;
      if (e.target && e.target.closest && e.target.closest('[aria-label="Abrir ou fechar o menu"]')) return;
      setDrawerOpen(false);
    };
    document.addEventListener("mousedown", fold);
    return () => document.removeEventListener("mousedown", fold);
  }, [isCompact, drawerOpen]);
  useEffect(() => () => clearTimeout(peekTimer.current), []);
  const peekOn = () => {
    if (isCompact || drawerOpen) return;
    clearTimeout(peekTimer.current);
    peekTimer.current = setTimeout(() => setPeek(true), 120);
  };
  const peekOff = () => {
    clearTimeout(peekTimer.current);
    setPeek(false);
  };
  const shown = drawerOpen || peek;
  const alertsRef = useRef(null);
  const [alertsH, setAlertsH] = useState(0);
  // the notices only exist once the session has loaded (before that a loading screen is returned and the ref is empty)
  const sessionLoading = useContext(AuthContext).loading;
  useEffect(() => {
    const el = alertsRef.current;
    if (!el) return undefined;
    // the layout height (offsetHeight): a notice still animating in (a transform) would measure smaller and leave the page a few pixels too tall, with a second scrollbar
    const measure = () => setAlertsH(el.offsetHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sessionLoading]);
  const { user } = useContext(AuthContext);
  const { darkMode, mode, toggleTheme } = useThemeContext();
  const location = useLocation();

  useEffect(() => {
    setDrawerOpen(!isCompact);
  }, [isCompact]);

  const drawerClose = () => {
    setPeek(false);
    if (isCompact) {
      setDrawerOpen(false);
    }
  };

  if (loading) {
    return <BackdropLoading />;
  }

  return (
    <div className={classes.root}>
      {/* while the mouse opens it, the menu floats over the page: a holder keeps the width of the folded menu so nothing moves */}
      <div ref={drawerRef} className={peek && !drawerOpen ? classes.drawerHolder : undefined} onMouseEnter={peekOn} onMouseLeave={peekOff} style={{ display: "flex" }}>
      <Drawer
        variant={isMobile ? "temporary" : "permanent"}
        className={shown ? classes.drawerPaper : classes.drawerPaperClose}
        classes={{
          paper: clsx(
            classes.drawerPaper,
            !shown && classes.drawerPaperClose,
            peek && !drawerOpen && classes.drawerPeek,
            classes.drawerSurface
          ),
          paperAnchorDockedLeft: classes.drawerDocked,
        }}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      >
        {!(peek && !drawerOpen) && <div className={classes.appBarSpacer} />}
        <div className={classes.sidebarCard}>
          <List className={classes.navList}>
            <MainListItems drawerClose={drawerClose} collapsed={!shown} />
          </List>
          <div className={classes.sidebarFooter}>
            <SidebarUserMenu collapsed={!shown} />
          </div>
        </div>
      </Drawer>
      </div>
      <AppBar position="absolute" className={classes.appBar}>
        <Toolbar variant="dense" className={classes.toolbar}>
          <IconButton
            edge="start"
            aria-label="Abrir ou fechar o menu"
            onClick={() => setDrawerOpen(!drawerOpen)}
            className={classes.menuButton}
          >
            {drawerOpen ? <MenuOpenIcon /> : <MenuIcon />}
          </IconButton>
          <BrandLogo tone={darkMode ? "white" : "color"} height={40} style={{ alignSelf: "center" }} />
          <div className={classes.grow} />

          <Tooltip title={mode === "auto" ? "Aparência: automática (segue o computador). Clique para fixar claro" : mode === "light" ? "Aparência: clara. Clique para escura" : "Aparência: escura. Clique para automática"}>
            <IconButton
              aria-label={`Aparência ${mode === "auto" ? "automática" : mode === "light" ? "clara" : "escura"}`}
              onClick={toggleTheme}
              className={classes.headerIcon}
            >
              {mode === "auto" ? <BrightnessAutoIcon /> : darkMode ? <Brightness7Icon /> : <Brightness4Icon />}
            </IconButton>
          </Tooltip>

          {user.id && <NotificationsPopOver />}
        </Toolbar>
      </AppBar>
      <CrmReminders />
      <main className={classes.content}>
        <div key={location.pathname.split("/")[1]} className={clsx("page-enter", /^\/(chatbot|ai-agents\/blocos)\/\d+/.test(location.pathname) && "page-fill")} style={{ "--alerts-h": `${alertsH}px` }}>
          <div className={classes.appBarSpacer} />
          {/* the notices of the top take room: the screens below subtract it (var(--alerts-h)) so nothing ends up under the fold, like the box where the message is typed */}
          <div ref={alertsRef}>
            <Notices>
              <ConnectionAlert />
              <TaskAlert />
            </Notices>
          </div>
          {children ? children : null}
        </div>
      </main>
    </div>
  );
};

export default LoggedInLayout;
