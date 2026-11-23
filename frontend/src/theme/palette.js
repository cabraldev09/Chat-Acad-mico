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
    divider: "#d5dde8",
    background: {
      // a blue-grey a step deeper than white, so the white boxes stand out on every screen
      default: "#e6edf5",
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
    // the dark of WhatsApp and of the Apple apps: neutral greys (no blue cast), the same on every screen and in the conversations
    text: { primary: "#e9edef", secondary: "#8696a0" },
    divider: "#2a2c2c",
    background: {
      default: "#111212",
      paper: "#161717",
      chat: "#0b0c0c",
    },
    action: {
      selected: "rgba(255, 255, 255, 0.08)",
      hover: "rgba(255, 255, 255, 0.05)",
    },
    cards: { background: "#161717" },
    appBar: { background: "rgba(22,23,23,0.88)" },
    scrollbar: { thumb: "rgba(255,255,255,.16)" },
    userMessage: { main: "#144d37" },
    contactMessage: { main: "#242626" },
    timestamp: { background: "#242626" },
    queue: { fallback: "#64748b" },
  },
};

export default palette;
