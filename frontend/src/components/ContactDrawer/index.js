import React, { useState, useEffect } from "react";

import { makeStyles } from "@material-ui/core/styles";
import Typography from "@material-ui/core/Typography";
import IconButton from "@material-ui/core/IconButton";
import CloseIcon from "@material-ui/icons/Close";
import Menu from "@material-ui/core/Menu";
import { Copy, User as UserIcon, Phone } from "lucide-react";
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
import TextField from "@material-ui/core/TextField";
import MenuItem from "@material-ui/core/MenuItem";
import { relationOf } from "../RelationMenu";
import FormControlLabel from "@material-ui/core/FormControlLabel";
import { toast } from "react-toastify";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { wa } from "../chat/chatTheme";
import { colorOf, initialsOf } from "../../utils/avatar";

// "+55 69 99228-3812", as the WhatsApp shows a Brazilian number
export const prettyNumber = (raw) => {
	const n = String(raw || "").replace(/\D/g, "");
	if (/^55\d{10,11}$/.test(n)) {
		const ddd = n.slice(2, 4);
		const rest = n.slice(4);
		return `+55 ${ddd} ${rest.length === 9 ? `${rest.slice(0, 5)}-${rest.slice(5)}` : `${rest.slice(0, 4)}-${rest.slice(4)}`}`;
	}
	return n ? `+${n}` : String(raw || "");
};

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
		contactAvatar: { width: 200, height: 200, marginBottom: theme.spacing(1.5), fontSize: 64, fontWeight: 600, cursor: "zoom-in", [theme.breakpoints.down("xs")]: { width: 160, height: 160, fontSize: 52 } },
		about: { fontSize: 14.5, color: c.text, whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
		viewer: { position: "fixed", inset: 0, zIndex: 1400, background: "rgba(0,0,0,.86)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out", padding: 16 },
		name: { fontSize: 20, color: c.text, textAlign: "center" },
		number: { fontSize: 15, color: c.textSecondary },
		copyable: {
			border: 0, background: "transparent", fontFamily: "inherit", lineHeight: 1.35, padding: "2px 8px", borderRadius: 8, cursor: "pointer", maxWidth: "100%", overflowWrap: "anywhere",
			"&:hover, &:focus-visible": { background: c.hover, outline: "none" },
		},
		copyMenu: { minWidth: 240, maxWidth: "calc(100vw - 24px)", borderRadius: 12 },
		copyItem: { gap: 12, minHeight: 44, fontSize: 14 },
		copyValue: { display: "block", fontSize: 12, color: c.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 },
		label: { fontSize: 13, color: c.accent, marginBottom: 2 },
		"@global": { "@keyframes contactPanelIn": { from: { opacity: 0, transform: "translateX(24px)" }, to: { opacity: 1, transform: "none" } } },
	};
});

