import React, { useState, useRef, useEffect, useContext } from "react";
import { useHistory } from "react-router-dom";
import { format } from "date-fns";
import openSocket from "../../services/socket-io";
import useSound from "use-sound";

import Popover from "@material-ui/core/Popover";
import IconButton from "@material-ui/core/IconButton";
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemText from "@material-ui/core/ListItemText";
import { makeStyles } from "@material-ui/core/styles";
import Badge from "@material-ui/core/Badge";
import Tooltip from "@material-ui/core/Tooltip";
import Switch from "@material-ui/core/Switch";
import { Bell, BellRing, Volume2, VolumeX } from "lucide-react";

import TicketListItem from "../TicketListItem";
import { showMessageToast, dismissMessageToast } from "../MessageToast";
import { i18n } from "../../translate/i18n";
import useTickets from "../../hooks/useTickets";
import alertSound from "../../assets/sound.mp3";
import { AuthContext } from "../../context/Auth/AuthContext";
import {
	setSoundPrefsUser,
	getSoundMode,
	setSoundMode,
	getPopupEnabled,
	setPopupEnabled,
	alertContactCount,
	shouldAlert,
	getContactSound as getSoundPref,
	onSoundPrefsChange,
	loadSoundPrefsFromServer,
} from "../../utils/soundPrefs";

const useStyles = makeStyles(theme => ({
	tabContainer: {
		overflowY: "auto",
		maxHeight: 350,
		...theme.scrollbarStyles,
	},
	popoverPaper: {
		width: "100%",
		maxWidth: 350,
		marginLeft: theme.spacing(2),
		marginRight: theme.spacing(1),
		[theme.breakpoints.down("sm")]: {
			maxWidth: 270,
		},
	},
	noShadow: {
		boxShadow: "none !important",
	},
	iconButton: {
		color: theme.palette.text.secondary,
	},
	prefs: {
		padding: theme.spacing(1.5, 2, 1.25),
		borderBottom: `1px solid ${theme.palette.divider}`,
	},
	prefsTitle: { fontSize: 13, fontWeight: 700, marginBottom: theme.spacing(1) },
	choice: {
		display: "flex",
		alignItems: "center",
		gap: theme.spacing(1.25),
		width: "100%",
		padding: theme.spacing(1, 1.25),
		marginBottom: theme.spacing(0.75),
		textAlign: "left",
		fontFamily: "inherit",
		color: theme.palette.text.primary,
		background: "transparent",
		border: `1px solid ${theme.palette.divider}`,
		borderRadius: 12,
		cursor: "pointer",
		transition: "border-color .15s, background-color .15s",
		"&:hover": { backgroundColor: theme.palette.action.hover },
	},
	choiceOn: {
		borderColor: theme.palette.primary.main,
		backgroundColor: theme.palette.type === "dark" ? "rgba(6,147,227,.14)" : "rgba(6,147,227,.08)",
	},
	choiceIcon: { flex: "none", display: "flex", color: theme.palette.text.secondary },
	choiceIconOn: { color: theme.palette.primary.main },
	choiceLabel: { fontSize: 13.5, fontWeight: 600, lineHeight: 1.25 },
	choiceHint: { fontSize: 12, color: theme.palette.text.secondary, lineHeight: 1.3 },
	popupRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: theme.spacing(1) },
	popupText: { fontSize: 13.5, fontWeight: 600 },
	popupHint: { fontSize: 12, color: theme.palette.text.secondary },
}));

