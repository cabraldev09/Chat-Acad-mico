// What identifies who is behind the site. The public pages (privacy, terms, data deletion) and the contact buttons read it. The values below are the
// ones the owner gave (MEI certificate and contact); a VITE_SITE_* variable of the deploy (Vercel → Settings → Environment Variables) overrides each one.
const env = (name, fallback = "") => String(import.meta.env[name] || (typeof window !== "undefined" && window.ENV && window.ENV[name]) || fallback).trim();

export const SITE = {
  name: "Chat Acadêmico",
  company: env("VITE_SITE_COMPANY", "65.694.680 João Vitor Cardoso Cabral"), // razão social (certificado MEI)
  cnpj: env("VITE_SITE_CNPJ", "65.694.680/0001-36"),
  email: env("VITE_SITE_EMAIL", "contatochatacademico@gmail.com"),
  whatsapp: env("VITE_SITE_WHATSAPP", "5569992283812").replace(/\D/g, ""), // only digits, with country code
  address: env("VITE_SITE_ADDRESS"),
  updatedAt: "29 de outubro de 2026",
};

export const contactHref = (subject = "Quero conhecer o Chat Acadêmico") => {
  if (SITE.whatsapp) return `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(subject)}`;
  if (SITE.email) return `mailto:${SITE.email}?subject=${encodeURIComponent(subject)}`;
  return "/login";
};
export const hasContact = !!(SITE.whatsapp || SITE.email);