const ContactDrawer = ({ open, handleDrawerClose, contact: contactProp, loading, attendantId }) => {
	const contact = contactProp || {};
	const classes = useStyles();

	const [modalOpen, setModalOpen] = useState(false);
	const [relation, setRelation] = useState(null);
	const [community, setCommunity] = useState(null);
	// like the WhatsApp profile: the picture read now (also for the official number, through a QR connection) and the "recado"
	const [profile, setProfile] = useState(null);
	const [viewer, setViewer] = useState(false);
	// a click on the name or the number offers to copy them (never a "tel:" link, which makes the browser ask to open another app)
	const [copyEl, setCopyEl] = useState(null);
	const copy = async (value, done) => {
		setCopyEl(null);
		try {
			if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(value);
			else {
				const area = document.createElement("textarea");
				area.value = value;
				area.setAttribute("readonly", "");
				area.style.position = "fixed";
				area.style.opacity = "0";
				document.body.appendChild(area);
				area.select();
				document.execCommand("copy");
				document.body.removeChild(area);
			}
			toast.success(done);
		} catch (err) {
			toast.error("Não foi possível copiar. Selecione o texto e copie.");
		}
	};
	// the drawer is reused from one contact to the next
	useEffect(() => setRelation(null), [contact && contact.id]);
	useEffect(() => {
		setProfile(null);
		if (!open || !contact.id || contact.isGroup) return undefined;
		let alive = true;
		api.get(`/contacts/${contact.id}/profile`).then(({ data }) => { if (alive) setProfile(data); }).catch(() => undefined);
		return () => { alive = false; };
	}, [open, contact.id, contact.isGroup]);
	const picture = (profile && profile.profilePicUrl) || contact.profilePicUrl;

	if (!open) return null;

	return (
		<aside className={classes.panel}>
			<div className={classes.header}>
				<IconButton aria-label="Fechar" onClick={handleDrawerClose}>
					<CloseIcon />
				</IconButton>
				{i18n.t("contactDrawer.header")}
			</div>
			{loading ? (
				<ContactDrawerSkeleton classes={classes} />
			) : (
				<div className={classes.content}>
					<div className={classes.contactHeader}>
						<Avatar
							alt={contact.name}
							src={picture}
							className={classes.contactAvatar}
							onClick={() => picture && setViewer(true)}
							style={picture ? undefined : { background: colorOf(contact.number || contact.name), color: "#fff", cursor: "default" }}
						>
							{initialsOf(contact.name)}
						</Avatar>
						<button type="button" className={`${classes.name} ${classes.copyable}`} onClick={e => setCopyEl(e.currentTarget)} aria-haspopup="menu" title="Copiar o nome ou o número">
							{contact.name}
						</button>
						{contact.isGroup ? (
							<span className={classes.number}>{contact.kind === "community" || contact.parentGroupId ? "Comunidade" : "Grupo"}</span>
						) : (
							<button type="button" className={`${classes.number} ${classes.copyable}`} onClick={e => setCopyEl(e.currentTarget)} aria-haspopup="menu" title="Copiar o número">
								{String(contact.number || "").includes("_") ? contact.number : prettyNumber(contact.number)}
							</button>
						)}
						<Menu anchorEl={copyEl} open={Boolean(copyEl)} onClose={() => setCopyEl(null)} getContentAnchorEl={null}
							anchorOrigin={{ vertical: "bottom", horizontal: "center" }} transformOrigin={{ vertical: "top", horizontal: "center" }} PaperProps={{ className: classes.copyMenu }}>
							{!contact.isGroup && contact.number && !String(contact.number).includes("_") && (
								<MenuItem className={classes.copyItem} onClick={() => copy(prettyNumber(contact.number), "Número copiado.")}>
									<Phone size={18} />
									<span><span>Copiar número</span><span className={classes.copyValue}>{prettyNumber(contact.number)}</span></span>
								</MenuItem>
							)}
							{!contact.isGroup && contact.number && !String(contact.number).includes("_") && (
								<MenuItem className={classes.copyItem} onClick={() => copy(String(contact.number).replace(/\D/g, ""), "Número copiado só com os dígitos.")}>
									<Copy size={18} />
									<span><span>Copiar só os dígitos</span><span className={classes.copyValue}>{String(contact.number).replace(/\D/g, "")}</span></span>
								</MenuItem>
							)}
							<MenuItem className={classes.copyItem} onClick={() => copy(contact.name || "", "Nome copiado.")}>
								<UserIcon size={18} />
								<span><span>Copiar nome</span><span className={classes.copyValue}>{contact.name}</span></span>
							</MenuItem>
						</Menu>
						<Button variant="outlined" color="primary" size="small" style={{ marginTop: 8 }} onClick={() => setModalOpen(true)}>
							{i18n.t("contactDrawer.buttons.edit")}
						</Button>
					</div>
					{!contact.isGroup && profile && profile.about && (
						<div className={classes.card}>
							<div className={classes.label}>Recado</div>
							<div className={classes.about}>{profile.about}</div>
						</div>
					)}
					{viewer && picture && (
						<div className={classes.viewer} role="dialog" aria-label={`Foto de ${contact.name}`} onClick={() => setViewer(false)} onKeyDown={(e) => e.key === "Escape" && setViewer(false)} tabIndex={-1}>
							<img src={picture} alt={contact.name} style={{ maxWidth: "min(640px, 100%)", maxHeight: "100%", borderRadius: 4 }} />
						</div>
					)}
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
						<div className={classes.card} style={{ paddingTop: 12, paddingBottom: 12 }}>
							<TextField
								select fullWidth size="small" variant="outlined" label="Quem é esta pessoa"
								value={relation === null ? relationOf(contact) : relation}
								helperText={(relation === null ? relationOf(contact) : relation) === "customer" ? "Entra no funil e nas estatísticas." : "Fica fora do funil e das estatísticas, mesmo escrevendo para o sistema."}
								onChange={async (e) => {
									const next = e.target.value;
									const before = relation === null ? relationOf(contact) : relation;
									setRelation(next);
									try {
										await api.put(`/contacts/${contact.id}/relation`, { relation: next });
										toast.success(next === "customer" ? "Voltou a ser tratado como cliente." : "Fora do funil e das estatísticas.");
									} catch (err) {
										setRelation(before);
										toastError(err);
									}
								}}
							>
								<MenuItem value="customer">Cliente</MenuItem>
								<MenuItem value="friend">Amigo ou família</MenuItem>
								<MenuItem value="staff">Equipe da empresa</MenuItem>
							</TextField>
						</div>
					)}
					<div style={{ marginBottom: 8 }}>
						<LeadCard contactId={contact.id} attendantId={attendantId} />
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
