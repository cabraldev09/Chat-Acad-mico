import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import { makeStyles } from "@material-ui/core/styles";
import { Paper, Typography, Switch, FormControlLabel, TextField, MenuItem, Button } from "@material-ui/core";
import { Clock, ShieldCheck, BellRing, KeyRound, Copy, Eye, EyeOff } from "lucide-react";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import TimezoneSelect from "../../components/TimezoneSelect";
import openSocket from "../../services/socket-io";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => ({
  wrap: { flex: 1, overflowY: "auto", overflowX: "hidden", paddingBottom: theme.spacing(3), ...theme.scrollbarStyles },
  grid: { display: "grid", gap: theme.spacing(2), gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", alignItems: "start", maxWidth: 1100 },
  card: { borderRadius: 16, border: `1px solid ${theme.palette.divider}`, padding: theme.spacing(2.25), display: "flex", flexDirection: "column", gap: theme.spacing(0.75) },
  head: { display: "flex", alignItems: "center", gap: theme.spacing(1.25), marginBottom: theme.spacing(0.5) },
  badge: { width: 36, height: 36, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", color: theme.palette.primary.main, background: theme.palette.action.hover, flex: "none" },
  title: { fontWeight: 700, fontSize: 16, lineHeight: 1.2 },
  sub: { fontSize: 13, color: theme.palette.text.secondary },
  hint: { fontSize: 12.5, color: theme.palette.text.secondary },
  tokenRow: { display: "flex", gap: theme.spacing(1), alignItems: "center", flexWrap: "wrap" },
}));

const HOURS = [4, 8, 12, 24, 48, 72];
const MINUTES = [0, 15, 30, 60, 120];

const Section = ({ icon, title, sub, children }) => {
  const classes = useStyles();
  return (
    <Paper variant="outlined" className={classes.card}>
      <div className={classes.head}>
        <span className={classes.badge}>{icon}</span>
        <div><div className={classes.title}>{title}</div><div className={classes.sub}>{sub}</div></div>
      </div>
      {children}
    </Paper>
  );
};

// Everything saves as soon as it changes, with a confirmation.
const Settings = () => {
  const classes = useStyles();
  const [values, setValues] = useState(null);
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    api.get("/settings").then(({ data }) => setValues(Object.fromEntries(data.map((s) => [s.key, s.value])))).catch((e) => { toastError(e); setValues({}); });
    const socket = openSocket();
    socket.on("settings", (d) => { if (d.action === "update") setValues((cur) => ({ ...cur, [d.setting.key]: d.setting.value })); });
    return () => socket.disconnect();
  }, []);

  const save = useCallback(async (key, value) => {
    const previous = values && values[key];
    setValues((cur) => ({ ...cur, [key]: value }));
    try {
      await api.put(`/settings/${key}`, { value: String(value) });
      toast.success("Configuração salva.");
    } catch (err) {
      setValues((cur) => ({ ...cur, [key]: previous }));
      toastError(err);
    }
  }, [values]);

  if (!values) return null;
  const token = values.userApiToken || "";

  return (
    <MainContainer>
      <MainHeader><Title>Configurações</Title></MainHeader>
      <div className={classes.wrap}>
        <div className={classes.grid}>
          <Section icon={<Clock size={18} />} title="Empresa e horário" sub="Todos os horários e o “hoje” dos relatórios seguem este fuso.">
            <TimezoneSelect value={values.appTimezone || "America/Porto_Velho"} onChange={(v) => save("appTimezone", v)} />
            <Typography className={classes.hint}>Os dados são guardados em UTC; só a exibição e a contagem do dia mudam.</Typography>
          </Section>

          <Section icon={<ShieldCheck size={18} />} title="Acesso" sub="Quem pode entrar no sistema.">
            <FormControlLabel
              control={<Switch color="primary" checked={values.userCreation === "enabled"} onChange={(e) => save("userCreation", e.target.checked ? "enabled" : "disabled")} />}
              label={values.userCreation === "enabled" ? "Cadastro público: ligado" : "Cadastro público: desligado"}
            />
            <Typography className={classes.hint}>
              {values.userCreation === "enabled"
                ? "Qualquer pessoa com o endereço consegue criar uma conta. Mantenha desligado e crie os usuários em Usuários."
                : "Só o administrador cria usuários. É o recomendado."}
            </Typography>
          </Section>

          <Section icon={<BellRing size={18} />} title="Atendimento" sub="Prazos e lembretes automáticos.">
            <TextField select fullWidth variant="outlined" margin="dense" label="Alertar se o aluno ficar sem contato por"
              value={Number(values.onboarding_sla_hours || 24)} onChange={(e) => save("onboarding_sla_hours", e.target.value)}
              InputLabelProps={{ shrink: true }}>
              {HOURS.map((h) => (<MenuItem key={h} value={h}>{h} horas</MenuItem>))}
            </TextField>
            <Typography className={classes.hint}>Vale para o tutor que ainda não falou com o aluno depois da matrícula.</Typography>
            <TextField select fullWidth variant="outlined" margin="dense" label="WhatsApp que cada pessoa pode conectar"
              value={Number(values.max_connections_per_user || 1)} onChange={(e) => save("max_connections_per_user", e.target.value)}
              InputLabelProps={{ shrink: true }}>
              {[1, 2, 3].map((n) => (<MenuItem key={n} value={n}>{n} {n === 1 ? "número" : "números"} por pessoa</MenuItem>))}
            </TextField>
            <Typography className={classes.hint}>Cada pessoa conecta o próprio número em Conexões. As conversas dele ficam com ela.</Typography>
            <TextField select fullWidth variant="outlined" margin="dense" label="Lembrar quem largou o chatbot após"
              value={Number(values.chatbot_reminder_minutes ?? 30)} onChange={(e) => save("chatbot_reminder_minutes", e.target.value)}
              InputLabelProps={{ shrink: true }}>
              {MINUTES.map((m) => (<MenuItem key={m} value={m}>{m === 0 ? "Não lembrar" : `${m} minutos`}</MenuItem>))}
            </TextField>
          </Section>

          <Section icon={<BellRing size={18} />} title="Boas-vindas do tutor" sub="O texto que o tutor recebe pronto, na conversa do aluno recém-matriculado.">
            <TextField fullWidth multiline rows={5} variant="outlined" margin="dense" label="Mensagem de boas-vindas"
              defaultValue={values.onboarding_welcome_template || ""} key={values.onboarding_welcome_template || "vazio"}
              placeholder="Olá, {{primeiro_nome}}! Parabéns pela matrícula! Eu sou {{tutor}}, do polo {{polo}}..."
              onBlur={(e) => { if (e.target.value !== (values.onboarding_welcome_template || "")) save("onboarding_welcome_template", e.target.value); }}
              InputLabelProps={{ shrink: true }} />
            <Typography className={classes.hint}>
              O sistema nunca envia esta mensagem sozinho: o tutor vê o texto no campo de mensagem, pode editar e envia se quiser. Variáveis: {"{{primeiro_nome}}"}, {"{{nome}}"}, {"{{tutor}}"} e {"{{polo}}"}. Em branco, vale um texto padrão.
            </Typography>
            <TextField select fullWidth variant="outlined" margin="dense" label="Meta de tempo de resposta"
              value={Number(values.response_sla_minutes || 15)} onChange={(e) => save("response_sla_minutes", e.target.value)} InputLabelProps={{ shrink: true }}>
              {[5, 10, 15, 30, 60].map((m) => (<MenuItem key={m} value={m}>{m} minutos</MenuItem>))}
            </TextField>
            <Typography className={classes.hint}>Usada no Painel para dizer quantos clientes foram respondidos no prazo e quem está esperando.</Typography>
          </Section>

          <Section icon={<KeyRound size={18} />} title="Integração" sub="Token usado pelas integrações externas (API).">
            <div className={classes.tokenRow}>
              <TextField style={{ flex: "1 1 100%" }} variant="outlined" margin="dense" label="Token da API" value={token} type={showToken ? "text" : "password"} InputProps={{ readOnly: true }} />
              <Button variant="outlined" onClick={() => setShowToken((v) => !v)} startIcon={showToken ? <EyeOff size={15} /> : <Eye size={15} />}>{showToken ? "Ocultar" : "Mostrar"}</Button>
              <Button variant="outlined" disabled={!token} startIcon={<Copy size={15} />} onClick={() => { navigator.clipboard.writeText(token); toast.success("Token copiado."); }}>Copiar</Button>
            </div>
            <Typography className={classes.hint}>Trate como uma senha. Para criar tokens por integração e cadastrar webhooks, use API & Webhooks.</Typography>
          </Section>
        </div>
      </div>
    </MainContainer>
  );
};

export default Settings;
