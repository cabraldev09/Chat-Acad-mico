import React, { useContext } from "react";
import { makeStyles } from "@material-ui/core/styles";
import Typography from "@material-ui/core/Typography";
import { MessageCircle, Clock, ClipboardCheck } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import useTickets from "../../hooks/useTickets";
import { AuthContext } from "../../context/Auth/AuthContext";
import { i18n } from "../../translate/i18n";
import GlowCard from "../../components/GlowCard";
import NumberTicker from "../../components/NumberTicker";
import Chart from "./Chart";

const useStyles = makeStyles((theme) => ({
	page: { padding: theme.spacing(3), maxWidth: 1200, margin: "0 auto", height: "auto" },
	hello: { fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em" },
	date: { color: theme.palette.text.secondary, marginBottom: theme.spacing(3), "&::first-letter": { textTransform: "uppercase" } },
	kpis: {
		display: "grid",
		gap: theme.spacing(2),
		gridTemplateColumns: "repeat(3, 1fr)",
		[theme.breakpoints.down("sm")]: { gridTemplateColumns: "1fr" },
	},
	kpi: { padding: theme.spacing(2.5), display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
	kpiLabel: { color: theme.palette.text.secondary, fontSize: 14, fontWeight: 500 },
	kpiValue: { fontSize: 38, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.15, marginTop: 6 },
	tile: {
		width: 42,
		height: 42,
		borderRadius: 12,
		display: "grid",
		placeItems: "center",
		transition: "transform .3s var(--ease-spring)",
		".glow-card:hover &": { transform: "rotate(-6deg) scale(1.08)" },
	},
	chartCard: { marginTop: theme.spacing(2), padding: theme.spacing(2.5), height: 340, display: "flex", flexDirection: "column" },
}));

const Dashboard = () => {
	const classes = useStyles();
	const { user } = useContext(AuthContext);
	const userQueueIds = user.queues && user.queues.length > 0 ? user.queues.map((q) => q.id) : [];

	const count = (status) => {
		// eslint-disable-next-line react-hooks/rules-of-hooks
		const { count: c } = useTickets({
			status,
			showAll: "true",
			withUnreadMessages: "false",
			queueIds: JSON.stringify(userQueueIds),
		});
		return c;
	};

	const cards = [
		{ title: i18n.t("dashboard.messages.inAttendance.title"), value: count("open"), Icon: MessageCircle, bg: "rgba(6,147,227,.12)", fg: "#0693E3" },
		{ title: i18n.t("dashboard.messages.waiting.title"), value: count("pending"), Icon: Clock, bg: "rgba(254,248,76,.35)", fg: "#8a7a00" },
		{ title: i18n.t("dashboard.messages.closed.title"), value: count("closed"), Icon: ClipboardCheck, bg: "rgba(11,66,121,.10)", fg: "#0B4279" },
	];

	return (
		<div className={classes.page}>
			<Typography className={classes.hello}>Olá, {user.name?.split(" ")[0]}</Typography>
			<Typography className={classes.date}>{format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR }).replace("-feira", "-feira")}</Typography>
			<div className={classes.kpis}>
				{cards.map(({ title, value, Icon, bg, fg }) => (
					<GlowCard key={title} className={classes.kpi}>
						<div>
							<div className={classes.kpiLabel}>{title}</div>
							<div className={classes.kpiValue}>
								<NumberTicker value={value || 0} />
							</div>
						</div>
						<div className={classes.tile} style={{ background: bg, color: fg }}>
							<Icon size={20} />
						</div>
					</GlowCard>
				))}
			</div>
			<GlowCard className={classes.chartCard}>
				<Chart />
			</GlowCard>
		</div>
	);
};

export default Dashboard;
