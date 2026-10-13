import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";

import { makeStyles } from "@material-ui/core/styles";
import {
	Dialog,
	DialogContent,
	DialogTitle,
	Button,
	DialogActions,
	CircularProgress,
	TextField,
	Switch,
	FormControlLabel,
	MenuItem,
	Typography,
	Divider,
	IconButton,
} from "@material-ui/core";
import FileCopyOutlined from "@material-ui/icons/FileCopyOutlined";

import api from "../../services/api";
import { i18n } from "../../translate/i18n";
import toastError from "../../errors/toastError";
import QueueSelect from "../QueueSelect";

const useStyles = makeStyles(theme => ({
	row: { display: "flex", gap: theme.spacing(1), alignItems: "center", flexWrap: "wrap" },
	section: { marginTop: theme.spacing(2) },
	code: {
		fontFamily: "monospace",
		fontSize: 12,
		background: theme.palette.action.hover,
		padding: theme.spacing(1),
		borderRadius: 6,
		wordBreak: "break-all",
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
	},
	hint: { opacity: 0.75 },
}));

const DAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const defaultHours = () => ({
	enabled: false,
	timezone: "America/Sao_Paulo",
	days: {
		0: [],
		1: [{ start: "08:00", end: "18:00" }],
		2: [{ start: "08:00", end: "18:00" }],
		3: [{ start: "08:00", end: "18:00" }],
		4: [{ start: "08:00", end: "18:00" }],
		5: [{ start: "08:00", end: "18:00" }],
		6: [],
	},
});

const parse = (text, fallback) => {
	try {
		return text ? JSON.parse(text) : fallback;
	} catch (e) {
		return fallback;
	}
};

const Copyable = ({ text }) => {
	const classes = useStyles();
	return (
		<div className={classes.code}>
			<span>{text}</span>
			<IconButton
				size="small"
				onClick={() => {
					navigator.clipboard?.writeText(text);
					toast.success("Copiado");
				}}
			>
				<FileCopyOutlined fontSize="small" />
			</IconButton>
		</div>
	);
};

