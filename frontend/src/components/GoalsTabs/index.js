import React, { useContext } from "react";
import { useHistory } from "react-router-dom";
import { makeStyles } from "@material-ui/core";
import { MapPin, Users } from "lucide-react";

import { AuthContext } from "../../context/Auth/AuthContext";
import { isManager } from "../../utils/access";

const useStyles = makeStyles((theme) => ({
  wrap: { display: "inline-flex", gap: 4, padding: 4, borderRadius: 14, background: theme.palette.action.hover, marginBottom: theme.spacing(2) },
  tab: { border: 0, background: "transparent", color: theme.palette.text.secondary, borderRadius: 10, padding: "7px 14px", cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, display: "inline-flex", gap: 7, alignItems: "center", transition: "background .15s, color .15s" },
  on: { background: theme.palette.cards.background, color: theme.palette.text.primary, boxShadow: "0 1px 4px rgba(11,66,121,.16)" },
}));

// the two goal screens are one place: by polo (everyone) and by consultant (administration and coordination)
const GoalsTabs = ({ current }) => {
  const classes = useStyles();
  const history = useHistory();
  const { user } = useContext(AuthContext);
  if (!isManager(user)) return null;
  return (
    <div className={classes.wrap} role="tablist">
      <button type="button" role="tab" aria-selected={current === "polo"} className={`${classes.tab} ${current === "polo" ? classes.on : ""}`} onClick={() => history.push("/crm/metas-polos")}><MapPin size={15} /> Por polo</button>
      <button type="button" role="tab" aria-selected={current === "team"} className={`${classes.tab} ${current === "team" ? classes.on : ""}`} onClick={() => history.push("/crm/metas")}><Users size={15} /> Por consultor</button>
    </div>
  );
};

export default GoalsTabs;
