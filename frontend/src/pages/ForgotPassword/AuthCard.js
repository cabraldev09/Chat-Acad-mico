import React from "react";
import { makeStyles, useTheme } from "@material-ui/core/styles";

import BrandLogo from "../../components/BrandLogo";

const useStyles = makeStyles((theme) => ({
  root: { minHeight: "100vh", display: "grid", placeItems: "center", padding: theme.spacing(2), background: `radial-gradient(900px circle at 50% -8%, rgba(6,147,227,.20), transparent 62%), radial-gradient(700px circle at 100% 100%, rgba(11,66,121,.10), transparent 60%), ${theme.palette.background.default}` },
  card: { width: "100%", maxWidth: 420, padding: theme.spacing(4, 3.5), borderRadius: 20, background: theme.palette.cards ? theme.palette.cards.background : theme.palette.background.paper, border: theme.border ? theme.border.divider : "1px solid rgba(127,140,160,.25)", boxShadow: "0 18px 50px -24px rgba(11,66,121,.45)" },
  logo: { display: "block", margin: "0 auto 18px" },
  title: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 6px", textAlign: "center" },
  sub: { fontSize: 14.5, lineHeight: 1.5, textAlign: "center", color: theme.palette.text.secondary, margin: "0 0 14px" },
}));

// the card of the screens opened by someone who is not logged in (recover and create a password)
const AuthCard = ({ title, subtitle, children }) => {
  const classes = useStyles();
  const theme = useTheme();
  return (
    <div className={classes.root}>
      <div className={classes.card}>
        <BrandLogo tone={theme.palette.type === "dark" ? "white" : "color"} height={56} className={classes.logo} />
        <h1 className={classes.title}>{title}</h1>
        {subtitle && <p className={classes.sub}>{subtitle}</p>}
        {children}
      </div>
    </div>
  );
};

export default AuthCard;
