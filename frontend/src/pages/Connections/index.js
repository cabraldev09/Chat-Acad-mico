import { AuthContext } from "../../context/Auth/AuthContext";
import React, { useState, useCallback, useContext, useEffect } from "react";
import openSocket from "../../services/socket-io";
import ChannelIcon from "../../components/ChannelIcon";
import { toast } from "react-toastify";
import { format, parseISO } from "date-fns";

import { makeStyles } from "@material-ui/core/styles";
import { green } from "@material-ui/core/colors";
import {
	Button,
	TableBody,
	TableRow,
	TableCell,
	IconButton,
	TableHead,
	Paper,
	Tooltip,
	Typography,
	CircularProgress,
	FormControlLabel,
	Switch,
} from "@material-ui/core";
import {
	Edit,
	CheckCircle,
	SignalCellularConnectedNoInternet2Bar,
	SignalCellularConnectedNoInternet0Bar,
	SignalCellular4Bar,
	CropFree,
	DeleteOutline,
} from "@material-ui/icons";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import TableRowSkeleton from "../../components/TableRowSkeleton";
import ResponsiveTable from "../../components/ResponsiveTable";

import api from "../../services/api";
import WhatsAppModal from "../../components/WhatsAppModal";
import MyNumberDialog from "./MyNumberDialog";
import InstagramDialog from "./InstagramDialog";
import ConfirmationModal from "../../components/ConfirmationModal";
import { confirmDialog } from "../../components/ConfirmDialog";
import QrcodeModal from "../../components/QrcodeModal";
import { i18n } from "../../translate/i18n";
import { WhatsAppsContext } from "../../context/WhatsApp/WhatsAppsContext";
import toastError from "../../errors/toastError";
import { canOperateRetention, isManager, isOwnQrNumber } from "../../utils/access";

