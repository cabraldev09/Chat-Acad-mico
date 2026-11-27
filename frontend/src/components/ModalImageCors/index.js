import { refreshMediaUrl, renewMediaElement } from "../../services/media-access";
import React, { useState, useEffect } from "react";
import { makeStyles } from "@material-ui/core/styles";

import ModalImage from "react-modal-image";
import api from "../../services/api";

const useStyles = makeStyles(theme => ({
	messageMedia: {
		objectFit: "cover",
		// the picture follows the bubble (never wider than it) and keeps a fixed proportion while it loads
		width: 300,
		maxWidth: "100%",
		height: "auto",
		aspectRatio: "4 / 3",
		borderTopLeftRadius: 8,
		borderTopRightRadius: 8,
		borderBottomLeftRadius: 8,
		borderBottomRightRadius: 8,
	},
	box: {
		position: "relative",
		width: "100%",
		borderRadius: 6,
		overflow: "hidden",
		background: theme.palette.type === "dark" ? "rgba(255,255,255,.06)" : "rgba(11,20,26,.06)",
	},
	img: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block", cursor: "zoom-in", transition: "opacity .2s" },
	failed: { position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 12, textAlign: "center", fontSize: 13, lineHeight: "18px", color: theme.palette.type === "dark" ? "#8696a0" : "#667781" },
}));

// The proportion of each picture already seen (by its file, without the access token): a picture drawn again (another page of
// the conversation, a refresh) takes its final size at once and the conversation does not move.
const ratios = new Map();
const keyOf = (url) => String(url || "").split("?")[0];
// like WhatsApp: very tall or very wide pictures are cropped in the bubble (the full one opens in the gallery)
const clampRatio = (r) => Math.min(1.9, Math.max(0.75, r));
export const imageRatio = (url) => ratios.get(keyOf(url));
export const rememberRatio = (url, w, h) => {
	if (w > 0 && h > 0) ratios.set(keyOf(url), clampRatio(w / h));
	return ratios.get(keyOf(url));
};

// A picture in a bubble: it fills the bubble edge to edge and keeps its space while it loads (4:3 until the real size is known)
export const BubbleImage = ({ url, onOpen, overlay, alt = "imagem" }) => {
	const classes = useStyles();
	const [ratio, setRatio] = useState(() => imageRatio(url));
	const [loaded, setLoaded] = useState(false);
	const [failed, setFailed] = useState(false);
	useEffect(() => { setRatio(imageRatio(url)); setFailed(false); setLoaded(false); }, [url]);
	const onError = async (e) => {
		const el = e.currentTarget;
		if (el.dataset.renewing === "true") { setFailed(true); return; }
		const before = el.src;
		await renewMediaElement({ currentTarget: el });
		if (el.src === before) setFailed(true);
	};
	return (
		<div className={classes.box} style={{ aspectRatio: String(ratio || 4 / 3) }}>
			{failed ? (
				<div className={classes.failed} role="img" aria-label="Imagem indisponível">Não foi possível carregar a imagem</div>
			) : (
				<img
					className={classes.img}
					style={{ opacity: loaded ? 1 : 0 }}
					src={url}
					loading="lazy"
					decoding="async"
					alt={alt}
					onClick={onOpen}
					onError={onError}
					onLoad={(e) => { const el = e.currentTarget; setRatio(rememberRatio(url, el.naturalWidth, el.naturalHeight)); setLoaded(true); }}
				/>
			)}
			{overlay}
		</div>
	);
};

const ModalImageCors = ({ imageUrl, onOpen, sticker, overlay }) => {
	const classes = useStyles();
	const [fetching, setFetching] = useState(true);
	const [blobUrl, setBlobUrl] = useState("");

	useEffect(() => {
		// the gallery shows the picture straight from the server (cached by the browser): no extra download here
		if (!imageUrl || onOpen) return;
		const fetchImage = async () => {
			const { data, headers } = await api.get(await refreshMediaUrl(imageUrl), {
				responseType: "blob",
			});
			const url = window.URL.createObjectURL(
				new Blob([data], { type: headers["content-type"] })
			);
			setBlobUrl(url);
			setFetching(false);
		};
		fetchImage().catch(() => setFetching(false));
	}, [imageUrl]);

	// inside a conversation the picture opens in the gallery (arrows to the neighbours)
	if (onOpen) {
		if (sticker) {
			return (
				<img onError={renewMediaElement}
					style={{ cursor: "zoom-in", display: "block", width: 150, maxWidth: "100%", height: "auto", aspectRatio: "1 / 1", objectFit: "contain", background: "transparent" }}
					src={imageUrl}
					loading="lazy"
					decoding="async"
					alt="figurinha"
					onClick={onOpen}
				/>
			);
		}
		return <BubbleImage url={imageUrl} onOpen={onOpen} overlay={overlay} />;
	}

	return (
		<ModalImage
			className={classes.messageMedia}
			smallSrcSet={fetching ? imageUrl : blobUrl}
			medium={fetching ? imageUrl : blobUrl}
			large={fetching ? imageUrl : blobUrl}
			alt="image"
		/>
	);
};

export default ModalImageCors;
