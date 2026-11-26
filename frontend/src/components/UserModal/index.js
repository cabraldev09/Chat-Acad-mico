import React, { useState, useEffect, useContext } from "react";
import { accessLevel, isManager, isStrictAdmin } from "../../utils/access";

import * as Yup from "yup";
import { Formik, Form, Field } from "formik";
import { toast } from "react-toastify";

import {
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	CircularProgress,
	Select,
	InputLabel,
	MenuItem,
	FormControl,
	TextField,
	InputAdornment,
	IconButton
  } from '@material-ui/core';

import { Visibility, VisibilityOff } from '@material-ui/icons';

import { makeStyles } from "@material-ui/core/styles";
import { green } from "@material-ui/core/colors";

import { i18n } from "../../translate/i18n";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import QueueSelect from "../QueueSelect";
import { AuthContext } from "../../context/Auth/AuthContext";
import { Can } from "../Can";
import useWhatsApps from "../../hooks/useWhatsApps";
import { dayDefault, standardDays } from "../../utils/workWeek";

const useStyles = makeStyles(theme => ({
	root: {
		display: "flex",
		flexWrap: "wrap",
	},
	multFieldLine: {
		display: "flex",
		"& > *:not(:last-child)": {
			marginRight: theme.spacing(1),
		},
	},

	btnWrapper: {
		position: "relative",
	},

	buttonProgress: {
		color: "#0693E3",
		position: "absolute",
		top: "50%",
		left: "50%",
		marginTop: -12,
		marginLeft: -12,
	},
	formControl: {
		margin: theme.spacing(1),
		minWidth: 120,
	},
}));

// the same rules as the server: a new person needs a password of 8 or more; when editing, an empty field keeps the current one
const userSchema = (isNew) => Yup.object().shape({
	name: Yup.string()
		.trim()
		.min(2, "Nome muito curto.")
		.max(50, "Nome muito longo.")
		.required("Informe o nome."),
	password: isNew
		? Yup.string().min(8, "A senha precisa ter pelo menos 8 caracteres.").max(50, "Senha muito longa.").required("Crie uma senha com pelo menos 8 caracteres.")
		: Yup.string().min(8, "A senha precisa ter pelo menos 8 caracteres.").max(50, "Senha muito longa."),
	email: Yup.string().trim().email("Digite um e-mail válido.").required("Informe o e-mail."),
});

// only the fields of the form go to the server (the screen data of the person, such as sectors or the number objects, stays out)
const FORM_FIELDS = ["name", "email", "password", "profile", "role", "coordArea", "phone"];

const DAYS = [[1, "Seg"], [2, "Ter"], [3, "Qua"], [4, "Qui"], [5, "Sex"], [6, "Sáb"], [0, "Dom"]];
// the hours of the person, day by day (each day its own start and end): starts as the team's week (Mon-Thu 08-18, Fri 08-17)
const DEFAULT_WORK = () => standardDays();
const WITH_HOURS = ["consultor", "tutor", "relacionamento"];
// the official number of the person's side: tutoring for a tutor, the relationship number for the relationship team, attendance otherwise
const officialFor = (role, list) => {
	const cloud = (list || []).filter((w) => w.channel === "whatsapp_cloud");
	const team = role === "tutor" ? "tutoria" : "atendimento";
	return (cloud.find((w) => w.team === team) || cloud.find((w) => !w.team) || cloud[0] || null);
};

// renders nothing: follows the role chosen in the form and picks the official number of that side (while the number was not chosen by hand)
const OfficialNumber = ({ role, whatsApps, current, onPick }) => {
	useEffect(() => {
		const w = officialFor(role, whatsApps);
		if (w && w.id !== current) onPick(w.id);
	}, [role, whatsApps, current, onPick]);
	return null;
};

