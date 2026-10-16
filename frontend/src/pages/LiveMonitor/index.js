import React, { useEffect, useState, useCallback } from "react";
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Chip,
  Typography,
  makeStyles,
  Avatar,
  IconButton,
} from "@material-ui/core";
import OpenInNew from "@material-ui/icons/OpenInNew";
import { useHistory } from "react-router-dom";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import ChannelIcon from "../../components/ChannelIcon";
import StatusPill from "../../components/StatusPill";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import openSocket from "../../services/socket-io";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { duration } from "../Reports";

const useStyles = makeStyles((theme) => ({
  paper: { flex: 1, overflowY: "auto", padding: theme.spacing(1), ...theme.scrollbarStyles },
  chips: { display: "flex", gap: theme.spacing(1), flexWrap: "wrap", marginRight: theme.spacing(2) },
}));


const LiveMonitor = () => {
  const classes = useStyles();
  const history = useHistory();
  const [data, setData] = useState({ tickets: [], connections: [] });

  const load = useCallback(async () => {
    try {
      const { data: d } = await api.get("/stats/live");
      setData(d);
    } catch (err) {
      toastError(err);
    }
  }, []);

  useEffect(() => {
    load();
    // a hidden tab does not poll, and a burst of messages asks for one refresh instead of one per message
    const timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, 10000);
    let soon;
    const again = () => { clearTimeout(soon); soon = setTimeout(load, 1500); };
    const socket = openSocket("notification");
    socket.on("connect", () => {
      socket.emit("joinNotification");
    });
    socket.on("appMessage", again);
    socket.on("ticket", again);
    return () => {
      clearTimeout(soon);
      clearInterval(timer);
      socket.disconnect();
    };
  }, [load]);

  const waiting = data.tickets.filter((t) => t.status === "pending").length;
  const open = data.tickets.filter((t) => t.status === "open").length;

  return (
    <MainContainer>
      <MainHeader>
        <Title>Monitor ao vivo</Title>
        <MainHeaderButtonsWrapper>
          <div className={classes.chips}>
            {data.connections.map((c) => (
              <StatusPill
                key={c.id}
                tone={c.status === "CONNECTED" ? "ok" : c.status === "OPENING" ? "wait" : "off"}
                title={c.status === "CONNECTED" ? "Conectado" : c.status === "OPENING" ? "Conectando" : "Desconectado"}
                icon={<ChannelIcon channel={c.channel} size={15} />}
              >
                {c.name}
              </StatusPill>
            ))}
          </div>
          <Chip color="primary" label={`${open} em atendimento`} />
          <Chip style={{ background: waiting ? "#ffe0b2" : undefined }} label={`${waiting} aguardando`} />
        </MainHeaderButtonsWrapper>
      </MainHeader>
      <Paper className={classes.paper} variant="outlined">
        {data.tickets.length === 0 ? (
          <Typography align="center" color="textSecondary" style={{ padding: 32 }}>
            Nenhum atendimento aberto no momento.
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Cliente</TableCell>
                <TableCell>Canal</TableCell>
                <TableCell>Fila</TableCell>
                <TableCell>Atendente</TableCell>
                <TableCell>Última mensagem</TableCell>
                <TableCell align="right">Sem resposta há</TableCell>
                <TableCell align="right">Aberto há</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {data.tickets.map((t) => (
                <TableRow key={t.id} style={{ background: t.status === "pending" ? "rgba(255,152,0,.10)" : undefined }}>
                  <TableCell>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Avatar src={t.profilePicUrl} style={{ width: 28, height: 28 }}>{t.contactName?.charAt(0)}</Avatar>
                      {t.contactName}
                      {t.unreadMessages > 0 && <Chip size="small" color="primary" label={t.unreadMessages} />}
                    </div>
                  </TableCell>
                  <TableCell><ChannelIcon channel={t.channel} withLabel size={16} /></TableCell>
                  <TableCell>
                    {t.queueName ? <Chip size="small" label={t.queueName} style={{ background: t.queueColor, color: "#fff" }} /> : "—"}
                  </TableCell>
                  <TableCell>{t.userName || <i>aguardando</i>}</TableCell>
                  <TableCell style={{ maxWidth: 260 }}>
                    <Typography noWrap variant="body2">{(t.lastMessage || "").replace(/‎/g, "")}</Typography>
                  </TableCell>
                  <TableCell align="right" style={{ color: t.idleSeconds > 600 ? "#f44336" : undefined, fontWeight: t.idleSeconds > 600 ? 600 : 400 }}>
                    {duration(t.idleSeconds)}
                  </TableCell>
                  <TableCell align="right">{duration(t.ageSeconds)}</TableCell>
                  <TableCell>
                    <IconButton size="small" title="Abrir atendimento" onClick={() => history.push(`/tickets/${t.id}`)}>
                      <OpenInNew fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>
    </MainContainer>
  );
};

export default LiveMonitor;
