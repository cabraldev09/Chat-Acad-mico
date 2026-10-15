import React from "react";
import Typography from "@material-ui/core/Typography";

import BackButton from "../BackButton";

// The heading of every page. Pages below another one (the setup screens) get the back arrow in front of it.
export default function Title(props) {
	return (
		<div style={{ display: "flex", alignItems: "center", marginRight: 16, minWidth: 0 }}>
			<BackButton />
			<Typography variant="h5" color="textPrimary" style={{ fontWeight: 600 }}>
				{props.children}
			</Typography>
		</div>
	);
}
