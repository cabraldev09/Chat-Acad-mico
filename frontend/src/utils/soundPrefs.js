// What makes noise when a new message arrives. Kept in this browser, separately for each user.
//
// System-wide:  "all"    -> every conversation plays the sound (except the ones set to "mute")
//               "alerts" -> only the contacts marked as "alert" play it
// Per contact:  "alert" (always plays) | "mute" (never plays) | nothing (follows the system setting)

const EVENT = "soundPrefsChanged";

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
};

const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* private window: the choice only lasts until the page is closed */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
};

let currentUser = "anon";
export const setSoundPrefsUser = (userId) => {
  currentUser = String(userId || "anon");
};

const k = (name) => `sound-prefs:${currentUser}:${name}`;

export const getSoundMode = () => (read(k("mode"), "all") === "alerts" ? "alerts" : "all");
export const setSoundMode = (mode) => write(k("mode"), mode === "alerts" ? "alerts" : "all");

export const getPopupEnabled = () => read(k("popup"), true) !== false;
export const setPopupEnabled = (on) => write(k("popup"), !!on);

const contacts = () => read(k("contacts"), {});
export const getContactSound = (contactId) => contacts()[contactId] || "default";
export const setContactSound = (contactId, value) => {
  const all = contacts();
  if (value === "alert" || value === "mute") all[contactId] = value;
  else delete all[contactId];
  write(k("contacts"), all);
};
export const alertContactCount = () => Object.values(contacts()).filter((v) => v === "alert").length;

// should this contact's new message make a sound / show a pop-up?
export const shouldAlert = (contactId) => {
  const own = getContactSound(contactId);
  if (own === "alert") return true;
  if (own === "mute") return false;
  return getSoundMode() === "all";
};

export const onSoundPrefsChange = (fn) => {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
};

export const SOUND_CHOICES = [
  { value: "default", label: "Seguir o padrão do sistema", hint: "Toca ou não, conforme o som geral" },
  { value: "alert", label: "Contato de alerta", hint: "Sempre toca o som e avisa na tela" },
  { value: "mute", label: "Silenciar este contato", hint: "Nunca toca o som" },
];
