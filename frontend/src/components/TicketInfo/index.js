import React from "react";

import { Avatar, CardHeader } from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";

import { i18n } from "../../translate/i18n";
import ChannelIcon from "../ChannelIcon";

const useStyles = makeStyles(theme => ({
	queueStrip: {
		position: "absolute",
		top: 0,
		left: 0,
		width: 8,
		height: "100%",
		backgroundColor: theme.palette.queue.fallback,
	},
}));

const TicketInfo = ({ contact, ticket, onClick }) => {
	const classes = useStyles();

	return (
		<>
			<span
				className={classes.queueStrip}
				style={{ backgroundColor: ticket.queue?.color }}
			/>
			<CardHeader
				onClick={onClick}
				style={{ cursor: "pointer" }}
				titleTypographyProps={{ noWrap: true }}
				subheaderTypographyProps={{ noWrap: true }}
				avatar={
					<Avatar src={contact.profilePicUrl} alt="contact_image">
						{contact.name?.charAt(0)}
					</Avatar>
				}
				title={
					<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
						<ChannelIcon channel={ticket.whatsapp?.channel} />
						{`${contact.name} #${ticket.id}`}
					</span>
				}
				subheader={
					<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
						{ticket.user &&
							`${i18n.t("messagesList.header.assignedTo")} ${ticket.user.name}`}
						{(ticket.tags || []).map((t) => (
							<span
								key={t.id}
								style={{
									background: t.color,
									color: "#fff",
									borderRadius: 8,
									padding: "0 7px",
									fontSize: 11,
								}}
							>
								{t.name}
							</span>
						))}
					</span>
				}
			/>
		</>
	);
};

export default TicketInfo;
