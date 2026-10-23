import React from "react";
import ReactDOM from "react-dom";
import CssBaseline from "@material-ui/core/CssBaseline";

import App from "./App";
import "./styles/app.css";
import "./styles/ui.css";
import { installModernToast } from "./utils/modernToast";
import { installAutoTitles } from "./utils/autoTitles";
import { installChunkRecovery } from "./utils/lazyPage";
import { installGlobalErrorReporting } from "./utils/errorReporting";
import { installVersionWatch } from "./utils/versionWatch";

installModernToast();
installAutoTitles();
installChunkRecovery();
installGlobalErrorReporting();
installVersionWatch();

ReactDOM.render(
	<CssBaseline>
		<App />
	</CssBaseline>,
	document.getElementById("root")
);

// ReactDOM.render(
// 	<React.StrictMode>
// 		<CssBaseline>
// 			<App />
// 		</CssBaseline>,
//   </React.StrictMode>

// 	document.getElementById("root")
// );
