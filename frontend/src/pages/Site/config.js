// What identifies who is behind the site. The public pages (privacy, terms, data deletion) and the contact buttons read it: set the VITE_SITE_* variables
// of the deploy (Vercel → Settings → Environment Variables) so the real company name, e-mail and WhatsApp show up. Nothing here is invented.
const env = (name, fallback = "") => String(import.meta.env[name] || (typeof window !== "undefined" && window.ENV && window.ENV[name]) || fallback).trim();

export const SITE = {
  name: "Chat Acadêmico",
  company: env("VITE_SITE_COMPANY"), // razão social
  cnpj: env("VITE_SITE_CNPJ"),
  email: env("VITE_SITE_EMAIL"),
  whatsapp: env("VITE_SITE_WHATSAPP").replace(/\D/g, ""), // only digits, with country code: 5569999999999
  address: env("VITE_SITE_ADDRESS"),
  updatedAt: "29 de outubro de 2026",
};

export const contactHref = (subject = "Quero conhecer o Chat Acadêmico") => {
  if (SITE.whatsapp) return `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(subject)}`;
  if (SITE.email) return `mailto:${SITE.email}?subject=${encodeURIComponent(subject)}`;
  return "/login";
};
export const hasContact = !!(SITE.whatsapp || SITE.email);
