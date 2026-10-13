import React, { useEffect, useState } from "react";
import {
  Paper,
  Typography,
  TextField,
  MenuItem,
  makeStyles,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Grid,
} from "@material-ui/core";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { format, subDays } from "date-fns";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import ChannelIcon, { CHANNELS } from "../../components/ChannelIcon";
import GlowCard from "../../components/GlowCard";
import NumberTicker from "../../components/NumberTicker";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => ({
  scroll: { flex: 1, overflowY: "auto", ...theme.scrollbarStyles, paddingBottom: theme.spacing(2) },
  kpi: { padding: theme.spacing(2), height: "100%" },
  kpiValue: { fontSize: 30, fontWeight: 600, lineHeight: 1.2, letterSpacing: "-0.02em" },
  card: { padding: theme.spacing(2) },
  chartBox: { height: 260 },
}));

export const duration = (sec) => {
  if (sec === null || sec === undefined || Number.isNaN(Number(sec))) return "—";
  const s = Math.round(Number(sec));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}min`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
};

const Kpi = ({ label, value, hint }) => {
  const classes = useStyles();
  return (
    <GlowCard className={classes.kpi}>
      <Typography variant="body2" color="textSecondary">{label}</Typography>
      <div className={classes.kpiValue}>
        {typeof value === "number" ? <NumberTicker value={value} /> : value}
      </div>
      {hint && <Typography variant="caption" color="textSecondary">{hint}</Typography>}
    </GlowCard>
  );
};

const Reports = () => {
  const classes = useStyles();
  const [from, setFrom] = useState(format(subDays(new Date(), 29), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [queueId, setQueueId] = useState("");
  const [userId, setUserId] = useState("");
  const [queues, setQueues] = useState([]);
  const [users, setUsers] = useState([]);
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/queue").then(({ data: d }) => setQueues(d));
    api.get("/users", { params: { pageNumber: 1 } }).then(({ data: d }) => setUsers(d.users || []));
  }, []);

  useEffect(() => {
    api
      .get("/stats/overview", { params: { from, to, queueId: queueId || undefined, userId: userId || undefined } })
      .then(({ data: d }) => setData(d))
      .catch(toastError);
  }, [from, to, queueId, userId]);

  const days = {};
  (data?.perDay || []).forEach((d) => {
    const k = String(d.day).slice(0, 10);
    days[k] = { day: k.slice(5), created: Number(d.created), closed: 0 };
  });
  (data?.closedPerDay || []).forEach((d) => {
    const k = String(d.day).slice(0, 10);
    days[k] = { day: k.slice(5), created: 0, ...days[k], closed: Number(d.closed) };
  });
  const series = Object.keys(days).sort().map((k) => days[k]);

  const channelData = (data?.perChannel || []).map((c) => ({
    name: CHANNELS[c.channel]?.label || c.channel,
    value: Number(c.total),
    color: CHANNELS[c.channel]?.color || "#999",
  }));

  return (
    <MainContainer>
      <MainHeader>
        <Title>Estatísticas</Title>
        <MainHeaderButtonsWrapper>
          <TextField size="small" type="date" label="De" variant="outlined" InputLabelProps={{ shrink: true }} value={from} onChange={(e) => setFrom(e.target.value)} />
          <TextField size="small" type="date" label="Até" variant="outlined" InputLabelProps={{ shrink: true }} value={to} onChange={(e) => setTo(e.target.value)} />
          <TextField select size="small" label="Fila" variant="outlined" value={queueId} onChange={(e) => setQueueId(e.target.value)} style={{ minWidth: 130 }}>
            <MenuItem value="">Todas</MenuItem>
            {queues.map((q) => (<MenuItem key={q.id} value={q.id}>{q.name}</MenuItem>))}
          </TextField>
          <TextField select size="small" label="Atendente" variant="outlined" value={userId} onChange={(e) => setUserId(e.target.value)} style={{ minWidth: 150 }}>
            <MenuItem value="">Todos</MenuItem>
            {users.map((u) => (<MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>))}
          </TextField>
        </MainHeaderButtonsWrapper>
      </MainHeader>

      {data && (
        <div className={classes.scroll}>
          <Grid container spacing={2}>
            <Grid item xs={6} md={3}><Kpi label="Em atendimento agora" value={data.totals.open || 0} hint={`${data.totals.pending || 0} aguardando`} /></Grid>
            <Grid item xs={6} md={3}><Kpi label="Atendimentos no período" value={data.period.created} hint={`${data.period.closedInPeriod || 0} finalizados`} /></Grid>
            <Grid item xs={6} md={3}><Kpi label="Tempo médio 1ª resposta" value={duration(data.period.avgFirstResponse)} /></Grid>
            <Grid item xs={6} md={3}><Kpi label="Tempo médio de resolução" value={duration(data.period.avgResolution)} /></Grid>
            <Grid item xs={6} md={3}><Kpi label="Mensagens recebidas" value={data.messages.received || 0} /></Grid>
            <Grid item xs={6} md={3}><Kpi label="Mensagens enviadas" value={data.messages.sent || 0} /></Grid>
            <Grid item xs={12} md={6}><Kpi label="Total de atendimentos (histórico)" value={data.totals.total || 0} hint={`${data.totals.closed || 0} finalizados`} /></Grid>

            <Grid item xs={12} md={8}>
              <Paper variant="outlined" className={classes.card}>
                <Typography variant="subtitle2" gutterBottom>Atendimentos por dia</Typography>
                <div className={classes.chartBox}>
                  <ResponsiveContainer>
                    <LineChart data={series}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="day" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="created" name="Abertos" stroke="#2196f3" strokeWidth={2} />
                      <Line type="monotone" dataKey="closed" name="Finalizados" stroke="#4caf50" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Paper>
            </Grid>
            <Grid item xs={12} md={4}>
              <Paper variant="outlined" className={classes.card}>
                <Typography variant="subtitle2" gutterBottom>Por canal</Typography>
                <div className={classes.chartBox}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={channelData} dataKey="value" nameKey="name" outerRadius={85} label>
                        {channelData.map((c) => (<Cell key={c.name} fill={c.color} />))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Paper>
            </Grid>

            <Grid item xs={12} md={6}>
              <Paper variant="outlined" className={classes.card}>
                <Typography variant="subtitle2" gutterBottom>Por fila</Typography>
                <div className={classes.chartBox}>
                  <ResponsiveContainer>
                    <BarChart data={data.perQueue.map((q) => ({ ...q, total: Number(q.total) }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="total" name="Atendimentos">
                        {data.perQueue.map((q) => (<Cell key={q.name} fill={q.color} />))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Paper>
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper variant="outlined" className={classes.card}>
                <Typography variant="subtitle2" gutterBottom>Por etiqueta</Typography>
                {data.perTag.length === 0 ? (
                  <Typography color="textSecondary" variant="body2">Nenhum atendimento etiquetado no período.</Typography>
                ) : (
                  <div className={classes.chartBox}>
                    <ResponsiveContainer>
                      <BarChart data={data.perTag.map((t) => ({ ...t, total: Number(t.total) }))} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" allowDecimals={false} />
                        <YAxis type="category" dataKey="name" width={90} />
                        <Tooltip />
                        <Bar dataKey="total" name="Atendimentos">
                          {data.perTag.map((t) => (<Cell key={t.name} fill={t.color} />))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Paper>
            </Grid>

            <Grid item xs={12}>
              <Paper variant="outlined" className={classes.card}>
                <Typography variant="subtitle2" gutterBottom>Desempenho por atendente</Typography>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Atendente</TableCell>
                      <TableCell align="right">Abertos agora</TableCell>
                      <TableCell align="right">Atendidos no período</TableCell>
                      <TableCell align="right">Finalizados</TableCell>
                      <TableCell align="right">1ª resposta (média)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.perUser.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell>{u.name}</TableCell>
                        <TableCell align="right">{u.open || 0}</TableCell>
                        <TableCell align="right">{u.handled || 0}</TableCell>
                        <TableCell align="right">{u.closed || 0}</TableCell>
                        <TableCell align="right">{duration(u.avgFirstResponse)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Paper>
            </Grid>
          </Grid>
        </div>
      )}
    </MainContainer>
  );
};

export default Reports;
