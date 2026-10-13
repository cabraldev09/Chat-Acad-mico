import React from "react";

import { makeStyles } from "@material-ui/core/styles";

const useStyles = makeStyles(theme => ({
	contactsHeader: {
		display: "flex",
		flexWrap: "wrap",
		alignItems: "center",
		gap: theme.spacing(1),
		padding: theme.spacing(0.5, 0.5, 2),
	},
}));

const MainHeader = ({ children }) => {
	const classes = useStyles();

	return <div className={classes.contactsHeader}>{children}</div>;
};

export default MainHeader;