const UserModal = ({ open, onClose, userId }) => {
	const classes = useStyles();
	// the working hours (used by the management center: who is "in working hours", late alerts): set when the person is created and editable later
	const [work, setWork] = useState(DEFAULT_WORK);
	const workDays = DAYS.map(([d]) => d).filter((d) => (work[d] || []).length);

	const initialState = {
		name: "",
		email: "",
		password: "",
		profile: "user",
		role: "consultor",
		coordArea: "",
		phone: ""
	};

	const { user: loggedInUser } = useContext(AuthContext);
	// the management edits the team; anyone else only opens their own profile (name, phone and password): the e-mail of the
	// login, the role, the sectors, the number and the working hours stay with the management
	const manager = isManager(loggedInUser);

	const [user, setUser] = useState(initialState);
	const [selectedQueueIds, setSelectedQueueIds] = useState([]);
	const [showPassword, setShowPassword] = useState(false);
	const [whatsappId, setWhatsappId] = useState(false);
	const {loading, whatsApps} = useWhatsApps();

	useEffect(() => {
		const fetchUser = async () => {
			if (!userId) return;
			try {
				const { data } = await api.get(`/users/${userId}`);
				// starts from a clean form: nothing of the person opened before stays behind; the password field starts empty (= keep it)
				const loaded = {};
				FORM_FIELDS.forEach((f) => { if (data[f] !== undefined && data[f] !== null) loaded[f] = data[f]; });
				setUser({ ...initialState, ...loaded, password: "" });
				const userQueueIds = data.queues?.map(queue => queue.id);
				setSelectedQueueIds(userQueueIds);
				setWhatsappId(data.whatsappId ? data.whatsappId : '');
			} catch (err) {
				toastError(err);
			}
		};

		fetchUser();
	}, [userId, open]);

	useEffect(() => {
		if (!open) return;
		if (!userId) { setWork(DEFAULT_WORK()); return; }
		// each day as it was saved (also a second interval set in Gestão Comercial is kept)
		api.get("/analytics/config").then(({ data }) => {
			const mine = (data.schedules || {})[userId] || {};
			const days = Object.keys(mine).filter((d) => (mine[d] || []).length);
			setWork(days.length ? Object.fromEntries(DAYS.map(([d]) => [d, (mine[d] || []).map((i) => ({ ...i }))])) : DEFAULT_WORK());
		}).catch(() => setWork(DEFAULT_WORK()));
	}, [userId, open]);

	// writes the hours of the person in the shared configuration (the same one of the management center)
	const saveWork = async (id) => {
		const { data: cfg } = await api.get("/analytics/config");
		const schedules = { ...(cfg.schedules || {}) };
		const mine = {};
		DAYS.forEach(([d]) => { const list = (work[d] || []).filter((i) => i.start && i.end && i.end > i.start); if (list.length) mine[d] = list; });
		if (Object.keys(mine).length) schedules[id] = mine; else delete schedules[id];
		await api.put("/analytics/config", { ...cfg, schedules });
	};

	const toggleDay = (d) => setWork((w) => ({ ...w, [d]: (w[d] || []).length ? [] : [dayDefault(d)] }));
	const setDayTime = (d, key, value) => setWork((w) => { const list = w[d] && w[d].length ? w[d] : [dayDefault(d)]; return { ...w, [d]: [{ ...list[0], [key]: value }, ...list.slice(1)] }; });

	// a new person starts on the official number of their side, until someone picks the number by hand
	const [numberTouched, setNumberTouched] = useState(false);

	const handleClose = () => {
		onClose();
		setUser(initialState);
		setWhatsappId("");
		setNumberTouched(false);
	};

	const handleSaveUser = async values => {
		const userData = { whatsappId, queueIds: selectedQueueIds };
		FORM_FIELDS.forEach((f) => { if (values[f] !== undefined) userData[f] = values[f]; });
		// an empty password when editing means "keep the current one": it is not sent
		if (!String(userData.password || "").trim()) delete userData.password;
		try {
			let savedId = userId;
			if (userId) {
				await api.put(`/users/${userId}`, userData);
			} else {
				const { data } = await api.post("/users", userData);
				savedId = data && data.id;
			}
			toast.success(i18n.t("userModal.success"));
			if (savedId && manager && WITH_HOURS.includes(values.role)) {
				try { await saveWork(savedId); } catch (e) { toast.warn("O usuário foi salvo, mas o horário de trabalho não. Defina em Gestão Comercial > Configuração."); }
			}
			handleClose();
		} catch (err) {
			// the window stays open with what was typed, so the person can fix it and save again
			toastError(err);
		}
	};

	return (
		<div className={classes.root}>
			<Dialog
				open={open}
				onClose={handleClose}
				maxWidth="xs"
				fullWidth
				scroll="paper"
			>
				<DialogTitle id="form-dialog-title">
					{userId
						? `${i18n.t("userModal.title.edit")}`
						: `${i18n.t("userModal.title.add")}`}
				</DialogTitle>
				<Formik
					initialValues={user}
					enableReinitialize={true}
					validationSchema={userSchema(!userId)}
					onSubmit={async (values, actions) => {
						await handleSaveUser(values);
						actions.setSubmitting(false);
					}}
				>
					{({ touched, errors, isSubmitting, values, setFieldValue }) => (
						<Form>
							<DialogContent dividers>
								{!userId && !numberTouched && !loading && <OfficialNumber role={values.role} whatsApps={whatsApps} current={whatsappId} onPick={setWhatsappId} />}
								<Field
										as={TextField}
										label={i18n.t("userModal.form.name")}
										autoFocus
										name="name"
										error={touched.name && Boolean(errors.name)}
										helperText={touched.name && errors.name}
										variant="outlined"
										margin="dense"
										fullWidth
									/>
								<Field
										as={TextField}
										label={i18n.t("userModal.form.email")}
										name="email"
										disabled={!manager}
										error={touched.email && Boolean(errors.email)}
										helperText={(touched.email && errors.email) || (!manager ? "O e-mail de acesso é alterado pela gestão." : "")}
										variant="outlined"
										margin="dense"
										fullWidth
									/>
								<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", columnGap: 8 }}>
									<FormControl
										variant="outlined"
										fullWidth
										margin="dense"
									>
										<Can
											role={accessLevel(loggedInUser)}
											perform="user-modal:editProfile"
											yes={() => (
												<>
													<InputLabel id="profile-selection-input-label">
														{i18n.t("userModal.form.profile")}
													</InputLabel>

													<Field
														as={Select}
														label={i18n.t("userModal.form.profile")}
														name="role"
														labelId="profile-selection-label"
														id="profile-selection"
														required
													>
														{isStrictAdmin(loggedInUser) && <MenuItem value="admin">Administrador (acesso total)</MenuItem>}
														<MenuItem value="coordenacao">Coordenador de polo (gerencia todos os polos)</MenuItem>
														<MenuItem value="consultor">Consultor comercial</MenuItem>
														<MenuItem value="tutor">Tutor (setor acadêmico)</MenuItem>
														<MenuItem value="relacionamento">Relacionamento (pós-venda, número da instituição)</MenuItem>
													</Field>
												</>
											)}
										/>
									</FormControl>
									<Field
										as={TextField}
										name="password"
										variant="outlined"
										margin="dense"
										label={i18n.t("userModal.form.password")}
										error={touched.password && Boolean(errors.password)}
										helperText={(touched.password && errors.password) || (userId ? "Deixe em branco para manter a senha atual." : "Pelo menos 8 caracteres.")}
										autoComplete="new-password"
										type={showPassword ? 'text' : 'password'}
										InputProps={{
										endAdornment: (
											<InputAdornment position="end">
											<IconButton
												aria-label="toggle password visibility"
												onClick={() => setShowPassword((e) => !e)}
											>
												{showPassword ? <VisibilityOff /> : <Visibility />}
											</IconButton>
											</InputAdornment>
										)
										}}
										fullWidth
									/>
								</div>
								<TextField
									label="Celular da pessoa (opcional)"
									name="phone"
									value={values.phone || ""}
									onChange={(e) => setFieldValue("phone", e.target.value)}
									variant="outlined"
									margin="dense"
									fullWidth
									helperText="Para avisos internos. Os afiliados falam com o número oficial e caem direto na conversa desta pessoa."
								/>
								{values.role === "coordenacao" && (
									<FormControl variant="outlined" margin="dense" fullWidth>
										<InputLabel id="coord-area-label">Área de coordenação</InputLabel>
										<Field as={Select} label="Área de coordenação" name="coordArea" labelId="coord-area-label" id="coord-area">
											<MenuItem value="comercial">Comercial</MenuItem>
											<MenuItem value="academica">Acadêmica (opera a Retenção)</MenuItem>
										</Field>
									</FormControl>
								)}
								<Can
									role={accessLevel(loggedInUser)}
									perform="user-modal:editQueues"
									yes={() => (
										<>
											<QueueSelect
												selectedQueueIds={selectedQueueIds}
												onChange={values => setSelectedQueueIds(values)}
											/>
											<div style={{ fontSize: 12, opacity: 0.7, margin: "-2px 2px 4px" }}>As filas dos polos são preenchidas sozinhas em Polos e equipes.</div>
										</>
									)}
								/>
								<Can
									role={accessLevel(loggedInUser)}
									perform="user-modal:editQueues"
									yes={() => (!loading &&
										<FormControl variant="outlined" margin="dense" className={classes.maxWidth} fullWidth>
											<InputLabel>Número que a pessoa usa</InputLabel>
											<Field
												as={Select}
												value={whatsappId}
												onChange={(e) => { setNumberTouched(true); setWhatsappId(e.target.value); }}
												label="Número que a pessoa usa"
											>
												<MenuItem value={''}><em>Nenhum (escolhe a cada conversa)</em></MenuItem>
												{whatsApps.map((whatsapp) => (
													<MenuItem key={whatsapp.id} value={whatsapp.id}>{whatsapp.name}{whatsapp.channel === "whatsapp_cloud" ? " · API oficial" : ""}</MenuItem>
												))}
											</Field>
											<div style={{ fontSize: 12, opacity: 0.7, margin: "4px 2px 0" }}>As conversas novas e os envios desta pessoa saem por este número.</div>
										</FormControl>
									)}
								/>
								{manager && WITH_HOURS.includes(values.role) && (
									<div style={{ marginTop: 14 }}>
										<div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
											<div style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>Horário de trabalho</div>
											<Button size="small" onClick={() => setWork(DEFAULT_WORK())}>Usar o horário da empresa</Button>
										</div>
										<div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>Cada dia com o seu horário. Diz quem está no expediente (distribuição das conversas, alertas e o aviso de fora do horário). Dá para mudar depois, aqui ou em Gestão Comercial.</div>
										<div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
											{DAYS.map(([d, label]) => (
												<Button key={d} size="small" variant={workDays.includes(d) ? "contained" : "outlined"} color="primary" disableElevation style={{ minWidth: 44 }} aria-pressed={workDays.includes(d)}
													onClick={() => toggleDay(d)}>{label}</Button>
											))}
										</div>
										{workDays.map((d) => {
											const slot = (work[d] || [])[0] || dayDefault(d);
											const bad = !(slot.end > slot.start);
											return (
												<div key={d} style={{ display: "grid", gridTemplateColumns: "44px 1fr 1fr", gap: 8, alignItems: "center" }}>
													<span style={{ fontSize: 13, fontWeight: 600 }}>{(DAYS.find((x) => x[0] === d) || [])[1]}</span>
													<TextField label="Início" type="time" variant="outlined" margin="dense" size="small" InputLabelProps={{ shrink: true }} value={slot.start} onChange={(e) => setDayTime(d, "start", e.target.value)} />
													<TextField label="Fim" type="time" variant="outlined" margin="dense" size="small" InputLabelProps={{ shrink: true }} value={slot.end} error={bad} onChange={(e) => setDayTime(d, "end", e.target.value)} />
												</div>
											);
										})}
										{!workDays.length && <div style={{ fontSize: 12, opacity: 0.7 }}>Nenhum dia marcado: a pessoa fica sem horário (não entra no "no expediente").</div>}
									</div>
								)}
							</DialogContent>
							<DialogActions>
								<Button
									onClick={handleClose}
									color="secondary"
									disabled={isSubmitting}
									variant="outlined"
								>
									{i18n.t("userModal.buttons.cancel")}
								</Button>
								<Button
									type="submit"
									color="primary"
									disabled={isSubmitting}
									variant="contained"
									className={classes.btnWrapper}
								>
									{userId
										? `${i18n.t("userModal.buttons.okEdit")}`
										: `${i18n.t("userModal.buttons.okAdd")}`}
									{isSubmitting && (
										<CircularProgress
											size={24}
											className={classes.buttonProgress}
										/>
									)}
								</Button>
							</DialogActions>
						</Form>
					)}
				</Formik>
			</Dialog>
		</div>
	);
};

export default UserModal;
