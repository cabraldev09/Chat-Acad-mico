import TimezoneSelect from "../TimezoneSelect";
import React, { useState, useEffect, useContext } from "react";
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
import { AuthContext } from "../../context/Auth/AuthContext";
import { isManager } from "../../utils/access";

const WEBHOOK_OUTCOME = {
	recebido: "chegou ao sistema",
	assinatura_invalida: "recusada",
	sem_app_secret: "recusada",
	numero_diferente: "ignorada",
	verificacao_ok: "verificação aceita",
	verificacao_recusada: "verificação recusada",
};
// the last time the Meta called this connection and what became of it, in words
const webhookLine = w => {
	if (!w) return "Nenhuma mensagem chegou da Meta desde que o servidor ligou. Se você já mandou uma mensagem, a Meta não está enviando: confira o campo messages do webhook e se o app está publicado.";
	const when = new Date(w.at).toLocaleString("pt-BR", { timeZone: "America/Porto_Velho" });
	return `${when}: ${WEBHOOK_OUTCOME[w.outcome] || w.outcome}${w.detail ? ` (${w.detail})` : ""}.`;
};

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
	timezone: "America/Porto_Velho",
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

// a stored value of another shape (an old format, {}) must not break the editor: every day exists
const mergeHours = (value) => {
	const base = defaultHours();
	const v = value && typeof value === "object" ? value : {};
	return { ...base, ...v, days: { ...base.days, ...(v.days && typeof v.days === "object" ? v.days : {}) } };
};

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
			<IconButton aria-label="Copiar"
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

