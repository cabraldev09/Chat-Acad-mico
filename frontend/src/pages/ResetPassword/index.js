import React, { useEffect, useState } from "react";
import { Link as RouterLink, useHistory, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { Button, IconButton, InputAdornment, Link, TextField } from "@material-ui/core";
import { Visibility, VisibilityOff } from "@material-ui/icons";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import AuthCard from "../ForgotPassword/AuthCard";

// the page the e-mail link opens: choose the new password
const ResetPassword = () => {
  const { token } = useParams();
  const history = useHistory();
  const [valid, setValid] = useState(null);
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/auth/reset/${token}`).then(({ data }) => setValid(!!data.valid)).catch(() => setValid(false));
  }, [token]);

  const ok = password.length >= 8 && password === again;
  const submit = async (e) => {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    try {
      await api.post("/auth/reset", { token, password });
      toast.success("Senha criada. Entre com a nova senha.");
      history.replace("/login");
    } catch (err) { toastError(err); }
    setBusy(false);
  };

  if (valid === null) return <AuthCard title="Um instante..." />;
  if (!valid) {
    return (
      <AuthCard title="Este link não vale mais" subtitle="Ele já foi usado ou passou de 30 minutos. Peça um novo link para criar a senha.">
        <div style={{ textAlign: "center", marginTop: 18 }}>
          <Button component={RouterLink} to="/esqueci-a-senha" variant="contained" color="primary">Pedir um novo link</Button>
        </div>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Criar uma nova senha" subtitle="Use pelo menos 8 caracteres.">
      <form onSubmit={submit} noValidate>
        <TextField variant="outlined" margin="dense" fullWidth autoFocus label="Nova senha" type={show ? "text" : "password"} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)}
          InputProps={{ endAdornment: <InputAdornment position="end"><IconButton size="small" aria-label="mostrar ou ocultar senha" onClick={() => setShow((v) => !v)}>{show ? <VisibilityOff /> : <Visibility />}</IconButton></InputAdornment> }} />
        <TextField variant="outlined" margin="dense" fullWidth label="Repita a nova senha" type={show ? "text" : "password"} autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)}
          error={again.length > 0 && again !== password} helperText={again.length > 0 && again !== password ? "As senhas não são iguais." : ""} />
        <Button type="submit" fullWidth variant="contained" color="primary" disabled={busy || !ok} style={{ marginTop: 14 }}>Salvar a nova senha</Button>
        <div style={{ textAlign: "center", marginTop: 18, fontSize: 14 }}>
          <Link component={RouterLink} to="/login" underline="always">Voltar para o login</Link>
        </div>
      </form>
    </AuthCard>
  );
};

export default ResetPassword;
