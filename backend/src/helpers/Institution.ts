import { getSetting } from "./AppSettings";

// The name of the institution the assistant speaks for (Configurações → Geral). Read everywhere the agent introduces itself or describes
// who it is; kept in memory (loaded at start, refreshed when the setting is saved).
export const DEFAULT_INSTITUTION = "Cruzeiro do Sul Virtual";
let cached = DEFAULT_INSTITUTION;
export const institutionName = (): string => cached;
export const setInstitution = (value: string | null | undefined): void => {
  cached = String(value || "").replace(/\s+/g, " ").trim().slice(0, 80) || DEFAULT_INSTITUTION;
};
export const loadInstitution = async (): Promise<void> => setInstitution(await getSetting("institution_name", DEFAULT_INSTITUTION));
