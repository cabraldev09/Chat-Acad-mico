// What makes noise when a new message arrives. Kept in this browser, separately for each user.
//
// System-wide:  "all"    -> every conversation plays the sound (except the ones set to "mute")
//               "alerts" -> only the contacts marked as "alert" play it
// Per contact:  "alert" (always plays) | "mute" (never plays) | nothing (follows the system setting)

import api from "../services/api";

const EVENT = "soundPrefsChanged";

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
};

let syncing = false;
let timer = null;

const snapshot = () => ({
  mode: read(`sound-prefs:${currentUser}:mode`, "all") === "alerts" ? "alerts" : "all",
  popup: read(`sound-prefs:${currentUser}:popup`, true) !== false,
  contacts: read(`sound-prefs:${currentUser}:contacts`, {}),
});

// every change also goes to the server (a moment later, in one request) so it follows the person everywhere
const pushToServer = () => {
  if (syncing || currentUser === "anon") return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    api.put("/me/preferences", { sound: snapshot() }).catch(() => {});
  }, 800);
};

const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* private window: the choice only lasts until the page is closed */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
  pushToServer();
};

// On login: the server's copy wins; when it has none yet, what this browser already has is uploaded.
export const loadSoundPrefsFromServer = async () => {
  if (currentUser === "anon") return;
  try {
    const { data } = await api.get("/me/preferences");
    if (data && data.sound) {
      syncing = true;
      try {
        localStorage.setItem(`sound-prefs:${currentUser}:mode`, JSON.stringify(data.sound.mode === "alerts" ? "alerts" : "all"));
        localStorage.setItem(`sound-prefs:${currentUser}:popup`, JSON.stringify(data.sound.popup !== false));
        localStorage.setItem(`sound-prefs:${currentUser}:contacts`, JSON.stringify(data.sound.contacts || {}));
      } catch (e) {
        /* storage unavailable: the in-memory defaults stay */
      }
      window.dispatchEvent(new CustomEvent(EVENT));
      syncing = false;
    } else {
      const local = snapshot();
      if (local.mode !== "all" || !local.popup || Object.keys(local.contacts).length) {
        await api.put("/me/preferences", { sound: local });
      }
    }
  } catch (e) {
    syncing = false;
  }
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
