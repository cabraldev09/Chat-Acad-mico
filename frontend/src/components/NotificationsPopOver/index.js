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
import Chip from "@material-ui/core/Chip";
import { Bell, BellOff } from "lucide-react";

import TicketListItem from "../TicketListItem";
import { i18n } from "../../translate/i18n";
import useTickets from "../../hooks/useTickets";
import alertSound from "../../assets/sound.mp3";
import { AuthContext } from "../../context/Auth/AuthContext";

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
	mutedIcon: {
		color: theme.palette.warning ? theme.palette.warning.main : "#ed6c02",
	},
	muteBar: {
		padding: theme.spacing(1.25, 2),
		borderBottom: `1px solid ${theme.palette.divider}`,
	},
	muteRow: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: theme.spacing(1),
	},
	muteTitle: { fontSize: 14, fontWeight: 600 },
	muteHint: { fontSize: 12, color: theme.palette.text.secondary },
	muteChips: { display: "flex", flexWrap: "wrap", gap: theme.spacing(0.75), marginTop: theme.spacing(1) },
}));

// Silenced notifications keep the unread badge and the list, but make no sound and show no pop-up.
const FOREVER = 8640000000000000;
const MUTE_KEY = "notifications-muted-until";

const readMutedUntil = () => {
	try {
		const value = Number(localStorage.getItem(MUTE_KEY) || 0);
		return value > Date.now() ? value : 0;
	} catch (e) {
		return 0;
	}
};

const tomorrowMorning = () => {
	const d = new Date();
	d.setDate(d.getDate() + 1);
	d.setHours(8, 0, 0, 0);
	return d.getTime();
};

const MUTE_OPTIONS = [
	{ label: "Silenciar por 1 hora", until: () => Date.now() + 60 * 60 * 1000 },
	{ label: "Silenciar por 8 horas", until: () => Date.now() + 8 * 60 * 60 * 1000 },
	{ label: "Silenciar até amanhã 8h", until: tomorrowMorning },
	{ label: "Silenciar até eu reativar", until: () => FOREVER },
];

const muteLabel = until => {
	if (!until) return "";
	if (until === FOREVER) return "Silenciadas até você reativar";
	return `Silenciadas até ${format(new Date(until), "HH:mm")}`;
};

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
					(data.ticket.userId && data.ticket.userId !== user?.id) ||
					data.ticket.isGroup;

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

		const options = {
			body: `${message.body} - ${format(new Date(), "HH:mm")}`,
			icon: contact.profilePicUrl,
			tag: ticket.id,
			renotify: true,
		};

		const notification = new Notification(
			`${i18n.t("tickets.notification.message")} ${contact.name}`,
			options
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

		soundAlertRef.current();
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
			<Tooltip title={mutedUntil ? muteLabel(mutedUntil) : "Notificações"}>
				<IconButton
					onClick={handleClick}
					ref={anchorEl}
					aria-label="Notificações"
					className={`${classes.iconButton} ${mutedUntil ? classes.mutedIcon : ""}`}
				>
					<Badge badgeContent={notifications.length} color="primary" overlap="rectangular">
						{mutedUntil ? <BellOff size={20} /> : <Bell size={20} />}
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
				<div className={classes.muteBar}>
					<div className={classes.muteRow}>
						<div>
							<div className={classes.muteTitle}>Som e avisos na tela</div>
							<div className={classes.muteHint}>
								{mutedUntil ? muteLabel(mutedUntil) : "Ativados: você recebe aviso de novas mensagens"}
							</div>
						</div>
						<Switch
							color="primary"
							checked={!mutedUntil}
							onChange={e => setMutedUntil(e.target.checked ? 0 : FOREVER)}
							inputProps={{ "aria-label": "Ativar som e avisos na tela" }}
						/>
					</div>
					<div className={classes.muteChips}>
						{MUTE_OPTIONS.map(option => (
							<Chip
								key={option.label}
								size="small"
								clickable
								variant="outlined"
								label={option.label}
								onClick={() => setMutedUntil(option.until())}
							/>
						))}
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
