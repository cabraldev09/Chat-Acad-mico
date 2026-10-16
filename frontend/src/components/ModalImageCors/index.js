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
}));

const ModalImageCors = ({ imageUrl, onOpen, sticker }) => {
	const classes = useStyles();
	const [fetching, setFetching] = useState(true);
	const [blobUrl, setBlobUrl] = useState("");

	useEffect(() => {
		// the gallery shows the picture straight from the server (cached by the browser): no extra download here
		if (!imageUrl || onOpen) return;
		const fetchImage = async () => {
			const { data, headers } = await api.get(imageUrl, {
				responseType: "blob",
			});
			const url = window.URL.createObjectURL(
				new Blob([data], { type: headers["content-type"] })
			);
			setBlobUrl(url);
			setFetching(false);
		};
		fetchImage();
	}, [imageUrl]);

	// inside a conversation the picture opens in the gallery (arrows to the neighbours)
	if (onOpen) {
		return (
			<img
				className={classes.messageMedia}
				style={sticker ? { cursor: "zoom-in", display: "block", width: 150, maxWidth: "100%", height: "auto", aspectRatio: "1 / 1", objectFit: "contain", background: "transparent" } : { cursor: "zoom-in", display: "block" }}
				src={imageUrl}
				loading="lazy"
				decoding="async"
				alt={sticker ? "figurinha" : "imagem"}
				onClick={onOpen}
			/>
		);
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
