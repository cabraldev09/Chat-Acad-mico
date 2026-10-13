import React, { useState } from "react";
import * as Yup from "yup";
import { useHistory, Link as RouterLink } from "react-router-dom";
import { toast } from "react-toastify";
import { Formik, Form, Field } from "formik";
import { Button, TextField, Typography, InputAdornment, IconButton, Link, CircularProgress } from "@material-ui/core";
import { Visibility, VisibilityOff } from "@material-ui/icons";
import { makeStyles, useTheme } from "@material-ui/core/styles";

import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import BrandLogo from "../../components/BrandLogo";

const useStyles = makeStyles((theme) => ({
  root: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing(3),
    backgroundColor: theme.palette.background.default,
    backgroundImage:
      theme.palette.type === "dark"
        ? "radial-gradient(900px 500px at 50% -10%, rgba(6,147,227,.16), transparent 70%)"
        : "radial-gradient(900px 500px at 50% -10%, rgba(11,66,121,.10), transparent 70%)",
  },
  card: {
    width: "100%",
    maxWidth: 440,
    padding: theme.spacing(5, 4.5, 4),
    borderRadius: 20,
    backgroundColor: theme.palette.background.paper,
    border: `1px solid ${theme.palette.divider}`,
    boxShadow: "0 24px 60px -24px rgba(11,66,121,.28)",
    [theme.breakpoints.down("xs")]: { padding: theme.spacing(4, 2.5, 3) },
  },
  logo: { margin: "0 auto", marginBottom: theme.spacing(3), alignSelf: "center" },
  title: { textAlign: "center", fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" },
  subtitle: { textAlign: "center", color: theme.palette.text.secondary, marginTop: 4, marginBottom: theme.spacing(3), fontSize: 14.5 },
  submit: { marginTop: theme.spacing(3), height: 46, fontSize: 15 },
  foot: { marginTop: theme.spacing(2.5), textAlign: "center", fontSize: 14, color: theme.palette.text.secondary },
}));

const UserSchema = Yup.object().shape({
  name: Yup.string().trim().min(2, "Informe o nome completo.").max(60, "Nome muito longo.").required("Informe seu nome."),
  email: Yup.string().trim().email("Digite um e-mail válido.").required("Informe seu e-mail."),
  password: Yup.string().min(5, "A senha precisa ter ao menos 5 caracteres.").max(60, "Senha muito longa.").required("Crie uma senha."),
});

const SignUp = () => {
  const classes = useStyles();
  const theme = useTheme();
  const history = useHistory();
  const [showPassword, setShowPassword] = useState(false);

  const handleSignUp = async (values, actions) => {
    try {
      await api.post("/auth/signup", values);
      toast.success(i18n.t("signup.toasts.success"));
      history.push("/login");
    } catch (err) {
      toastError(err);
    }
    actions.setSubmitting(false);
  };

  return (
    <div className={classes.root}>
      <div className={classes.card}>
        <BrandLogo tone={theme.palette.type === "dark" ? "white" : "color"} height={76} className={classes.logo} />
        <Typography component="h1" className={classes.title}>
          {i18n.t("signup.title")}
        </Typography>
        <Typography className={classes.subtitle}>Preencha os dados para acessar o painel de atendimento.</Typography>

        <Formik initialValues={{ name: "", email: "", password: "" }} validationSchema={UserSchema} onSubmit={handleSignUp}>
          {({ touched, errors, isSubmitting }) => (
            <Form noValidate>
              <Field
                as={TextField}
                name="name"
                label={i18n.t("signup.form.name")}
                variant="outlined"
                margin="dense"
                fullWidth
                autoFocus
                autoComplete="name"
                error={touched.name && Boolean(errors.name)}
                helperText={touched.name && errors.name}
              />
              <Field
                as={TextField}
                name="email"
                type="email"
                label={i18n.t("signup.form.email")}
                variant="outlined"
                margin="dense"
                fullWidth
                autoComplete="email"
                error={touched.email && Boolean(errors.email)}
                helperText={touched.email && errors.email}
              />
              <Field
                as={TextField}
                name="password"
                label={i18n.t("signup.form.password")}
                variant="outlined"
                margin="dense"
                fullWidth
                autoComplete="new-password"
                type={showPassword ? "text" : "password"}
                error={touched.password && Boolean(errors.password)}
                helperText={(touched.password && errors.password) || "Mínimo de 5 caracteres."}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton size="small" aria-label="mostrar ou ocultar senha" onClick={() => setShowPassword((v) => !v)}>
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              <Button type="submit" fullWidth variant="contained" color="primary" className={classes.submit} disabled={isSubmitting}>
                {isSubmitting ? <CircularProgress size={20} color="inherit" /> : i18n.t("signup.buttons.submit")}
              </Button>
              <div className={classes.foot}>
                <Link component={RouterLink} to="/login" underline="always">
                  {i18n.t("signup.buttons.login")}
                </Link>
              </div>
            </Form>
          )}
        </Formik>
      </div>
    </div>
  );
};

export default SignUp;
