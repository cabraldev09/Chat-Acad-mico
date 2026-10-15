import React, { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Button, Link, TextField } from "@material-ui/core";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import AuthCard from "./AuthCard";

// "Esqueci minha senha": the answer is the same for every address, so nobody can find out who has an account
const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return;
    setBusy(true);
    try {
      await api.post("/auth/forgot", { email: email.trim() });
      setSent(true);
    } catch (err) { toastError(err); }
    setBusy(false);
  };

  if (sent) {
    return (
      <AuthCard title="Confira o seu e-mail" subtitle={`Se ${email.trim()} tem cadastro, enviamos um link para criar uma nova senha. Ele vale por 30 minutos. Olhe também a caixa de spam.`}>
        <div style={{ textAlign: "center", marginTop: 18 }}>
          <Link component={RouterLink} to="/login" underline="always">Voltar para o login</Link>
        </div>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Esqueci minha senha" subtitle="Digite o e-mail do seu cadastro. Enviamos um link para você criar uma nova senha.">
      <form onSubmit={submit} noValidate>
        <TextField variant="outlined" margin="dense" fullWidth autoFocus required label="E-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit" fullWidth variant="contained" color="primary" disabled={busy || !/^\S+@\S+\.\S+$/.test(email.trim())} style={{ marginTop: 14 }}>
          Enviar o link
        </Button>
        <div style={{ textAlign: "center", marginTop: 18, fontSize: 14 }}>
          <Link component={RouterLink} to="/login" underline="always">Voltar para o login</Link>
        </div>
      </form>
    </AuthCard>
  );
};

export default ForgotPassword;