const NotificationsPopOver = () => {
	const classes = useStyles();

	const history = useHistory();
	const { user } = useContext(AuthContext);
	const ticketIdUrl = +history.location.pathname.split("/")[2];
	const ticketIdRef = useRef(ticketIdUrl);
	const anchorEl = useRef();
	const [isOpen, setIsOpen] = useState(false);
	const [notifications, setNotifications] = useState([]);

	const [, setDesktopNotifications] = useState([]);
	const [soundMode, setSoundModeState] = useState("all");
	const [popupOn, setPopupOnState] = useState(true);
	const [alertCount, setAlertCount] = useState(0);

	// preferences are per user; reload them when the user or any setting changes
	useEffect(() => {
		setSoundPrefsUser(user?.id);
		if (user?.id) loadSoundPrefsFromServer();
		const refresh = () => {
			setSoundModeState(getSoundMode());
			setPopupOnState(getPopupEnabled());
			setAlertCount(alertContactCount());
		};
		refresh();
		return onSoundPrefsChange(refresh);
	}, [user]);

	const { tickets } = useTickets({ withUnreadMessages: "true" });
	const [play] = useSound(alertSound);
	const soundAlertRef = useRef();

	const historyRef = useRef(history);

	useEffect(() => {
		soundAlertRef.current = play;

		if (!("Notification" in window)) {
			console.log("This browser doesn't support notifications");
		} else {
			Notification.requestPermission();
		}
	}, [play]);

	useEffect(() => {
		setNotifications(tickets);
	}, [tickets]);

	useEffect(() => {
		ticketIdRef.current = ticketIdUrl;
		if (!ticketIdUrl) return;
		// entering a conversation clears its notification: the bell, the pop-up card and the browser notice
		dismissMessageToast(ticketIdUrl);
		setNotifications(prev => (prev.some(t => t.id === ticketIdUrl) ? prev.filter(t => t.id !== ticketIdUrl) : prev));
		setDesktopNotifications(prev => {
			prev.filter(n => n.tag === String(ticketIdUrl)).forEach(n => n.close());
			return prev.filter(n => n.tag !== String(ticketIdUrl));
		});
	}, [ticketIdUrl]);

	useEffect(() => {
		const socket = openSocket();

		socket.on("connect", () => socket.emit("joinNotification"));

		socket.on("ticket", data => {
			if (data.action === "updateUnread" || data.action === "delete") {
				setNotifications(prevState => {
					const ticketIndex = prevState.findIndex(t => t.id === data.ticketId);
					if (ticketIndex !== -1) {
						prevState.splice(ticketIndex, 1);
						return [...prevState];
					}
					return prevState;
				});

				setDesktopNotifications(prevState => {
					const notfiticationIndex = prevState.findIndex(
						n => n.tag === String(data.ticketId)
					);
					if (notfiticationIndex !== -1) {
						prevState[notfiticationIndex].close();
						prevState.splice(notfiticationIndex, 1);
						return [...prevState];
					}
					return prevState;
				});
			}
		});

		socket.on("appMessage", data => {
			if (
				data.action === "create" &&
				!data.message.read &&
				(data.ticket.userId === user?.id || !data.ticket.userId)
			) {
				setNotifications(prevState => {
					const ticketIndex = prevState.findIndex(t => t.id === data.ticket.id);
					if (ticketIndex !== -1) {
						prevState[ticketIndex] = data.ticket;
						return [...prevState];
					}
					return [data.ticket, ...prevState];
				});

				const shouldNotNotificate =
					(data.message.ticketId === ticketIdRef.current &&
						document.visibilityState === "visible") ||
					(data.ticket.userId && data.ticket.userId !== user?.id);

				if (shouldNotNotificate) return;

				handleNotifications(data);
			}
		});

		return () => {
			socket.disconnect();
		};
	}, [user]);

	const handleNotifications = data => {
		const { message, contact, ticket } = data;
		const loud = shouldAlert(contact.id);
		// a silenced contact never pops up; a group pops up quietly (no sound) unless it is marked as alert
		if (!loud && (ticket.isGroup ? getSoundPref(contact.id) === "mute" : true)) return;

		// on screen: a short card, wherever the person is in the system
		if (getPopupEnabled() && document.visibilityState === "visible") {
			showMessageToast({ ticket, contact, message }, () => historyRef.current.push(`/tickets/${ticket.id}`));
		}

		if (!loud) return;

		if (getPopupEnabled() && document.visibilityState !== "visible" && "Notification" in window && Notification.permission === "granted") {
			const notification = new Notification(
				`${i18n.t("tickets.notification.message")} ${contact.name}`,
				{
					body: `${message.body} - ${format(new Date(), "HH:mm")}`,
					icon: contact.profilePicUrl,
					tag: ticket.id,
					renotify: true,
				}
			);

			notification.onclick = e => {
				e.preventDefault();
				window.focus();
				historyRef.current.push(`/tickets/${ticket.id}`);
			};

			setDesktopNotifications(prevState => {
				const notfiticationIndex = prevState.findIndex(
					n => n.tag === notification.tag
				);
				if (notfiticationIndex !== -1) {
					prevState[notfiticationIndex] = notification;
					return [...prevState];
				}
				return [notification, ...prevState];
			});
		}

		if (soundAlertRef.current) soundAlertRef.current();
	};

	const handleClick = () => {
		setIsOpen(prevState => !prevState);
	};

	const handleClickAway = () => {
		setIsOpen(false);
	};

	const NotificationTicket = ({ children }) => {
		return <div onClick={handleClickAway}>{children}</div>;
	};

	return (
		<>
			<Tooltip title="Notificações e som">
				<IconButton
					onClick={handleClick}
					ref={anchorEl}
					aria-label="Notificações e som"
					className={classes.iconButton}
				>
					<Badge badgeContent={notifications.length} color="primary" overlap="rectangular">
						{soundMode === "alerts" ? <BellRing size={20} /> : <Bell size={20} />}
					</Badge>
				</IconButton>
			</Tooltip>
			<Popover
				disableScrollLock
				open={isOpen}
				anchorEl={anchorEl.current}
				anchorOrigin={{
					vertical: "bottom",
					horizontal: "right",
				}}
				transformOrigin={{
					vertical: "top",
					horizontal: "right",
				}}
				classes={{ paper: classes.popoverPaper }}
				onClose={handleClickAway}
			>
				<div className={classes.prefs}>
					<div className={classes.prefsTitle}>Som das novas mensagens</div>
					{[
						{ value: "all", icon: Volume2, label: "Todas as conversas", hint: "Toca para qualquer contato, menos os que você silenciou" },
						{
							value: "alerts",
							icon: VolumeX,
							label: "Só contatos de alerta",
							hint: alertCount
								? `Toca apenas para ${alertCount} ${alertCount === 1 ? "contato" : "contatos"} marcados como alerta`
								: "Silêncio geral. Abra uma conversa e marque o contato como alerta",
						},
					].map(option => {
						const Icon = option.icon;
						const on = soundMode === option.value;
						return (
							<button
								type="button"
								key={option.value}
								className={`${classes.choice} ${on ? classes.choiceOn : ""}`}
								onClick={() => setSoundMode(option.value)}
								aria-pressed={on}
							>
								<span className={`${classes.choiceIcon} ${on ? classes.choiceIconOn : ""}`}><Icon size={20} /></span>
								<span>
									<div className={classes.choiceLabel}>{option.label}</div>
									<div className={classes.choiceHint}>{option.hint}</div>
								</span>
							</button>
						);
					})}
					<div className={classes.popupRow}>
						<div>
							<div className={classes.popupText}>Aviso na tela</div>
							<div className={classes.popupHint}>Mostra a notificação do navegador junto com o som</div>
						</div>
						<Switch
							color="primary"
							checked={popupOn}
							onChange={e => setPopupEnabled(e.target.checked)}
							inputProps={{ "aria-label": "Mostrar aviso na tela" }}
						/>
					</div>
				</div>
				<List dense className={classes.tabContainer}>
					{notifications.length === 0 ? (
						<ListItem>
							<ListItemText>{i18n.t("notifications.noTickets")}</ListItemText>
						</ListItem>
					) : (
						notifications.map(ticket => (
							<NotificationTicket key={ticket.id}>
								<TicketListItem ticket={ticket} />
							</NotificationTicket>
						))
					)}
				</List>
			</Popover>
		</>
	);
};

export default NotificationsPopOver;
