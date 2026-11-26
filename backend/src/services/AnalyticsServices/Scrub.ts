import { redactPersonalData } from "../../analysis/services/pdf/redaction";

// the text that may leave the server: personal data and the names of the people in the conversation become tags
export const scrub = (text: string, names: string[] = []): string => {
  let out = redactPersonalData(String(text || ""));
  // phones with country code, protocols, card numbers: any run of 8 digits or more
  out = out.replace(/\+?\d[\d\s.-]{7,}\d/g, m => (m.replace(/\D/g, "").length >= 8 ? "[NUM]" : m));
  for (const full of names) {
    for (const part of String(full || "").split(/\s+/).filter(p => p.length >= 3)) {
      const safe = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      out = out.replace(new RegExp(`\\b${safe}\\b`, "gi"), "[NOME]");
    }
  }
  return out;
};

