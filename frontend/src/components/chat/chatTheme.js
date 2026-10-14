// Palette for the conversations screen (light and dark), built on the brand colors:
// Catalina Blue #0B4279 (what we say, main actions), Cerulean #0693E3 (highlights) and Gorse #FEF84C (attention).
export const wa = (theme) =>
  theme.palette.type === "dark"
    ? {
        panel: "#0f1a28",
        panelAlt: "#16253a",
        header: "#0f1a28",
        inputBg: "#1b2d45",
        wallpaper: "#0a1420",
        dots: "rgba(124,196,245,.07)",
        bubbleIn: "#172a42",
        bubbleOut: "#0b4279",
        bubbleOutBg: "linear-gradient(140deg, #0d4f90 0%, #0b4279 100%)",
        bubbleOutText: "#ffffff",
        text: "#e8eef6",
        textSecondary: "#8ca0b8",
        time: "rgba(232,238,246,.55)",
        timeOut: "rgba(255,255,255,.72)",
        divider: "#1e3047",
        hover: "#14243a",
        selected: "#1b2d45",
        tick: "#7fd6ff",
        ackOut: "rgba(255,255,255,.7)",
        ackReadOut: "#fef84c",
        accent: "#3aa9f0",
        accentSolid: "#0b4279",
        badge: "#0693e3",
        badgeText: "#ffffff",
        chipBg: "#16253a",
        chipOn: "#12385e",
        chipOnText: "#8ccdf7",
        chipText: "#8ca0b8",
        chatChip: "rgba(22,37,58,.92)",
        quoteIn: "#12233a",
        quoteOut: "rgba(255,255,255,.14)",
        shadow: "0 1px 2px rgba(0,0,0,.35)",
        float: "0 10px 30px rgba(0,0,0,.45), 0 1px 3px rgba(0,0,0,.4)",
      }
    : {
        panel: "#ffffff",
        panelAlt: "#f3f6fb",
        header: "#ffffff",
        inputBg: "#f1f5fa",
        wallpaper: "#e8eff7",
        dots: "rgba(11,66,121,.07)",
        bubbleIn: "#ffffff",
        bubbleOut: "#0b4279",
        bubbleOutBg: "linear-gradient(140deg, #0d5ba3 0%, #0b4279 100%)",
        bubbleOutText: "#ffffff",
        text: "#0f1b2d",
        textSecondary: "#5b6b80",
        time: "#7a8a9e",
        timeOut: "rgba(255,255,255,.75)",
        divider: "#e3eaf3",
        hover: "#f3f6fb",
        selected: "#e8f1fb",
        tick: "#0693e3",
        ackOut: "rgba(255,255,255,.7)",
        ackReadOut: "#fef84c",
        accent: "#0b4279",
        accentSolid: "#0b4279",
        badge: "#0685cf",
        badgeText: "#ffffff",
        chipBg: "#eef3f9",
        chipOn: "#dcecfb",
        chipOnText: "#0b4279",
        chipText: "#4a5d75",
        chatChip: "rgba(255,255,255,.9)",
        quoteIn: "#eef3f9",
        quoteOut: "rgba(255,255,255,.14)",
        shadow: "0 1px 2px rgba(11,66,121,.10), 0 1px 1px rgba(11,66,121,.05)",
        float: "0 10px 30px rgba(11,66,121,.16), 0 1px 3px rgba(11,66,121,.10)",
      };

// "Hoje", "Ontem", weekday for the last week, otherwise dd/mm/aaaa
export const dayLabel = (date) => {
  const d = new Date(date);
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(new Date()) - startOf(d)) / 86400000);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Ontem";
  if (diff > 1 && diff < 7) {
    const w = d.toLocaleDateString("pt-BR", { weekday: "long" });
    return w.charAt(0).toUpperCase() + w.slice(1);
  }
  return d.toLocaleDateString("pt-BR");
};

export const clock = (date) =>
  new Date(date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

// what to show in the conversation list for the last message
export const previewOf = (ticket) => {
  const text = ticket.lastMessage || "";
  return text;
};
