import React, { useState, useEffect } from "react";

import { makeStyles } from "@material-ui/core/styles";
import Typography from "@material-ui/core/Typography";
import IconButton from "@material-ui/core/IconButton";
import CloseIcon from "@material-ui/icons/Close";
import Link from "@material-ui/core/Link";
import InputLabel from "@material-ui/core/InputLabel";
import Avatar from "@material-ui/core/Avatar";
import Button from "@material-ui/core/Button";

import { i18n } from "../../translate/i18n";

import ContactModal from "../ContactModal";
import LeadCard from "../LeadCard";
import ContactDrawerSkeleton from "../ContactDrawerSkeleton";
import MarkdownWrapper from "../MarkdownWrapper";
import SharedMedia from "../SharedMedia";
import GroupInfo from "../GroupInfo";
import Switch from "@material-ui/core/Switch";
import FormControlLabel from "@material-ui/core/FormControlLabel";
import { toast } from "react-toastify";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { wa } from "../chat/chatTheme";

const useStyles = makeStyles(theme => {
	const c = wa(theme);
	return {
		panel: {
			flex: "none",
			width: 340,
			display: "flex",
			flexDirection: "column",
			backgroundColor: c.panelAlt,
			borderLeft: `1px solid ${c.divider}`,
			color: c.text,
			animation: "contactPanelIn .18s ease-out",
			[theme.breakpoints.down("sm")]: { position: "absolute", inset: 0, width: "100%", zIndex: 6 },
		},
		header: {
			flex: "none",
			display: "flex",
			alignItems: "center",
			gap: theme.spacing(1),
			minHeight: 60,
			padding: theme.spacing(0, 1.5),
			backgroundColor: c.header,
			borderBottom: `1px solid ${c.divider}`,
			fontWeight: 500,
		},
		content: { flex: 1, overflowY: "auto", ...theme.scrollbarStyles },
		card: { padding: theme.spacing(2), marginBottom: theme.spacing(1), backgroundColor: c.panel, boxShadow: c.shadow },
		contactHeader: {
			display: "flex",
			flexDirection: "column",
			alignItems: "center",
			gap: theme.spacing(0.5),
			padding: theme.spacing(3, 2, 2),
			marginBottom: theme.spacing(1),
			backgroundColor: c.panel,
			boxShadow: c.shadow,
		},
		contactAvatar: { width: 150, height: 150, marginBottom: theme.spacing(1) },
		name: { fontSize: 20, color: c.text, textAlign: "center" },
		number: { fontSize: 15, color: c.textSecondary },
		label: { fontSize: 13, color: c.accent, marginBottom: 2 },
		"@global": { "@keyframes contactPanelIn": { from: { opacity: 0, transform: "translateX(24px)" }, to: { opacity: 1, transform: "none" } } },
	};
});

const ContactDrawer = ({ open, handleDrawerClose, contact: contactProp, loading }) => {
	const contact = contactProp || {};
	const classes = useStyles();

	const [modalOpen, setModalOpen] = useState(false);
	const [staff, setStaff] = useState(null);
	const [community, setCommunity] = useState(null);
	// the drawer is reused from one contact to the next
	useEffect(() => setStaff(null), [contact && contact.id]);

	if (!open) return null;

	return (
		<aside className={classes.panel}>
			<div className={classes.header}>
				<IconButton onClick={handleDrawerClose}>
					<CloseIcon />
				</IconButton>
				{i18n.t("contactDrawer.header")}
			</div>
			{loading ? (
				<ContactDrawerSkeleton classes={classes} />
			) : (
				<div className={classes.content}>
					<div className={classes.contactHeader}>
						<Avatar alt={contact.name} src={contact.profilePicUrl} className={classes.contactAvatar} />
						<div className={classes.name}>{contact.name}</div>
						<Link className={classes.number} href={`tel:${contact.number}`}>
							{String(contact.number || "").includes("_") ? contact.number : `+${contact.number}`}
						</Link>
						<Button variant="outlined" color="primary" size="small" style={{ marginTop: 8 }} onClick={() => setModalOpen(true)}>
							{i18n.t("contactDrawer.buttons.edit")}
						</Button>
					</div>
					{contact.isGroup && (
						<div className={classes.card} style={{ paddingTop: 8, paddingBottom: 8 }}>
							<FormControlLabel
								style={{ margin: 0, alignItems: "flex-start" }}
								control={
									<Switch
										color="primary"
										checked={community === null ? contact.kind === "community" : community}
										onChange={async (e) => {
											const next = e.target.checked;
											setCommunity(next);
											try {
												await api.put(`/contacts/${contact.id}/community`, { community: next });
												toast.success(next ? "Este grupo agora aparece em Comunidades." : "Este grupo voltou para Grupos.");
											} catch (err) {
												setCommunity(!next);
												toastError(err);
											}
										}}
									/>
								}
								label={
									<div>
										<div style={{ fontWeight: 600, fontSize: 14 }}>Grupo de uma comunidade</div>
										<div style={{ fontSize: 12.5, opacity: 0.7 }}>Fica na lista Comunidades, sem aviso sonoro e sem bagunçar os grupos comuns.</div>
									</div>
								}
							/>
						</div>
					)}
					{contact.isGroup && <GroupInfo />}
					{!contact.isGroup && (
						<div className={classes.card} style={{ paddingTop: 8, paddingBottom: 8 }}>
							<FormControlLabel
								style={{ margin: 0, alignItems: "flex-start" }}
								control={
									<Switch
										color="primary"
										checked={staff === null ? !!contact.isStaff : staff}
										onChange={async (e) => {
											const next = e.target.checked;
											setStaff(next);
											try {
												await api.put(`/contacts/${contact.id}/staff`, { isStaff: next });
												toast.success(next ? "Marcado como da equipe." : "Desmarcado da equipe.");
											} catch (err) {
												setStaff(!next);
												toastError(err);
											}
										}}
									/>
								}
								label={
									<span>
										<span style={{ fontSize: 14 }}>É da equipe</span>
										<span style={{ display: "block", fontSize: 12, opacity: 0.7 }}>Não conta nas estatísticas nem no funil, mesmo sem login no sistema.</span>
									</span>
								}
							/>
						</div>
					)}
					<div style={{ marginBottom: 8 }}>
						<LeadCard contactId={contact.id} />
					</div>
					<SharedMedia />
					<ContactModal open={modalOpen} onClose={() => setModalOpen(false)} contactId={contact.id} />
					{contact?.extraInfo?.length > 0 && (
						<div className={classes.card}>
							<div className={classes.label}>{i18n.t("contactDrawer.extraInfo")}</div>
							{contact.extraInfo.map(info => (
								<div key={info.id} style={{ marginTop: 10 }}>
									<InputLabel>{info.name}</InputLabel>
									<Typography component="div" style={{ paddingTop: 2 }}>
										<MarkdownWrapper>{info.value}</MarkdownWrapper>
									</Typography>
								</div>
							))}
						</div>
					)}
				</div>
			)}
		</aside>
	);
};

export default ContactDrawer;
