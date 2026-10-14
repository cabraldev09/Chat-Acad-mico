import React, { useState, useEffect, useReducer, useContext } from "react";
import openSocket from "../../services/socket-io";

import { makeStyles } from "@material-ui/core/styles";
import List from "@material-ui/core/List";
import Paper from "@material-ui/core/Paper";

import TicketListItem from "../TicketListItem";
import TicketsListSkeleton from "../TicketsListSkeleton";

import useTickets from "../../hooks/useTickets";
import { i18n } from "../../translate/i18n";
import { AuthContext } from "../../context/Auth/AuthContext";
import { Link } from "react-router-dom";

const useStyles = makeStyles(theme => ({
	// fills the width of its container: without this the list shrank to the width of its longest message
	ticketsListWrapper: {
		position: "relative",
		display: "flex",
		flex: "1 1 auto",
		width: "100%",
		minWidth: 0,
		height: "100%",
		flexDirection: "column",
		overflow: "hidden",
	},

	ticketsList: {
		flex: 1,
		minWidth: 0,
		overflowY: "auto",
		...theme.scrollbarStyles,
	},

	ticketsListHeader: {
		color: "rgb(67, 83, 105)",
		zIndex: 2,
		backgroundColor: "white",
		borderBottom: "1px solid rgba(0, 0, 0, 0.12)",
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
	},

	ticketsCount: {
		fontWeight: "normal",
		color: "rgb(104, 121, 146)",
		marginLeft: "8px",
		fontSize: "14px",
	},

	noTicketsText: {
		textAlign: "center",
		color: theme.palette.text.secondary,
		fontSize: "14px",
		lineHeight: "1.4",
	},

	noTicketsTitle: {
		textAlign: "center",
		fontSize: "16px",
		fontWeight: "600",
		margin: "0px",
	},

	noTicketsDiv: {
		display: "flex",
		height: "100px",
		margin: 40,
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
	},
}));

// unread/new activity goes to the top, but below the conversations this person pinned
const toTop = (state, ticket, index) => {
	if (index !== -1) state.splice(index, 1);
	state.splice(ticket.pinned ? 0 : state.filter(t => t.pinned).length, 0, ticket);
};

