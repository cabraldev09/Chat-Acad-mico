import i18n from "i18next";

import { messages } from "./languages";

// The whole product is in Brazilian Portuguese: no browser language detection.
i18n.init({
	debug: false,
	lng: "pt",
	defaultNS: ["translations"],
	fallbackLng: "pt",
	ns: ["translations"],
	resources: messages,
});

export { i18n };
