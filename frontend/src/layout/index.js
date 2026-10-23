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

import MainListItems from "./MainListItems";
import NotificationsPopOver from "../components/NotificationsPopOver";
import SidebarUserMenu from "../components/SidebarUserMenu";
import { AuthContext } from "../context/Auth/AuthContext";
import BackdropLoading from "../components/BackdropLoading";
import CrmReminders from "../components/CrmReminders";
import ConnectionAlert from "../components/ConnectionAlert";
import TaskAlert from "../components/TaskAlert";
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
  drawerSurface: {
    padding: 0,
    backgroundColor: theme.palette.background.paper,
    borderRight: theme.border.divider,
    [theme.breakpoints.down("xs")]: {
      pointerEvents: "none",
    },
  },
  drawerDocked: {
    borderRight: theme.border.divider,
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
    borderTop: theme.border.divider,
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
    overflowX: "hidden",
  },
}));

const LoggedInLayout = ({ children }) => {
  const classes = useStyles();
  const { loading } = useContext(AuthContext);
  const isMobile = useMediaQuery((theme) => theme.breakpoints.down("xs"), {
    noSsr: true,
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const alertsRef = useRef(null);
  const [alertsH, setAlertsH] = useState(0);
  useEffect(() => {
    const el = alertsRef.current;
    if (!el) return undefined;
    const measure = () => setAlertsH(Math.round(el.getBoundingClientRect().height));
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { user } = useContext(AuthContext);
  const { darkMode, toggleTheme } = useThemeContext();
  const location = useLocation();

  useEffect(() => {
    setDrawerOpen(!isMobile);
  }, [isMobile]);

  const drawerClose = () => {
    if (isMobile) {
      setDrawerOpen(false);
    }
  };

  if (loading) {
    return <BackdropLoading />;
  }

  return (
    <div className={classes.root}>
      <Drawer
        variant={isMobile ? "temporary" : "permanent"}
        className={drawerOpen ? classes.drawerPaper : classes.drawerPaperClose}
        classes={{
          paper: clsx(
            classes.drawerPaper,
            !drawerOpen && classes.drawerPaperClose,
            classes.drawerSurface
          ),
          paperAnchorDockedLeft: classes.drawerDocked,
        }}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      >
        <div className={classes.appBarSpacer} />
        <div className={classes.sidebarCard}>
          <List className={classes.navList}>
            <MainListItems drawerClose={drawerClose} collapsed={!drawerOpen} />
          </List>
          <div className={classes.sidebarFooter}>
            <SidebarUserMenu collapsed={!drawerOpen} />
          </div>
        </div>
      </Drawer>
      <AppBar position="absolute" className={classes.appBar}>
        <Toolbar variant="dense" className={classes.toolbar}>
          <IconButton
            edge="start"
            aria-label="open drawer"
            onClick={() => setDrawerOpen(!drawerOpen)}
            className={classes.menuButton}
          >
            {drawerOpen ? <MenuOpenIcon /> : <MenuIcon />}
          </IconButton>
          <BrandLogo tone={darkMode ? "white" : "color"} height={40} style={{ alignSelf: "center" }} />
          <div className={classes.grow} />

          <IconButton
            aria-label={i18n.t("mainDrawer.appBar.darkMode")}
            onClick={toggleTheme}
            className={classes.headerIcon}
          >
            {darkMode ? <Brightness7Icon /> : <Brightness4Icon />}
          </IconButton>

          {user.id && <NotificationsPopOver />}
        </Toolbar>
      </AppBar>
      <CrmReminders />
      <main className={classes.content}>
        <div key={location.pathname.split("/")[1]} className={clsx("page-enter", /^\/(chatbot|ai-agents\/blocos)\/\d+/.test(location.pathname) && "page-fill")} style={{ "--alerts-h": `${alertsH}px` }}>
          <div className={classes.appBarSpacer} />
          {/* the notices of the top take room: the screens below subtract it (var(--alerts-h)) so nothing ends up under the fold, like the box where the message is typed */}
          <div ref={alertsRef}>
            <ConnectionAlert />
            <TaskAlert />
          </div>
          {children ? children : null}
        </div>
      </main>
    </div>
  );
};

export default LoggedInLayout;
