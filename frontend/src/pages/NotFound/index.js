import React from "react";
import { Link } from "react-router-dom";
import { Typography, Button, makeStyles } from "@material-ui/core";
import { Compass } from "lucide-react";

const useStyles = makeStyles((theme) => ({
  wrap: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: theme.spacing(1.5), textAlign: "center", padding: theme.spacing(4), minHeight: "60vh" },
  icon: { width: 64, height: 64, borderRadius: 20, display: "grid", placeItems: "center", background: theme.palette.action.selected, color: theme.palette.text.secondary },
}));

// an address that does not exist: a clear way back instead of an empty screen
const NotFound = () => {
  const classes = useStyles();
  return (
    <div className={classes.wrap}>
      <div className={classes.icon}><Compass size={30} /></div>
      <Typography variant="h5" style={{ fontWeight: 700 }}>Página não encontrada</Typography>
      <Typography color="textSecondary" style={{ maxWidth: 420 }}>O endereço não existe ou mudou de lugar. Volte para as conversas ou use o menu ao lado.</Typography>
      <Button component={Link} to="/tickets" variant="contained" color="primary">Ir para as conversas</Button>
    </div>
  );
};

export default NotFound;
