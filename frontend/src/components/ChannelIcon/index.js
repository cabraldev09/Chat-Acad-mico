import React from "react";
import { Globe } from "lucide-react";
import Brands from "../../icons/brands";

export const CHANNELS = {
  whatsapp: { label: "WhatsApp", color: "#25D366" },
  whatsapp_cloud: { label: "WhatsApp Cloud API", color: "#25D366" },
  telegram: { label: "Telegram", color: "#26A5E4" },
  messenger: { label: "Messenger", color: "#0A7CFF" },
  instagram: { label: "Instagram", color: "#E4405F" },
  webchat: { label: "Chat web", color: "#0693E3" },
};

const ChannelIcon = ({ channel, size = 18, withLabel = false }) => {
  const key = channel || "whatsapp";
  const c = CHANNELS[key] || CHANNELS.whatsapp;
  const Brand = Brands[key];
  return (
    <span title={c.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {Brand ? (
        <Brand size={size} style={{ flex: "none" }} />
      ) : (
        <Globe size={size} color={c.color} strokeWidth={2} style={{ flex: "none" }} />
      )}
      {withLabel && <span style={{ fontSize: 13 }}>{c.label}</span>}
    </span>
  );
};

export default ChannelIcon;
