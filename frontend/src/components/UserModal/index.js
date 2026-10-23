import React, { useState, useEffect, useContext } from "react";
import { accessLevel, isStrictAdmin } from "../../utils/access";

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

const UserSchema = Yup.object().shape({
	name: Yup.string()
		.min(2, "Nome muito curto.")
		.max(50, "Nome muito longo.")
		.required("Informe o nome."),
	password: Yup.string().min(5, "A senha precisa ter ao menos 5 caracteres.").max(50, "Senha muito longa."),
	email: Yup.string().email("Digite um e-mail válido.").required("Informe o e-mail."),
});

const DAYS = [[1, "Seg"], [2, "Ter"], [3, "Qua"], [4, "Qui"], [5, "Sex"], [6, "Sáb"], [0, "Dom"]];
const DEFAULT_WORK = { start: "08:00", end: "17:00", days: [1, 2, 3, 4, 5] };

const UserModal = ({ open, onClose, userId }) => {
	const classes = useStyles();
	// the working hours (used by the management center: who is "in working hours", late alerts): set when the person is created and editable later
	const [work, setWork] = useState(DEFAULT_WORK);

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
				setUser(prevState => {
					return { ...prevState, ...data };
				});
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
		if (!userId) { setWork(DEFAULT_WORK); return; }
		api.get("/analytics/config").then(({ data }) => {
			const mine = (data.schedules || {})[userId] || {};
			const days = Object.keys(mine).filter((d) => (mine[d] || []).length).map(Number);
			if (!days.length) { setWork({ ...DEFAULT_WORK, days: [] }); return; }
			const first = mine[days[0]][0];
			setWork({ start: first.start, end: first.end, days });
		}).catch(() => setWork(DEFAULT_WORK));
	}, [userId, open]);

	// writes the hours of the person in the shared configuration (the same one of the management center)
	const saveWork = async (id) => {
		const { data: cfg } = await api.get("/analytics/config");
		const schedules = { ...(cfg.schedules || {}) };
		const mine = {};
		work.days.forEach((d) => { if (work.start && work.end) mine[d] = [{ start: work.start, end: work.end }]; });
		if (Object.keys(mine).length) schedules[id] = mine; else delete schedules[id];
		await api.put("/analytics/config", { ...cfg, schedules });
	};

	const handleClose = () => {
		onClose();
		setUser(initialState);
	};

	const handleSaveUser = async values => {
		const userData = { ...values, whatsappId, queueIds: selectedQueueIds };
		try {
			let savedId = userId;
			if (userId) {
				await api.put(`/users/${userId}`, userData);
			} else {
				const { data } = await api.post("/users", userData);
				savedId = data && data.id;
			}
			toast.success(i18n.t("userModal.success"));
			if (savedId && values.role === "consultor") {
				try { await saveWork(savedId); } catch (e) { toast.warn("O usuário foi salvo, mas o horário de trabalho não. Defina em Gestão Comercial > Configuração."); }
			}
		} catch (err) {
			toastError(err);
		}
		handleClose();
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
					validationSchema={UserSchema}
					onSubmit={(values, actions) => {
						setTimeout(() => {
							handleSaveUser(values);
							actions.setSubmitting(false);
						}, 400);
					}}
				>
					{({ touched, errors, isSubmitting, values, setFieldValue }) => (
						<Form>
							<DialogContent dividers>
								<div className={classes.multFieldLine}>
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
										name="password"
										variant="outlined"
										margin="dense"
										label={i18n.t("userModal.form.password")}
										error={touched.password && Boolean(errors.password)}
										helperText={touched.password && errors.password}
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
								<div className={classes.multFieldLine}>
									<Field
										as={TextField}
										label={i18n.t("userModal.form.email")}
										name="email"
										error={touched.email && Boolean(errors.email)}
										helperText={touched.email && errors.email}
										variant="outlined"
										margin="dense"
										fullWidth
									/>
									<FormControl
										variant="outlined"
										className={classes.formControl}
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
								</div>
								<TextField
									label="WhatsApp de contato"
									name="phone"
									value={values.phone || ""}
									onChange={(e) => setFieldValue("phone", e.target.value)}
									variant="outlined"
									margin="dense"
									fullWidth
									helperText="É o suporte que os afiliados cadastrados por esta pessoa veem"
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
										<QueueSelect
											selectedQueueIds={selectedQueueIds}
											onChange={values => setSelectedQueueIds(values)}
										/>
									)}
								/>
								<Can
									role={accessLevel(loggedInUser)}
									perform="user-modal:editQueues"
									yes={() => (!loading &&
										<FormControl variant="outlined" margin="dense" className={classes.maxWidth} fullWidth>
											<InputLabel>{i18n.t("userModal.form.whatsapp")}</InputLabel>
											<Field
												as={Select}
												value={whatsappId}
												onChange={(e) => setWhatsappId(e.target.value)}
												label={i18n.t("userModal.form.whatsapp")}
											>
												<MenuItem value={''}>&nbsp;</MenuItem>
												{whatsApps.map((whatsapp) => (
													<MenuItem key={whatsapp.id} value={whatsapp.id}>{whatsapp.name}</MenuItem>
												))}
											</Field>
										</FormControl>
									)}
								/>
								{values.role === "consultor" && (
									<div style={{ marginTop: 14 }}>
										<div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Horário de trabalho</div>
										<div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>Define quando a pessoa deve estar atendendo. Dá para mudar depois, aqui ou em Gestão Comercial.</div>
										<div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
											{DAYS.map(([d, label]) => (
												<Button key={d} size="small" variant={work.days.includes(d) ? "contained" : "outlined"} color="primary" disableElevation style={{ minWidth: 44 }}
													onClick={() => setWork((w) => ({ ...w, days: w.days.includes(d) ? w.days.filter((x) => x !== d) : [...w.days, d] }))}>{label}</Button>
											))}
										</div>
										<div style={{ display: "flex", gap: 8 }}>
											<TextField label="Início" type="time" variant="outlined" margin="dense" InputLabelProps={{ shrink: true }} value={work.start} onChange={(e) => setWork((w) => ({ ...w, start: e.target.value }))} />
											<TextField label="Fim" type="time" variant="outlined" margin="dense" InputLabelProps={{ shrink: true }} value={work.end} onChange={(e) => setWork((w) => ({ ...w, end: e.target.value }))} />
										</div>
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
