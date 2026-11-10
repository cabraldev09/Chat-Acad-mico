import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode.react";
import { Dialog, DialogContent, Paper, Typography, CircularProgress, Button, TextField } from "@material-ui/core";

import openSocket from "../../services/socket-io";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";
import api from "../../services/api";

// The QR Code appears when the server finishes opening WhatsApp Web (a few seconds, up to a minute on a small server).
// It arrives by socket; asking the server every 3 s as well means a missed event never leaves the screen waiting.
const QrcodeModal = ({ open, onClose, whatsAppId }) => {
	const [qrCode, setQrCode] = useState("");
	const [waited, setWaited] = useState(0);
	const [retrying, setRetrying] = useState(false);
	const [askPhone, setAskPhone] = useState(false);
	const [phone, setPhone] = useState("");
	const closed = useRef(false);

	useEffect(() => {
		if (!whatsAppId) return undefined;
		closed.current = false;
		setQrCode("");
		setWaited(0);

		const fetchSession = async () => {
			try {
				const { data } = await api.get(`/whatsapp/${whatsAppId}`);
				if (closed.current) return;
				if (data.qrcode) setQrCode(data.qrcode);
				// the phone read it: the session moved on
				if (!data.qrcode && ["CONNECTED", "OPENING", "PAIRING"].includes(data.status) && !closed.current) {
					closed.current = true;
					onClose();
				}
			} catch (err) {
				if (!closed.current) toastError(err);
			}
		};
		fetchSession();
		const poll = setInterval(fetchSession, 3000);
		const tick = setInterval(() => setWaited((s) => s + 1), 1000);

		const socket = openSocket();
		socket.on("whatsappSession", data => {
			if (data.action === "update" && data.session.id === whatsAppId && data.session.qrcode) {
				setQrCode(data.session.qrcode);
			}
			if (data.action === "update" && data.session.id === whatsAppId && data.session.qrcode === "") {
				closed.current = true;
				onClose();
			}
		});

		return () => {
			closed.current = true;
			clearInterval(poll);
			clearInterval(tick);
			socket.disconnect();
		};
	}, [whatsAppId, onClose]);

	// switches this connection to the pairing code (a number typed on the phone) or back to the QR Code
	const switchWay = async (pairingPhone) => {
		setRetrying(true);
		try {
			await api.put(`/whatsappsession/${whatsAppId}`, { pairingPhone });
			setQrCode("");
			setWaited(0);
			setAskPhone(false);
		} catch (err) {
			toastError(err);
		}
		setRetrying(false);
	};

	const isCode = qrCode.startsWith("code:");
	const code = isCode ? qrCode.slice(5) : "";

	const retry = async () => {
		setRetrying(true);
		try {
			await api.put(`/whatsappsession/${whatsAppId}`);
			setWaited(0);
		} catch (err) {
			toastError(err);
		}
		setRetrying(false);
	};

	return (
		<Dialog open={open} onClose={onClose} maxWidth="lg" scroll="paper">
			<DialogContent>
				<Paper elevation={0} style={{ textAlign: "center", minWidth: 280 }}>
					<Typography color="primary" gutterBottom>
						{i18n.t("qrCode.message")}
					</Typography>
					{qrCode && isCode ? (
						<>
							<div style={{ fontSize: 40, fontWeight: 800, letterSpacing: "0.12em", fontVariantNumeric: "tabular-nums", margin: "10px 0 6px" }} aria-label={`Código de pareamento ${code.split("").join(" ")}`}>
								{code.slice(0, 4)}-{code.slice(4)}
							</div>
							<Typography variant="body2" style={{ maxWidth: 340, margin: "0 auto" }}>
								No celular, abra o WhatsApp → Aparelhos conectados → Conectar um aparelho → <b>Conectar com número de telefone</b> e digite este código.
							</Typography>
							<Button size="small" style={{ marginTop: 10 }} onClick={() => switchWay("")} disabled={retrying}>Prefiro ler o QR Code</Button>
						</>
					) : qrCode ? (
						<>
							<QRCode value={qrCode} size={256} />
							<Typography variant="caption" color="textSecondary" display="block" style={{ marginTop: 8 }}>
								O código se renova sozinho a cada poucos segundos. No celular: WhatsApp → Aparelhos conectados → Conectar um aparelho.
							</Typography>
							{!askPhone ? (
								<Button size="small" style={{ marginTop: 6 }} onClick={() => setAskPhone(true)}>Sem outro celular para ler? Conectar com código</Button>
							) : (
								<div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", marginTop: 8 }}>
									<TextField size="small" variant="outlined" label="Número com DDD" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="69 99999-9999" autoFocus />
									<Button variant="contained" color="primary" size="small" disabled={retrying || phone.replace(/\D/g, "").length < 10} onClick={() => switchWay(phone)}>Gerar código</Button>
								</div>
							)}
						</>
					) : (
						<div style={{ padding: "24px 0" }}>
							<CircularProgress size={34} />
							<Typography variant="body2" style={{ marginTop: 12 }}>Gerando o QR Code…</Typography>
							<Typography variant="caption" color="textSecondary" display="block" style={{ maxWidth: 320, margin: "6px auto 0" }}>
								O servidor está abrindo o WhatsApp. Costuma levar de 10 a 60 segundos. Não feche esta janela.
							</Typography>
							{waited > 75 && (
								<div style={{ marginTop: 14 }}>
									<Typography variant="caption" color="error" display="block" style={{ marginBottom: 6 }}>
										Está demorando mais que o normal. O servidor pode estar com pouca memória.
									</Typography>
									<Button size="small" variant="outlined" color="primary" onClick={retry} disabled={retrying}>Tentar de novo</Button>
								</div>
							)}
						</div>
					)}
				</Paper>
			</DialogContent>
		</Dialog>
	);
};

export default React.memo(QrcodeModal);