const reducer = (state, action) => {
	if (action.type === "SET_PINNED") {
		const { ticketId, pinned } = action.payload;
		const idx = state.findIndex(t => t.id === ticketId);
		if (idx === -1) return state;
		const ticket = { ...state[idx], pinned };
		state.splice(idx, 1);
		state.splice(pinned ? 0 : state.filter(t => t.pinned).length, 0, ticket);
		return [...state];
	}

	if (action.type === "LOAD_TICKETS") {
		const newTickets = action.payload;

		newTickets.forEach(ticket => {
			const ticketIndex = state.findIndex(t => t.id === ticket.id);
			if (ticketIndex !== -1) {
				state[ticketIndex] = ticket;
				if (ticket.unreadMessages > 0) toTop(state, ticket, ticketIndex);
			} else {
				state.push(ticket);
			}
		});

		return [...state];
	}

	if (action.type === "RESET_UNREAD") {
		const ticketId = action.payload;

		const ticketIndex = state.findIndex(t => t.id === ticketId);
		if (ticketIndex !== -1) {
			state[ticketIndex].unreadMessages = 0;
		}

		return [...state];
	}

	if (action.type === "UPDATE_TICKET") {
		const ticket = action.payload;

		const ticketIndex = state.findIndex(t => t.id === ticket.id);
		if (ticketIndex !== -1) {
			// socket payloads do not carry this person's pin: keep what the list already knows
			state[ticketIndex] = { ...ticket, pinned: state[ticketIndex].pinned };
		} else {
			toTop(state, ticket, -1);
		}

		return [...state];
	}

	if (action.type === "UPDATE_TICKET_UNREAD_MESSAGES") {
		const ticket = action.payload;

		const ticketIndex = state.findIndex(t => t.id === ticket.id);
		const pinned = ticketIndex !== -1 ? state[ticketIndex].pinned : false;
		toTop(state, { ...ticket, pinned }, ticketIndex);

		return [...state];
	}

	if (action.type === "UPDATE_TICKET_TAGS") {
		const { ticketId, tags } = action.payload;
		const ticketIndex = state.findIndex(t => t.id === ticketId);
		if (ticketIndex !== -1) {
			state[ticketIndex] = { ...state[ticketIndex], tags };
		}
		return [...state];
	}

	if (action.type === "UPDATE_TICKET_CONTACT") {
		const contact = action.payload;
		const ticketIndex = state.findIndex(t => t.contactId === contact.id);
		if (ticketIndex !== -1) {
			state[ticketIndex].contact = contact;
		}
		return [...state];
	}

	if (action.type === "DELETE_TICKET") {
		const ticketId = action.payload;
		const ticketIndex = state.findIndex(t => t.id === ticketId);
		if (ticketIndex !== -1) {
			state.splice(ticketIndex, 1);
		}

		return [...state];
	}

	if (action.type === "RESET") {
		return [];
	}
};

	const TicketsList = (props) => {
		const { status, searchParam, showAll, selectedQueueIds, updateCount, style, withUnreadMessages, groups, archived, historical, everything } =
			props;
	const classes = useStyles();
	const [pageNumber, setPageNumber] = useState(1);
	const [ticketsList, dispatch] = useReducer(reducer, []);
	const { user } = useContext(AuthContext);

	useEffect(() => {
		dispatch({ type: "RESET" });
		setPageNumber(1);
	}, [status, searchParam, dispatch, showAll, selectedQueueIds, withUnreadMessages, groups, archived, historical, everything]);

	const { tickets, hasMore, loading } = useTickets({
		pageNumber,
		searchParam,
		status,
		showAll,
		withUnreadMessages: withUnreadMessages ? "true" : undefined,
		groups,
		archived: archived ? "true" : undefined,
		historical: everything ? "all" : historical ? "true" : undefined,
		queueIds: JSON.stringify(selectedQueueIds),
	});

	useEffect(() => {
		if (!status && !searchParam && !withUnreadMessages && !groups && !archived && !historical && !everything) return;
		dispatch({
			type: "LOAD_TICKETS",
			payload: tickets,
		});
	}, [tickets]);

	useEffect(() => {
		const socket = openSocket();

		// "only": just groups; "exclude": private chats only
		const groupOk = ticket =>
			groups === "only" ? !!ticket.isGroup : groups === "exclude" ? !ticket.isGroup : true;

		// archived conversations live only in their own view
		const archiveOk = ticket => !!ticket.archivedAt === !!archived;

		const shouldUpdateTicket = ticket => !historical && !searchParam && groupOk(ticket) && archiveOk(ticket) &&
			(!ticket.userId || ticket.userId === user?.id || showAll) &&
			(!ticket.queueId || selectedQueueIds.indexOf(ticket.queueId) > -1);

		const notBelongsToUserQueues = ticket =>
			ticket.queueId && selectedQueueIds.indexOf(ticket.queueId) === -1;

		socket.on("connect", () => {
			if (status) {
				socket.emit("joinTickets", status);
			} else {
				socket.emit("joinNotification");
			}
		});

		socket.on("ticket", data => {
			if (data.action === "updateUnread") {
				dispatch({
					type: "RESET_UNREAD",
					payload: data.ticketId,
				});
			}

			if (data.action === "update" && shouldUpdateTicket(data.ticket)) {
				dispatch({
					type: "UPDATE_TICKET",
					payload: data.ticket,
				});
			}

			if (data.action === "update" && !archiveOk(data.ticket)) {
				dispatch({ type: "DELETE_TICKET", payload: data.ticket.id });
			}

			if (data.action === "update" && notBelongsToUserQueues(data.ticket)) {
				dispatch({ type: "DELETE_TICKET", payload: data.ticket.id });
			}

			if (data.action === "delete") {
				dispatch({ type: "DELETE_TICKET", payload: data.ticketId });
			}

			if (data.action === "tags") {
				dispatch({
					type: "UPDATE_TICKET_TAGS",
					payload: { ticketId: data.ticketId, tags: data.tags },
				});
			}
		});

		socket.on("appMessage", data => {
			if (data.action === "create" && shouldUpdateTicket(data.ticket)) {
				dispatch({
					type: "UPDATE_TICKET_UNREAD_MESSAGES",
					payload: data.ticket,
				});
			}
		});

		socket.on("contact", data => {
			if (data.action === "update") {
				dispatch({
					type: "UPDATE_TICKET_CONTACT",
					payload: data.contact,
				});
			}
		});

		return () => {
			socket.disconnect();
		};
	}, [status, searchParam, showAll, user, selectedQueueIds, groups, archived]);

	// pins are toggled from the list item or the chat header
	useEffect(() => {
		const onPin = e => dispatch({ type: "SET_PINNED", payload: e.detail });
		window.addEventListener("ticketPinned", onPin);
		return () => window.removeEventListener("ticketPinned", onPin);
	}, []);

	useEffect(() => {
    if (typeof updateCount === "function") {
      updateCount(ticketsList.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketsList]);

	const loadMore = () => {
		setPageNumber(prevState => prevState + 1);
	};

	const handleScroll = e => {
		if (!hasMore || loading) return;

		const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;

		if (scrollHeight - (scrollTop + 100) < clientHeight) {
			e.currentTarget.scrollTop = scrollTop - 100;
			loadMore();
		}
	};

	return (
    <Paper
      elevation={0}
      square
      className={classes.ticketsListWrapper}
      style={style}
    >
			<Paper
				square
				name="closed"
				elevation={0}
				className={classes.ticketsList}
				onScroll={handleScroll}
			>
				<List style={{ paddingTop: 0 }}>
					{ticketsList.length === 0 && !loading ? (
						<div className={classes.noTicketsDiv}>
							<span className={classes.noTicketsTitle}>
								{i18n.t("ticketsList.noTicketsTitle")}
							</span>
							{historical ? (
								<p className={classes.noTicketsText}>
									O histórico são as conversas que já existiam no WhatsApp quando o número foi conectado. Elas aparecem aqui sem entrar nas contagens.
									<br />
									<Link to="/connections" style={{ fontWeight: 600 }}>Copiar as conversas do WhatsApp</Link>
								</p>
							) : props.groups === "only" ? (
								<p className={classes.noTicketsText}>
									Nenhum grupo ainda. Os grupos e comunidades do WhatsApp aparecem aqui quando o número conecta (ou ao copiar as conversas).
									<br />
									<Link to="/connections" style={{ fontWeight: 600 }}>Ir para Conexões e copiar as conversas</Link>
								</p>
							) : (
								<p className={classes.noTicketsText}>
									{i18n.t("ticketsList.noTicketsMessage")}
								</p>
							)}
						</div>
					) : (
						<>
							{ticketsList.map(ticket => (
								<TicketListItem ticket={ticket} key={ticket.id} />
							))}
						</>
					)}
					{loading && <TicketsListSkeleton />}
				</List>
			</Paper>
    </Paper>
	);
};

export default TicketsList;
