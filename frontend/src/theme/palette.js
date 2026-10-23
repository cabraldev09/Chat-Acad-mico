// Brand: Catalina Blue #0B4279 (primary), Cerulean #0693E3 (accent), Gorse #FEF84C (highlight)
// Neutrals are slate with a faint blue cast so they sit with the brand colors.
export const brand = {
  catalina: "#0B4279",
  cerulean: "#0693E3",
  gorse: "#FEF84C",
};

const palette = {
  light: {
    primary: {
      main: brand.catalina,
      light: brand.cerulean,
      dark: "#082f57",
      contrastText: "#FFFFFF",
    },
    secondary: {
      main: "#475569",
      dark: "#334155",
    },
    accent: { main: brand.cerulean, highlight: brand.gorse, onHighlight: "#0a2a4d" },
    success: { main: "#16a34a" },
    error: { main: "#dc2626" },
    warning: { main: "#d97706" },
    text: { primary: "#0b1a2e", secondary: "#64748b" },
    divider: "#dde2ea",
    background: {
      // a tinted blue-grey page: white cards stand out from it (it used to be #f6f8fb, almost the same white as the cards)
      default: "#f1f3f7",
      paper: "#ffffff",
      chat: "#f1f5f9",
    },
    action: {
      selected: "rgba(11, 66, 121, 0.08)",
      hover: "rgba(11, 66, 121, 0.05)",
    },
    cards: { background: "#ffffff" },
    appBar: { background: "rgba(255,255,255,0.82)" },
    scrollbar: { thumb: "rgba(11,66,121,.18)" },
    userMessage: { main: "#dbeefc" },
    contactMessage: { main: "#ffffff" },
    timestamp: { background: "#e2e8f0" },
    queue: { fallback: "#94a3b8" },
  },
  dark: {
    primary: {
      main: brand.cerulean,
      light: "#5bb8f0",
      dark: "#0577bd",
      contrastText: "#03121f",
    },
    secondary: {
      main: "#94a3b8",
      dark: "#64748b",
    },
    accent: { main: brand.cerulean, highlight: brand.gorse, onHighlight: "#0a2a4d" },
    success: { main: "#22c55e" },
    error: { main: "#f87171" },
    warning: { main: "#fbbf24" },
    text: { primary: "#e8edf5", secondary: "#8b97ab" },
    divider: "#232c3d",
    background: {
      default: "#0b0f17",
      paper: "#141a26",
      chat: "#0e1320",
    },
    action: {
      selected: "rgba(6, 147, 227, 0.14)",
      hover: "rgba(148, 163, 184, 0.08)",
    },
    cards: { background: "#141a26" },
    appBar: { background: "rgba(11,15,23,0.85)" },
    scrollbar: { thumb: "hsla(210,40%,90%,.16)" },
    userMessage: { main: "#0b3a63" },
    contactMessage: { main: "#1b2333" },
    timestamp: { background: "#232c3d" },
    queue: { fallback: "#64748b" },
  },
};

export default palette;