const WhatsAppModal = ({ open, onClose, whatsAppId }) => {
	const classes = useStyles();
	const initialState = {
		name: "",
		greetingMessage: "",
		farewellMessage: "",
		outOfHoursMessage: "",
		isDefault: false,
		channel: "whatsapp",
	};
	const [whatsApp, setWhatsApp] = useState(initialState);
	const [config, setConfig] = useState({});
	const [hours, setHours] = useState(defaultHours());
	const [selectedQueueIds, setSelectedQueueIds] = useState([]);
	const [channels, setChannels] = useState([]);
	const [info, setInfo] = useState(null);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		if (!open) return;
		api.get("/channels").then(({ data }) => setChannels(data)).catch(() => {});
	}, [open]);

	useEffect(() => {
		if (!open || !whatsAppId) return;
		const fetchSession = async () => {
			try {
				const { data } = await api.get(`whatsapp/${whatsAppId}`);
				setWhatsApp({ ...initialState, ...data });
				setConfig(parse(data.config, {}));
				setHours(parse(data.businessHours, defaultHours()));
				setSelectedQueueIds(data.queues?.map(queue => queue.id) || []);
				if (data.channel !== "whatsapp") {
					api.get(`/channels/${whatsAppId}/info`).then(({ data: i }) => setInfo(i)).catch(() => {});
				}
			} catch (err) {
				toastError(err);
			}
		};
		fetchSession();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [whatsAppId, open]);

	const channelDef = channels.find(c => c.type === whatsApp.channel);

	const handleClose = () => {
		onClose();
		setWhatsApp(initialState);
		setConfig({});
		setHours(defaultHours());
		setSelectedQueueIds([]);
		setInfo(null);
	};

	const handleSave = async () => {
		if (!whatsApp.name || whatsApp.name.length < 2) {
			toast.error("Informe um nome");
			return;
		}
		const payload = {
			name: whatsApp.name,
			isDefault: whatsApp.isDefault,
			greetingMessage: whatsApp.greetingMessage,
			farewellMessage: whatsApp.farewellMessage,
			outOfHoursMessage: whatsApp.outOfHoursMessage,
			businessHours: JSON.stringify(hours),
			queueIds: selectedQueueIds,
		};
		if (!whatsAppId) payload.channel = whatsApp.channel;
		if (whatsApp.channel !== "whatsapp") payload.config = JSON.stringify(config);

		setSaving(true);
		try {
			if (whatsAppId) {
				await api.put(`/whatsapp/${whatsAppId}`, payload);
			} else {
				await api.post("/whatsapp", payload);
			}
			toast.success(i18n.t("whatsappModal.success"));
			handleClose();
		} catch (err) {
			toastError(err);
		} finally {
			setSaving(false);
		}
	};

	const setDay = (d, on) =>
		setHours({
			...hours,
			days: { ...hours.days, [d]: on ? [{ start: "08:00", end: "18:00" }] : [] },
		});
	const setDayTime = (d, key, value) =>
		setHours({
			...hours,
			days: { ...hours.days, [d]: [{ ...(hours.days[d][0] || {}), [key]: value }] },
		});

	return (
		<Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth scroll="paper">
			<DialogTitle>
				{whatsAppId ? i18n.t("whatsappModal.title.edit") : i18n.t("whatsappModal.title.add")}
			</DialogTitle>
			<DialogContent dividers>
				<div className={classes.row}>
					<TextField
						label={i18n.t("whatsappModal.form.name")}
						autoFocus
						value={whatsApp.name || ""}
						onChange={e => setWhatsApp({ ...whatsApp, name: e.target.value })}
						variant="outlined"
						margin="dense"
						style={{ flex: 1, minWidth: 200 }}
					/>
					<FormControlLabel
						control={
							<Switch
								color="primary"
								checked={!!whatsApp.isDefault}
								onChange={e => setWhatsApp({ ...whatsApp, isDefault: e.target.checked })}
							/>
						}
						label={i18n.t("whatsappModal.form.default")}
					/>
				</div>

				<TextField
					select
					fullWidth
					disabled={!!whatsAppId}
					label="Canal"
					variant="outlined"
					margin="dense"
					value={whatsApp.channel || "whatsapp"}
					onChange={e => {
						setWhatsApp({ ...whatsApp, channel: e.target.value });
						setConfig({});
					}}
					helperText={whatsAppId ? "O canal não pode ser alterado depois de criado." : undefined}
				>
					{channels.map(c => (
						<MenuItem key={c.type} value={c.type}>{c.label}</MenuItem>
					))}
				</TextField>

				{channelDef && channelDef.fields.length > 0 && (
					<div className={classes.section}>
						<Typography variant="subtitle2">Credenciais do canal</Typography>
						{channelDef.fields.map(f => (
							<TextField
								key={f.key}
								fullWidth
								variant="outlined"
								margin="dense"
								label={f.label}
								type={f.secret ? "password" : "text"}
								autoComplete="off"
								value={config[f.key] || ""}
								onChange={e => setConfig({ ...config, [f.key]: e.target.value })}
							/>
						))}
					</div>
				)}

				{info && info.webhookUrl && (
					<div className={classes.section}>
						<Typography variant="subtitle2">URL do webhook (cole no painel da Meta)</Typography>
						<Copyable text={info.webhookUrl} />
						<Typography variant="caption" className={classes.hint} display="block" style={{ marginTop: 4 }}>
							A Meta exige HTTPS público. Em localhost use um túnel (ex.: cloudflared) e defina PUBLIC_URL no backend/.env.
							Atualmente: {info.publicUrl}
						</Typography>
					</div>
				)}
				{info && info.snippet && (
					<div className={classes.section}>
						<Typography variant="subtitle2">Código para colar no seu site</Typography>
						<Copyable text={info.snippet} />
						<Typography variant="caption" className={classes.hint} display="block" style={{ marginTop: 4 }}>
							Teste agora: <a href={info.demoUrl} target="_blank" rel="noreferrer">{info.demoUrl}</a>
						</Typography>
					</div>
				)}

				<Divider className={classes.section} />

				<TextField
					label={i18n.t("queueModal.form.greetingMessage")}
					multiline
					rows={4}
					fullWidth
					value={whatsApp.greetingMessage || ""}
					onChange={e => setWhatsApp({ ...whatsApp, greetingMessage: e.target.value })}
					variant="outlined"
					margin="dense"
				/>
				<TextField
					label={i18n.t("whatsappModal.form.farewellMessage")}
					multiline
					rows={3}
					fullWidth
					value={whatsApp.farewellMessage || ""}
					onChange={e => setWhatsApp({ ...whatsApp, farewellMessage: e.target.value })}
					variant="outlined"
					margin="dense"
				/>
				<QueueSelect
					selectedQueueIds={selectedQueueIds}
					onChange={selectedIds => setSelectedQueueIds(selectedIds)}
				/>

				<div className={classes.section}>
					<FormControlLabel
						control={
							<Switch
								color="primary"
								checked={!!hours.enabled}
								onChange={e => setHours({ ...hours, enabled: e.target.checked })}
							/>
						}
						label="Horário de atendimento"
					/>
					{hours.enabled && (
						<>
							<TextField
								fullWidth
								variant="outlined"
								margin="dense"
								label="Fuso horário"
								value={hours.timezone || ""}
								onChange={e => setHours({ ...hours, timezone: e.target.value })}
								helperText="Ex.: America/Sao_Paulo"
							/>
							{DAYS.map((label, d) => {
								const interval = (hours.days[d] || [])[0];
								return (
									<div key={d} className={classes.row}>
										<FormControlLabel
											style={{ width: 120 }}
											control={
												<Switch size="small" color="primary" checked={!!interval} onChange={e => setDay(d, e.target.checked)} />
											}
											label={label}
										/>
										{interval && (
											<>
												<TextField type="time" size="small" variant="outlined" value={interval.start} onChange={e => setDayTime(d, "start", e.target.value)} />
												<span>às</span>
												<TextField type="time" size="small" variant="outlined" value={interval.end} onChange={e => setDayTime(d, "end", e.target.value)} />
											</>
										)}
									</div>
								);
							})}
							<TextField
								label="Mensagem fora do horário"
								multiline
								rows={3}
								fullWidth
								value={whatsApp.outOfHoursMessage || ""}
								onChange={e => setWhatsApp({ ...whatsApp, outOfHoursMessage: e.target.value })}
								variant="outlined"
								margin="dense"
								helperText="Enviada uma vez a cada 6 horas por atendimento. Fora do horário o chatbot e a IA ficam em silêncio."
							/>
						</>
					)}
				</div>
			</DialogContent>
			<DialogActions>
				<Button onClick={handleClose} color="secondary" disabled={saving} variant="outlined">
					{i18n.t("whatsappModal.buttons.cancel")}
				</Button>
				<Button onClick={handleSave} color="primary" disabled={saving} variant="contained">
					{whatsAppId ? i18n.t("whatsappModal.buttons.okEdit") : i18n.t("whatsappModal.buttons.okAdd")}
					{saving && <CircularProgress size={20} style={{ marginLeft: 8 }} />}
				</Button>
			</DialogActions>
		</Dialog>
	);
};

export default React.memo(WhatsAppModal);
