// WhatsApp-style palette for the conversations screen (light and dark).
export const wa = (theme) =>
  theme.palette.type === "dark"
    ? {
        panel: "#111b21",
        panelAlt: "#202c33",
        header: "#202c33",
        inputBg: "#2a3942",
        wallpaper: "#0b141a",
        bubbleIn: "#202c33",
        bubbleOut: "#005c4b",
        text: "#e9edef",
        textSecondary: "#8696a0",
        time: "rgba(233,237,239,.6)",
        divider: "#222d34",
        hover: "#202c33",
        selected: "#2a3942",
        tick: "#53bdeb",
        accent: "#00a884",
        badge: "#00a884",
        badgeText: "#111b21",
        chipBg: "#202c33",
        chipOn: "#103529",
        chipOnText: "#06cf9c",
        chipText: "#8696a0",
        chatChip: "#182229",
        quoteIn: "#1d282f",
        quoteOut: "#025144",
        shadow: "0 1px 0.5px rgba(11,20,26,.4)",
      }
    : {
        panel: "#ffffff",
        panelAlt: "#f0f2f5",
        header: "#f0f2f5",
        inputBg: "#ffffff",
        wallpaper: "#efeae2",
        bubbleIn: "#ffffff",
        bubbleOut: "#d9fdd3",
        text: "#111b21",
        textSecondary: "#667781",
        time: "#667781",
        divider: "#e9edef",
        hover: "#f5f6f6",
        selected: "#f0f2f5",
        tick: "#53bdeb",
        accent: "#00a884",
        badge: "#25d366",
        badgeText: "#ffffff",
        chipBg: "#f0f2f5",
        chipOn: "#d9fdd3",
        chipOnText: "#008069",
        chipText: "#54656f",
        chatChip: "#ffffff",
        quoteIn: "#f5f6f6",
        quoteOut: "#cfe9ca",
        shadow: "0 1px 0.5px rgba(11,20,26,.13)",
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