const WhatsAppModal = ({ open, onClose, whatsAppId, onCreated }) => {
	const classes = useStyles();
	const { user } = useContext(AuthContext);
	const initialState = {
		name: "",
		greetingMessage: "",
		farewellMessage: "",
		outOfHoursMessage: "",
		isDefault: false,
		channel: "whatsapp",
	};
	const [whatsApp, setWhatsApp] = useState(initialState);
	const [pairingPhone, setPairingPhone] = useState("");
	const [config, setConfig] = useState({});
	const [hours, setHours] = useState(defaultHours());
	const [selectedQueueIds, setSelectedQueueIds] = useState([]);
	// the AI agent that answers on this connection (the same agent can serve several connections)
	const [agents, setAgents] = useState([]);
	const [agentId, setAgentId] = useState("");
	const [channels, setChannels] = useState([]);
	const [info, setInfo] = useState(null);
	const [safety, setSafety] = useState(null);
	const [groupList, setGroupList] = useState(null);
	const [allowed, setAllowed] = useState([]);
	const [loadingGroups, setLoadingGroups] = useState(false);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		if (!open) return;
		api.get("/channels").then(({ data }) => setChannels(data)).catch(() => {});
	}, [open]);

	const agentConnections = a => [...new Set([a.whatsappId, ...(a.whatsappIds || [])].filter(Boolean).map(Number))];
	useEffect(() => {
		if (!open) return;
		api
			.get("/ai-agents")
			.then(({ data }) => {
				const list = Array.isArray(data) ? data : [];
				setAgents(list);
				const mine = whatsAppId ? list.find(a => agentConnections(a).includes(Number(whatsAppId))) : null;
				setAgentId(mine ? mine.id : "");
			})
			.catch(() => setAgents([]));
	}, [open, whatsAppId]);

	// the chosen agent gets this connection in its list, and the others lose it
	const syncAgent = async connectionId => {
		for (const a of agents) {
			const ids = agentConnections(a);
			const has = ids.includes(Number(connectionId));
			const want = a.id === agentId;
			if (has !== want) {
				// eslint-disable-next-line no-await-in-loop
				await api.put(`/ai-agents/${a.id}`, { whatsappIds: want ? [...ids, Number(connectionId)] : ids.filter(x => x !== Number(connectionId)), whatsappId: null });
			}
		}
	};

	useEffect(() => {
		if (!open || !whatsAppId) return;
		const fetchSession = async () => {
			try {
				const { data } = await api.get(`whatsapp/${whatsAppId}`);
				setWhatsApp({ ...initialState, ...data });
				setConfig(parse(data.config, {}));
				setHours(mergeHours(parse(data.businessHours, defaultHours())));
				setSelectedQueueIds(data.queues?.map(queue => queue.id) || []);
				try {
					setAllowed(data.allowedGroups ? JSON.parse(data.allowedGroups) : []);
				} catch (e) {
					setAllowed([]);
				}
				if (data.channel !== "whatsapp") {
					api.get(`/channels/${whatsAppId}/info`).then(({ data: i }) => setInfo(i)).catch(() => {});
				} else {
					api.get(`/channels/${whatsAppId}/safety`).then(({ data: s }) => setSafety(s)).catch(() => {});
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
		setAgentId("");
		setInfo(null);
		setPairingPhone("");
		setSafety(null);
		setGroupList(null);
		setAllowed([]);
	};

	const loadGroups = async () => {
		setLoadingGroups(true);
		try {
			const { data } = await api.get(`/channels/${whatsAppId}/groups`);
			setGroupList(data.groups);
			if (!data.supported) toast.info("Este canal não lista grupos.");
		} catch (err) {
			toastError(err);
		}
		setLoadingGroups(false);
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
			riskMode: whatsApp.riskMode,
			groupsMode: whatsApp.groupsMode || "off",
			...(isManager(user) ? { aiFirst: !!whatsApp.aiFirst } : {}),
			allowedGroups: allowed,
			businessHours: JSON.stringify(hours),
			queueIds: selectedQueueIds,
		};
		if (!whatsAppId) payload.channel = whatsApp.channel;
		if (whatsApp.channel !== "whatsapp") payload.config = JSON.stringify(config);

		setSaving(true);
		let createdNow = null;
		try {
			if (whatsAppId) {
				await api.put(`/whatsapp/${whatsAppId}`, payload);
			} else {
				const { data: created } = await api.post("/whatsapp", { ...payload, ...(pairingPhone.replace(/\D/g, "") ? { pairingPhone } : {}) });
				createdNow = created;
			}
			if (agents.length) {
				try {
					await syncAgent(whatsAppId || (createdNow && createdNow.id));
				} catch (err) {
					toast.warn("A conexão foi salva, mas não deu para ligar o agente de IA a ela. Faça em Agentes de IA → Ajustes.");
				}
			}
			toast.success(i18n.t("whatsappModal.success"));
			handleClose();
			// a new WhatsApp number: the window with the QR Code (or the pairing code) opens at once
			if (createdNow && createdNow.channel === "whatsapp" && onCreated) onCreated(createdNow);
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
			days: { ...hours.days, [d]: [{ ...((hours.days[d] || [])[0] || {}), [key]: value }] },
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

				{!!whatsAppId && !!whatsApp.ownerId && isManager(user) && (
					<div className={classes.section}>
						<FormControlLabel
							control={
								<Switch
									color="primary"
									checked={!!whatsApp.aiFirst}
									onChange={e => setWhatsApp({ ...whatsApp, aiFirst: e.target.checked })}
								/>
							}
							label="Agente de IA atende primeiro (número de atendimento)"
						/>
						<div style={{ fontSize: 12, opacity: 0.75, marginTop: -4 }}>
							Este é um número pessoal: por padrão, toda conversa nova vai direto para o dono e o agente de IA não responde. Ligado, o agente atende
							os contatos novos primeiro e o dono acompanha ou assume quando quiser. Ligue só em número usado para atendimento.
						</div>
					</div>
				)}

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

				{!whatsAppId && (whatsApp.channel || "whatsapp") === "whatsapp" && (
					<TextField
						label="Número para conectar com código (opcional)"
						value={pairingPhone}
						onChange={e => setPairingPhone(e.target.value)}
						variant="outlined"
						margin="dense"
						fullWidth
						placeholder="69 99999-9999"
						helperText="Preencha para conectar com um código de 8 letras digitado no celular, sem ler QR Code."
					/>
				)}

				{(whatsApp.channel || "whatsapp") === "whatsapp" && (
					<div className={classes.section}>
						<Typography variant="subtitle2">Proteção contra bloqueio (conexão não oficial)</Typography>
						<Typography variant="caption" className={classes.hint} display="block">
							Esta conexão usa o WhatsApp Web (QR Code), que não é oficial. Para reduzir o risco de banimento o sistema
							simula digitação nas respostas automáticas, limita o ritmo de envio, respeita pedidos de SAIR, aquece números
							novos e pausa as campanhas se a sessão cair.
						</Typography>
						<TextField
							select
							fullWidth
							variant="outlined"
							margin="dense"
							label="Modo de segurança"
							value={whatsApp.riskMode || "strict"}
							onChange={e => setWhatsApp({ ...whatsApp, riskMode: e.target.value })}
							helperText={
								(whatsApp.riskMode || "strict") === "strict"
									? "Recomendado: campanhas só para contatos que já responderam."
									: "Atenção: permite disparo a contatos novos (limite diário reduzido). Risco maior de banimento."
							}
						>
							<MenuItem value="strict">Seguro (recomendado)</MenuItem>
							<MenuItem value="relaxed">Flexível (aceito o risco)</MenuItem>
						</TextField>
						{safety && (
							<Typography variant="caption" display="block" style={{ marginTop: 4 }}>
								Número conectado há {safety.ageDays} dia(s) · campanhas hoje: {safety.sentToday}/{safety.dailyLimit} ·
								falhas seguidas: {safety.failuresInRow} · máximo {safety.perMinute} msgs/min
							</Typography>
						)}
					</div>
				)}

				{(whatsApp.channel || "whatsapp") === "whatsapp" && (
					<div className={classes.section}>
						<Typography variant="subtitle2">Grupos do WhatsApp</Typography>
						<TextField
							select
							fullWidth
							variant="outlined"
							margin="dense"
							label="Receber mensagens de grupos"
							value={whatsApp.groupsMode || "off"}
							onChange={e => setWhatsApp({ ...whatsApp, groupsMode: e.target.value })}
							helperText={
								{
									off: "Recomendado: grupos pessoais e de promoções não entram no atendimento.",
									selected: "Só os grupos marcados abaixo viram conversas (ex.: grupos de alunos ou de tutores).",
									all: "Todos os grupos do número viram conversas. Pode lotar a caixa de entrada.",
								}[whatsApp.groupsMode || "off"]
							}
						>
							<MenuItem value="off">Nenhum grupo</MenuItem>
							<MenuItem value="selected">Somente grupos escolhidos</MenuItem>
							<MenuItem value="all">Todos os grupos</MenuItem>
						</TextField>
						{(whatsApp.groupsMode || "off") === "selected" && (
							<div style={{ marginTop: 6 }}>
								{!whatsAppId ? (
									<Typography variant="caption">Salve a conexão e conecte o número para escolher os grupos.</Typography>
								) : (
									<Button size="small" variant="outlined" onClick={loadGroups} disabled={loadingGroups}>
										{loadingGroups ? <CircularProgress size={16} /> : groupList ? "Atualizar lista de grupos" : "Carregar meus grupos"}
									</Button>
								)}
								{groupList && groupList.length === 0 && (
									<Typography variant="caption" display="block" style={{ marginTop: 6 }}>Nenhum grupo encontrado neste número.</Typography>
								)}
								{groupList && groupList.length > 0 && (
									<div style={{ maxHeight: 220, overflowY: "auto", marginTop: 8, border: "1px solid rgba(128,128,128,.25)", borderRadius: 10 }}>
										{groupList.map(g => (
											<FormControlLabel
												key={g.id}
												style={{ display: "flex", margin: 0, padding: "2px 10px" }}
												control={
													<Switch
														size="small"
														color="primary"
														checked={allowed.includes(g.id)}
														onChange={e => { e && e.persist && e.persist(); return (setAllowed(a => (e.target.checked ? [...a, g.id] : a.filter(x => x !== g.id)))); }}
													/>
												}
												label={`${g.name} (${g.participants})`}
											/>
										))}
									</div>
								)}
								{allowed.length > 0 && (
									<Typography variant="caption" display="block" style={{ marginTop: 6 }}>{allowed.length} grupo(s) escolhido(s).</Typography>
								)}
							</div>
						)}
					</div>
				)}

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
						<Typography variant="subtitle2" style={{ marginTop: 12 }}>Última mensagem recebida da Meta</Typography>
						<Typography variant="body2">{webhookLine(info.webhook)}</Typography>
						{info.webhookCheck && (
							<Typography variant="caption" className={classes.hint} display="block" style={{ marginTop: 4 }}>
								Última verificação do endereço: {webhookLine(info.webhookCheck)}
							</Typography>
						)}
						{whatsAppId && (
							<Button size="small" style={{ marginTop: 4 }} onClick={() => api.get(`/channels/${whatsAppId}/info`).then(({ data: i }) => setInfo(i)).catch(() => {})}>
								Atualizar
							</Button>
						)}
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
				{agents.length > 0 && (
					<TextField
						select
						fullWidth
						variant="outlined"
						margin="dense"
						label="Agente de IA que atende esta conexão"
						value={agentId}
						onChange={e => setAgentId(e.target.value)}
						InputLabelProps={{ shrink: true }}
						SelectProps={{ displayEmpty: true }}
						helperText={
							agentId && agents.find(a => a.id === agentId) && !agentConnections(agents.find(a => a.id === agentId)).length
								? "Este agente hoje atende todas as conexões sem outro agente. Ao escolher aqui, ele passa a atender só as conexões marcadas."
								: "O mesmo agente pode atender várias conexões. O agente precisa estar ligado (Agentes de IA → Ajustes)."
						}
					>
						<MenuItem value="">Nenhum agente específico</MenuItem>
						{agents.map(a => (
							<MenuItem key={a.id} value={a.id}>
								{a.name}
								{a.active ? "" : " (desligado)"}
							</MenuItem>
						))}
					</TextField>
				)}

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
							<TimezoneSelect
								value={hours.timezone || "America/Porto_Velho"}
								onChange={tz => setHours({ ...hours, timezone: tz })}
								helperText="Define em que horário o atendimento abre e fecha."
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
