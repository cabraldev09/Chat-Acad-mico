import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Typography, CircularProgress, IconButton, InputAdornment } from "@material-ui/core";
import { FileCopyOutlined } from "@material-ui/icons";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import ChannelIcon from "../../components/ChannelIcon";

const copy = async text => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copiado.");
  } catch (e) {
    toast.info(text);
  }
};

const CopyField = ({ label, value }) => (
  <TextField fullWidth variant="outlined" margin="dense" label={label} value={value || ""} InputProps={{
    readOnly: true,
    endAdornment: (
      <InputAdornment position="end">
        <IconButton size="small" aria-label={`Copiar ${label}`} onClick={() => copy(value)}><FileCopyOutlined fontSize="small" /></IconButton>
      </InputAdornment>
    ),
  }} />
);

// the name of the field in the Meta panel (not translated)
const WEBHOOK_FIELD = "messages";

const STEPS = [
  <>Acesse <b>developers.facebook.com</b>, entre com sua conta e clique em <b>Meus apps → Criar app</b> (tipo <b>Empresa</b>).</>,
  <>No app, adicione o produto <b>Instagram</b> e abra <b>Configuração da API com login do Instagram</b>. Copie o <b>ID do app do Instagram</b> e a <b>Chave secreta do app do Instagram</b> para os campos abaixo.</>,
  <>Em <b>Configurar webhooks</b>, cole a <b>URL de callback</b> e o <b>Token de verificação</b> abaixo, confirme e ative o campo <b>{WEBHOOK_FIELD}</b>.</>,
  <>Em <b>Configurar login empresarial</b>, cole a <b>URL de redirecionamento OAuth</b> abaixo.</>,
  <>Em <b>Funções do app</b>, adicione como testadores as contas do Instagram que vão conectar (a conta precisa ser <b>Profissional</b>). Para contas de outras pessoas, envie o app para revisão da Meta.</>,
];

// Anyone signed in connects their own Instagram by logging in with it. The Meta app behind the login is registered once, by a manager.
const InstagramDialog = ({ open, onClose, canConfigure, whatsApp }) => {
  const [info, setInfo] = useState(null);
  const [app, setApp] = useState(null);
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [setup, setSetup] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/channels/instagram/status");
      setInfo(data);
      if (canConfigure) {
        const { data: a } = await api.get("/channels/instagram/app");
        setApp(a);
        setAppId(a.appId || "");
        setAppSecret(a.appSecret || "");
        setSetup(!a.configured);
      }
    } catch (err) {
      toastError(err);
    }
  }, [canConfigure]);

  useEffect(() => {
    if (open) {
      setInfo(null);
      load();
    }
  }, [open, load]);

  const login = async () => {
    setBusy(true);
    try {
      const { data } = await api.get("/channels/instagram/authorize", { params: whatsApp ? { whatsappId: whatsApp.id } : {} });
      window.location.href = data.url;
    } catch (err) {
      toastError(err);
      setBusy(false);
    }
  };

  const saveApp = async () => {
    setBusy(true);
    try {
      const { data } = await api.put("/channels/instagram/app", { appId, appSecret });
      setApp(data);
      setAppSecret(data.appSecret || "");
      setInfo(i => ({ ...(i || {}), configured: data.configured }));
      setSetup(!data.configured);
      toast.success("App da Meta salvo.");
    } catch (err) {
      toastError(err);
    }
    setBusy(false);
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><ChannelIcon channel="instagram" size={22} />{whatsApp ? "Entrar de novo no Instagram" : "Conectar meu Instagram"}</span>
      </DialogTitle>
      <DialogContent>
        {!info ? (
          <div style={{ textAlign: "center", padding: 24 }}><CircularProgress size={28} /></div>
        ) : (
          <>
            {info.configured ? (
              <Typography variant="body2" color="textSecondary" gutterBottom>
                Você vai entrar no Instagram e autorizar o acesso às mensagens. Depois disso as conversas do Direct chegam aqui, sem copiar chaves. A conta precisa ser <b>Profissional</b> (Comercial ou Criador). A conexão se renova sozinha; se o Instagram pedir a senha de novo, o sistema avisa.
              </Typography>
            ) : (
              <Typography variant="body2" color="textSecondary" gutterBottom>
                {info.canConfigure
                  ? "Falta um passo único: cadastrar o app da Meta deste sistema. Depois disso, qualquer pessoa conecta o próprio Instagram só entrando com a conta."
                  : "O app da Meta ainda não foi cadastrado. Peça ao administrador para fazer a configuração única em Conexões > Conectar Instagram."}
              </Typography>
            )}

            {canConfigure && app && (
              <div style={{ marginTop: 8 }}>
                <Button size="small" color="primary" onClick={() => setSetup(s => !s)}>{setup ? "Ocultar configuração do app da Meta" : "Configuração do app da Meta (administrador)"}</Button>
                {setup && (
                  <div style={{ marginTop: 8 }}>
                    <ol style={{ paddingLeft: 20, margin: "0 0 12px", fontSize: 13.5, lineHeight: 1.55 }}>
                      {STEPS.map((s, i) => <li key={i} style={{ marginBottom: 4 }}>{s}</li>)}
                    </ol>
                    {!app.publicUrlIsHttps && (
                      <Typography variant="body2" color="error" gutterBottom>Atenção: o endereço público do sistema não é https. A Meta só aceita https; defina PUBLIC_URL com o endereço do servidor.</Typography>
                    )}
                    <CopyField label="URL de callback do webhook" value={app.webhookUrl} />
                    <CopyField label="Token de verificação" value={app.verifyToken || "(gerado ao salvar)"} />
                    <CopyField label="URL de redirecionamento OAuth" value={app.redirectUri} />
                    <TextField fullWidth variant="outlined" margin="dense" label="ID do app do Instagram" value={appId} onChange={e => setAppId(e.target.value)} />
                    <TextField fullWidth variant="outlined" margin="dense" label="Chave secreta do app do Instagram" type="password" value={appSecret} onChange={e => setAppSecret(e.target.value)} helperText="Guardada criptografada. Deixe como está para manter a atual." />
                    <Button variant="outlined" color="primary" onClick={saveApp} disabled={busy || !appId || !appSecret}>Salvar app da Meta</Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="secondary" onClick={onClose} disabled={busy}>Fechar</Button>
        <Button variant="contained" color="primary" onClick={login} disabled={busy || !info || !info.configured}>
          {busy ? <CircularProgress size={18} /> : "Entrar com o Instagram"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default InstagramDialog;
