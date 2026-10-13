import React from "react";
import { siWhatsapp, siTelegram, siMessenger, siInstagram, siFacebook } from "simple-icons";

// Official brand glyphs (Simple Icons) in their brand colors. Same props as the
// Lucide icons so they can be used anywhere an icon is expected.
const gradients = {
  instagram: (
    <linearGradient id="grad-instagram" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stopColor="#FEDA77" />
      <stop offset="0.25" stopColor="#F58529" />
      <stop offset="0.5" stopColor="#DD2A7B" />
      <stop offset="0.75" stopColor="#8134AF" />
      <stop offset="1" stopColor="#515BD4" />
    </linearGradient>
  ),
  messenger: (
    <linearGradient id="grad-messenger" x1="0.5" y1="0" x2="0.5" y2="1">
      <stop offset="0" stopColor="#00B2FF" />
      <stop offset="1" stopColor="#006AFF" />
    </linearGradient>
  ),
};

const make = (icon, { gradient, color } = {}) =>
  React.forwardRef(function BrandIcon({ size = "1em", className, style }, ref) {
    return (
      <svg
        ref={ref}
        role="img"
        viewBox="0 0 24 24"
        width={size}
        height={size}
        className={className}
        style={style}
        fill={gradient ? `url(#grad-${gradient})` : color || `#${icon.hex}`}
      >
        {gradient && <defs>{gradients[gradient]}</defs>}
        <path d={icon.path} />
      </svg>
    );
  });

export const WhatsAppBrand = make(siWhatsapp);
export const TelegramBrand = make(siTelegram);
export const MessengerBrand = make(siMessenger, { gradient: "messenger" });
export const InstagramBrand = make(siInstagram, { gradient: "instagram" });
export const FacebookBrand = make(siFacebook);

export default {
  whatsapp: WhatsAppBrand,
  whatsapp_cloud: WhatsAppBrand,
  telegram: TelegramBrand,
  messenger: MessengerBrand,
  instagram: InstagramBrand,
  facebook: FacebookBrand,
};