const useStyles = makeStyles(theme => ({
	tiles: { display: "grid", gap: theme.spacing(1.5), gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", padding: theme.spacing(0, 2, 1.5) },
	tile: {
		display: "flex", alignItems: "center", gap: theme.spacing(1.5), textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit",
		padding: theme.spacing(1.5, 2), borderRadius: 14, border: `1px solid ${theme.palette.divider}`, background: theme.palette.background.paper,
		transition: "border-color .18s ease, box-shadow .18s ease",
		"&:hover": { borderColor: theme.palette.primary.main, boxShadow: "0 4px 14px rgba(15,23,42,.08)" },
		"&:focus-visible": { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
	},
	ownCard: { margin: theme.spacing(0, 2, 2), padding: theme.spacing(2.5), borderRadius: 14, border: `1px solid ${theme.palette.divider}`, background: theme.palette.background.paper, display: "flex", gap: theme.spacing(2), alignItems: "flex-start", [theme.breakpoints.down("xs")]: { flexDirection: "column" } },
	ownText: { flex: 1, minWidth: 0, "& h2": { margin: "0 0 6px", fontSize: 17 }, "& p": { margin: "0 0 6px", fontSize: 14, lineHeight: 1.5, color: theme.palette.text.secondary }, "& ul": { margin: "6px 0 0", paddingLeft: 18, fontSize: 13.5, lineHeight: 1.5, color: theme.palette.text.secondary } },
	ownBtn: { minHeight: 44, borderRadius: 10, textTransform: "none", fontWeight: 600, whiteSpace: "nowrap", [theme.breakpoints.down("xs")]: { width: "100%" } },
	tileText: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0, "& b": { fontSize: 15 }, "& small": { fontSize: 12.5, color: theme.palette.text.secondary, lineHeight: 1.35 } },
	mainPaper: {
		flex: 1,
		padding: theme.spacing(1),
		overflowY: "scroll",
		...theme.scrollbarStyles,
	},
	customTableCell: {
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
	},
	tooltip: {
		backgroundColor: "#f5f5f9",
		color: "rgba(0, 0, 0, 0.87)",
		fontSize: theme.typography.pxToRem(14),
		border: "1px solid #dadde9",
		maxWidth: 450,
	},
	tooltipPopper: {
		textAlign: "center",
	},
	buttonProgress: {
		color: "#0693E3",
	},
}));

const CustomToolTip = ({ title, content, children }) => {
	const classes = useStyles();

	return (
		<Tooltip
			arrow
			classes={{
				tooltip: classes.tooltip,
				popper: classes.tooltipPopper,
			}}
			title={
				<React.Fragment>
					<Typography gutterBottom color="inherit">
						{title}
					</Typography>
					{content && <Typography>{content}</Typography>}
				</React.Fragment>
			}
		>
			{children}
		</Tooltip>
	);
};

const Connections = () => {
	const classes = useStyles();

	const { whatsApps: allWhatsApps, loading } = useContext(WhatsAppsContext);
	// adding, editing and removing connections is for the management; a consultant or tutor only sees the QR Code number the
	// management gave them, to read the QR Code with their own phone and keep it connected
	const { user } = useContext(AuthContext);
	const isAdmin = isManager(user);
	const whatsApps = isAdmin ? allWhatsApps : (allWhatsApps || []).filter(w => isOwnQrNumber(user, w));
	const canManage = w => isAdmin || isOwnQrNumber(user, w);
	// an Instagram connected by the login (not by pasted keys): when its access expires, the person enters again
	const igLogin = w => {
		if (!w || w.channel !== "instagram") return null;
		try {
			const c = JSON.parse(w.config || "{}");
			return c.mode === "oauth" ? c : null;
		} catch (e) {
			return null;
		}
	};
	const [igDialog, setIgDialog] = useState({ open: false, whatsApp: null });
	// back from the Instagram login: the result comes in the address
	useEffect(() => {
		const q = new URLSearchParams(window.location.search);
		const r = q.get("instagram");
		if (!r) return;
		if (r === "ok") toast.success("Instagram conectado. As conversas do Direct já chegam aqui.");
		else toast.error(q.get("motivo") || "Não foi possível conectar o Instagram.");
		window.history.replaceState({}, "", window.location.pathname);
	}, []);
	const [myDialog, setMyDialog] = useState({ open: false, whatsApp: null });
	// the number the relationship department works from (chosen in Retenção > Configurar)
	const [relationshipId, setRelationshipId] = useState(0);
	useEffect(() => {
		if (!canOperateRetention(user)) return;
		api.get("/retention/config").then(({ data }) => setRelationshipId((data.relationship && data.relationship.whatsappId) || 0)).catch(() => undefined);
	}, [user]); // eslint-disable-line react-hooks/exhaustive-deps
	// progress of "copy the conversations of the phone", by connection
	const [copying, setCopying] = useState({});
	useEffect(() => {
		const socket = openSocket();
		socket.on("historyImport", d => {
			setCopying(prev => ({ ...prev, [d.whatsappId]: d.finished ? null : { done: d.done, total: d.total } }));
			const mine = user && (d.userId === user.id || !d.userId);
			if (!d.finished || !mine) return;
			if (!d.ok) {
				const text = i18n.t(`backendErrors.${d.message}`);
				toast.error(text && !text.startsWith("backendErrors.") ? text : "Não foi possível copiar as conversas.");
				return;
			}
			toast.success(
				`Conversas de “${d.connection}” copiadas: ${d.chats} conversas (${d.newConversations} novas), ${d.messages} mensagens${d.pinned ? `, ${d.pinned} fixadas` : ""}. As recentes ficam em Atendendo; as mais antigas, em Todas.`,
				{ autoClose: 15000 }
			);
		});
		return () => socket.disconnect();
	}, [user]);
	// the switch of the copy of the phones (the management) and the erasing of what was copied (only the administrator)
	const isSystemAdmin = !!user && user.profile === "admin";
	const [copyOn, setCopyOn] = useState(null);
	useEffect(() => {
		if (!isAdmin) return;
		api.get("/settings").then(({ data }) => {
			const row = (data || []).find(x => x.key === "whatsapp_copy_enabled");
			setCopyOn(!row || row.value !== "false");
		}).catch(() => setCopyOn(null));
	}, [isAdmin]);
	const toggleCopy = async on => {
		try {
			await api.put("/settings/whatsapp_copy_enabled", { value: on ? "true" : "false" });
			setCopyOn(on);
			toast.success(on ? "A cópia das conversas do celular está ligada." : "A cópia das conversas do celular está desligada.");
		} catch (err) {
			toastError(err);
		}
	};
	const eraseCopied = async whatsApp => {
		const ok = await confirmDialog({
			title: "Apagar o que foi copiado?",
			message: `As conversas copiadas do celular de "${whatsApp.name}" que ninguém usou saem do sistema, com as mensagens. As conversas em atendimento ficam. A cópia não roda de novo sozinha para este número.`,
			confirmText: "Apagar a cópia",
			tone: "danger",
		});
		if (!ok) return;
		try {
			const { data } = await api.delete(`/whatsapp/${whatsApp.id}/copied-history`);
			toast.success(`${data.conversations} conversas copiadas apagadas.`);
		} catch (err) {
			toastError(err);
		}
	};
	const handleCopyHistory = async id => {
		try {
			await api.post(`/whatsapp/${id}/import-history`, {});
			setCopying(prev => ({ ...prev, [id]: { done: 0, total: 0 } }));
			toast.info("Copiando as conversas do WhatsApp. Pode continuar usando o sistema, aviso quando terminar.");
		} catch (err) {
			toastError(err);
		}
	};
	const [whatsAppModalOpen, setWhatsAppModalOpen] = useState(false);
	const [qrModalOpen, setQrModalOpen] = useState(false);
	const [selectedWhatsApp, setSelectedWhatsApp] = useState(null);
	const [confirmModalOpen, setConfirmModalOpen] = useState(false);
	const confirmationModalInitialState = {
		action: "",
		title: "",
		message: "",
		whatsAppId: "",
		open: false,
	};
	const [confirmModalInfo, setConfirmModalInfo] = useState(
		confirmationModalInitialState
	);

	const handleStartWhatsAppSession = async whatsAppId => {
		try {
			await api.post(`/whatsappsession/${whatsAppId}`);
		} catch (err) {
			toastError(err);
		}
	};

	const handleRequestNewQrCode = async whatsAppId => {
		try {
			await api.put(`/whatsappsession/${whatsAppId}`);
		} catch (err) {
			toastError(err);
		}
	};

	const handleOpenWhatsAppModal = () => {
		setSelectedWhatsApp(null);
		setWhatsAppModalOpen(true);
	};

	const handleCloseWhatsAppModal = useCallback(() => {
		setWhatsAppModalOpen(false);
		setSelectedWhatsApp(null);
	}, [setSelectedWhatsApp, setWhatsAppModalOpen]);

	const handleOpenQrModal = whatsApp => {
		setSelectedWhatsApp(whatsApp);
		setQrModalOpen(true);
	};

	const handleCloseQrModal = useCallback(() => {
		setSelectedWhatsApp(null);
		setQrModalOpen(false);
	}, [setQrModalOpen, setSelectedWhatsApp]);

	const handleEditWhatsApp = whatsApp => {
		if (!isAdmin) {
			setMyDialog({ open: true, whatsApp });
			return;
		}
		setSelectedWhatsApp(whatsApp);
		setWhatsAppModalOpen(true);
	};

	const handleOpenConfirmationModal = (action, whatsAppId) => {
		if (action === "disconnect") {
			setConfirmModalInfo({
				action: action,
				title: i18n.t("connections.confirmationModal.disconnectTitle"),
				message: i18n.t("connections.confirmationModal.disconnectMessage"),
				whatsAppId: whatsAppId,
			});
		}

		if (action === "delete") {
			setConfirmModalInfo({
				action: action,
				title: i18n.t("connections.confirmationModal.deleteTitle"),
				message: i18n.t("connections.confirmationModal.deleteMessage"),
				whatsAppId: whatsAppId,
			});
		}
		setConfirmModalOpen(true);
	};

	const handleSubmitConfirmationModal = async () => {
		if (confirmModalInfo.action === "disconnect") {
			try {
				await api.delete(`/whatsappsession/${confirmModalInfo.whatsAppId}`);
			} catch (err) {
				toastError(err);
			}
		}

		if (confirmModalInfo.action === "delete") {
			try {
				await api.delete(`/whatsapp/${confirmModalInfo.whatsAppId}`);
				toast.success(i18n.t("connections.toasts.deleted"));
			} catch (err) {
				toastError(err);
			}
		}

		setConfirmModalInfo(confirmationModalInitialState);
	};

	const renderActionButtons = whatsApp => {
		if (!canManage(whatsApp)) return <span style={{ fontSize: 13, opacity: 0.7 }}>{whatsApp.ownerId ? "Número de outra pessoa" : "Só o administrador gerencia"}</span>;
		return (
			<>
				{whatsApp.status === "qrcode" && (
					<Button
						size="small"
						variant="contained"
						color="primary"
						onClick={() => handleOpenQrModal(whatsApp)}
					>
						{i18n.t("connections.buttons.qrcode")}
					</Button>
				)}
				{whatsApp.status === "DISCONNECTED" && igLogin(whatsApp) && (
					<Button size="small" variant="contained" color="primary" onClick={() => setIgDialog({ open: true, whatsApp })}>
						Entrar de novo
					</Button>
				)}
				{whatsApp.status === "DISCONNECTED" && !igLogin(whatsApp) && (
					<>
						<Button
							size="small"
							variant="outlined"
							color="primary"
							onClick={() => handleStartWhatsAppSession(whatsApp.id)}
						>
							{i18n.t("connections.buttons.tryAgain")}
						</Button>{" "}
						{(!whatsApp.channel || whatsApp.channel === "whatsapp") && (
							<Button
								size="small"
								variant="outlined"
								color="secondary"
								onClick={() => handleRequestNewQrCode(whatsApp.id)}
							>
								{i18n.t("connections.buttons.newQr")}
							</Button>
						)}
					</>
				)}
				{whatsApp.status === "CONNECTED" && (!whatsApp.channel || whatsApp.channel === "whatsapp") && (
					<>
						<Button
							size="small"
							variant="outlined"
							color="primary"
							disabled={!!copying[whatsApp.id]}
							onClick={() => handleCopyHistory(whatsApp.id)}
							title="Traz para o sistema as conversas, os grupos e os fixados que já existem neste WhatsApp, como histórico"
						>
							{copying[whatsApp.id]
								? copying[whatsApp.id].total
									? `Copiando ${copying[whatsApp.id].done}/${copying[whatsApp.id].total}`
									: "Copiando…"
								: "Copiar conversas"}
						</Button>{" "}
					</>
				)}
				{isSystemAdmin && (!whatsApp.channel || whatsApp.channel === "whatsapp") && whatsApp.historyImportedAt && (
					<>
						<Button size="small" variant="outlined" onClick={() => eraseCopied(whatsApp)} title="Apaga as conversas copiadas do celular que ninguém usou">
							Apagar cópia
						</Button>{" "}
					</>
				)}
				{(whatsApp.status === "CONNECTED" ||
					whatsApp.status === "PAIRING" ||
					whatsApp.status === "TIMEOUT") && (
					<Button
						size="small"
						variant="outlined"
						color="secondary"
						onClick={() => {
							handleOpenConfirmationModal("disconnect", whatsApp.id);
						}}
					>
						{i18n.t("connections.buttons.disconnect")}
					</Button>
				)}
				{whatsApp.status === "OPENING" && (
					<Button size="small" variant="outlined" disabled color="default">
						{i18n.t("connections.buttons.connecting")}
					</Button>
				)}
			</>
		);
	};

	const renderStatusToolTips = whatsApp => {
		return (
			<div className={classes.customTableCell}>
				{whatsApp.status === "DISCONNECTED" && (
					<CustomToolTip
						title={i18n.t("connections.toolTips.disconnected.title")}
						content={i18n.t("connections.toolTips.disconnected.content")}
					>
						<SignalCellularConnectedNoInternet0Bar color="secondary" />
					</CustomToolTip>
				)}
				{whatsApp.status === "OPENING" && (
					<CircularProgress size={24} className={classes.buttonProgress} />
				)}
				{whatsApp.status === "qrcode" && (
					<CustomToolTip
						title={i18n.t("connections.toolTips.qrcode.title")}
						content={isAdmin ? i18n.t("connections.toolTips.qrcode.content") : "Este número ainda não foi conectado. Peça ao administrador para ler o QR Code com o celular do número."}
					>
						<CropFree />
					</CustomToolTip>
				)}
				{whatsApp.status === "CONNECTED" && (
					<CustomToolTip title={i18n.t("connections.toolTips.connected.title")}>
						<SignalCellular4Bar style={{ color: green[500] }} />
					</CustomToolTip>
				)}
				{(whatsApp.status === "TIMEOUT" || whatsApp.status === "PAIRING") && (
					<CustomToolTip
						title={i18n.t("connections.toolTips.timeout.title")}
						content={i18n.t("connections.toolTips.timeout.content")}
					>
						<SignalCellularConnectedNoInternet2Bar color="secondary" />
					</CustomToolTip>
				)}
			</div>
		);
	};

	// a consultant, tutor or relationship person connects their own WhatsApp here (QR Code read on their own phone)
	const [connecting, setConnecting] = useState(false);
	const connectMine = async () => {
		setConnecting(true);
		try {
			const { data } = await api.post("/whatsapp/mine");
			toast.success("Número criado. Leia o QR Code com o WhatsApp do seu celular.");
			handleOpenQrModal(data);
		} catch (err) {
			toastError(err);
		}
		setConnecting(false);
	};
	const ownCard = !isAdmin && !loading && whatsApps.length === 0 ? (
		<div className={classes.ownCard}>
			<ChannelIcon channel="whatsapp" size={36} />
			<div className={classes.ownText}>
				<h2>Conectar o meu WhatsApp</h2>
				<p>Use o seu próprio número para atender pelo sistema. Você lê o QR Code com o WhatsApp do seu celular, como no WhatsApp Web.</p>
				<ul>
					<li>É uma conexão não oficial: evite mandar a mesma mensagem para muita gente de uma vez e para quem nunca falou com você, para o número não ser bloqueado.</li>
					<li>Envios em massa e avisos da tutoria saem pelo número oficial.</li>
					<li>Só você e a gestão veem o QR Code deste número.</li>
				</ul>
			</div>
			<Button className={classes.ownBtn} variant="contained" color="primary" disableElevation disabled={connecting} onClick={connectMine}>
				{connecting ? "Criando..." : "Conectar meu WhatsApp"}
			</Button>
		</div>
	) : null;

	return (
		<MainContainer>
			<ConfirmationModal
				title={confirmModalInfo.title}
				open={confirmModalOpen}
				onClose={setConfirmModalOpen}
				onConfirm={handleSubmitConfirmationModal}
			>
				{confirmModalInfo.message}
			</ConfirmationModal>
			<QrcodeModal
				open={qrModalOpen}
				onClose={handleCloseQrModal}
				whatsAppId={!whatsAppModalOpen && selectedWhatsApp?.id}
			/>
			<MyNumberDialog
				open={myDialog.open}
				whatsApp={myDialog.whatsApp}
				onClose={() => setMyDialog({ open: false, whatsApp: null })}
			/>
			<InstagramDialog
				open={igDialog.open}
				whatsApp={igDialog.whatsApp}
				canConfigure={isAdmin}
				onClose={() => setIgDialog({ open: false, whatsApp: null })}
			/>
			<WhatsAppModal
				open={whatsAppModalOpen}
				onClose={handleCloseWhatsAppModal}
				whatsAppId={!qrModalOpen && selectedWhatsApp?.id}
				onCreated={w => handleOpenQrModal(w)}
			/>
			<MainHeader>
				<Title>{i18n.t("connections.title")}</Title>
			</MainHeader>
			{ownCard}
			{isAdmin && (
				<div className={classes.tiles} role="group" aria-label="Conectar um canal">
					{/* for now the team works only through the official number (API of the Meta): the administrator adds connections */}
					{isAdmin && (
						<button type="button" className={classes.tile} onClick={() => handleOpenWhatsAppModal()}>
							<ChannelIcon channel="whatsapp" size={30} />
							<span className={classes.tileText}><b>Adicionar WhatsApp</b><small>Número oficial (API da Meta) ou QR Code</small></span>
						</button>
					)}
					{isAdmin && (
						<button type="button" className={classes.tile} onClick={() => setIgDialog({ open: true, whatsApp: null })}>
							<ChannelIcon channel="instagram" size={30} />
							<span className={classes.tileText}><b>Conectar Instagram</b><small>Entre com a conta profissional e pronto</small></span>
						</button>
					)}
					{isAdmin && (
						<button type="button" className={classes.tile} onClick={handleOpenWhatsAppModal}>
							<ChannelIcon channel="webchat" size={30} />
							<span className={classes.tileText}><b>Outros canais</b><small>Messenger, Telegram, WhatsApp Cloud API e chat do site</small></span>
						</button>
					)}
				</div>
			)}
			{isAdmin && copyOn !== null && (
				<FormControlLabel
					style={{ padding: "0 16px 6px" }}
					control={<Switch color="primary" checked={copyOn} onChange={e => toggleCopy(e.target.checked)} />}
					label="Copiar as conversas do celular ao conectar um número por QR Code (e as anteriores ao rolar a conversa)"
				/>
			)}
			<Typography variant="caption" color="textSecondary" component="div" style={{ padding: "0 16px 10px" }}>
				Dica: o WhatsApp desconecta os aparelhos vinculados quando o celular fica cerca de 14 dias sem internet. Abra o WhatsApp no celular pelo menos uma vez por semana. Se desconectar, as mensagens que já chegaram continuam guardadas aqui, e as que chegaram enquanto estava desconectado são recuperadas depois que você ler o QR Code de novo.
			</Typography>
			<Paper className={classes.mainPaper} variant="outlined">
				<ResponsiveTable>
					<TableHead>
						<TableRow>
							<TableCell align="center">
								{i18n.t("connections.table.name")}
							</TableCell>
							<TableCell align="center">
								{i18n.t("connections.table.status")}
							</TableCell>
							<TableCell align="center">
								{i18n.t("connections.table.session")}
							</TableCell>
							<TableCell align="center">
								{i18n.t("connections.table.lastUpdate")}
							</TableCell>
							<TableCell align="center">
								{i18n.t("connections.table.default")}
							</TableCell>
							<TableCell align="center">
								{i18n.t("connections.table.actions")}
							</TableCell>
						</TableRow>
					</TableHead>
					<TableBody>
						{loading ? (
							<TableRowSkeleton />
						) : (
							<>
								{whatsApps?.length > 0 &&
									whatsApps.map(whatsApp => (
										<TableRow key={whatsApp.id}>
											<TableCell align="center">
												<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
													<ChannelIcon channel={whatsApp.channel} />
													{whatsApp.name}
												</span>
												{igLogin(whatsApp) && igLogin(whatsApp).username && (
													<div style={{ fontSize: 12, opacity: 0.65 }}>@{igLogin(whatsApp).username} · entrou com o Instagram</div>
												)}
												{isAdmin && whatsApp.owner && (
													<div style={{ fontSize: 12, opacity: 0.65 }}>Número de {whatsApp.owner.name}</div>
												)}
												{relationshipId > 0 && whatsApp.id === relationshipId && (
													<div><span style={{ display: "inline-block", marginTop: 4, padding: "1px 9px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, background: "rgba(124,58,237,.14)", color: "#6d28d9" }}>Relacionamento</span></div>
												)}
											</TableCell>
											<TableCell
												align="center"
												data-label={i18n.t("connections.table.status")}
											>
												{renderStatusToolTips(whatsApp)}
												{whatsApp.statusNote && (whatsApp.status !== "CONNECTED" || whatsApp.channel === "whatsapp_cloud") && (
													<div data-testid={`status-note-${whatsApp.id}`} style={{ fontSize: 12, opacity: 0.75, marginTop: 4, maxWidth: 240, marginLeft: "auto", marginRight: "auto", lineHeight: 1.35 }}>
														{whatsApp.statusNote}
													</div>
												)}
											</TableCell>
											<TableCell
												align="center"
												data-label={i18n.t("connections.table.session")}
											>
												{renderActionButtons(whatsApp)}
											</TableCell>
											<TableCell
												align="center"
												data-label={i18n.t("connections.table.lastUpdate")}
											>
												{whatsApp.updatedAt ? format(parseISO(whatsApp.updatedAt), "dd/MM/yy HH:mm") : "—"}
											</TableCell>
											<TableCell
												align="center"
												data-label={i18n.t("connections.table.default")}
											>
												{whatsApp.isDefault && (
													<div className={classes.customTableCell}>
														<CheckCircle style={{ color: green[500] }} />
													</div>
												)}
											</TableCell>
											<TableCell align="center">
												{canManage(whatsApp) && (
													<>
														<IconButton aria-label="Editar"
															size="small"
															onClick={() => handleEditWhatsApp(whatsApp)}
														>
															<Edit />
														</IconButton>

														<IconButton aria-label="Excluir"
															size="small"
															onClick={e => {
																handleOpenConfirmationModal("delete", whatsApp.id);
															}}
														>
															<DeleteOutline />
														</IconButton>
													</>
												)}
											</TableCell>
										</TableRow>
									))}
							</>
						)}
					</TableBody>
				</ResponsiveTable>
			</Paper>
		</MainContainer>
	);
};

export default Connections;
