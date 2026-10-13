import Whatsapp from "../../models/Whatsapp";

interface Interval {
  start: string; // "08:00"
  end: string; // "18:00"
}

export interface BusinessHoursConfig {
  enabled: boolean;
  timezone?: string;
  // "0" (Sunday) .. "6" (Saturday)
  days: Record<string, Interval[]>;
}

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

export const isWithinBusinessHours = (
  whatsapp: Whatsapp,
  now: Date = new Date()
): boolean => {
  if (!whatsapp.businessHours) return true;
  let config: BusinessHoursConfig;
  try {
    config = JSON.parse(whatsapp.businessHours);
  } catch (e) {
    return true;
  }
  if (!config.enabled) return true;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: config.timezone || "America/Sao_Paulo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value || "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    get("weekday")
  );
  const minutes = (Number(get("hour")) % 24) * 60 + Number(get("minute"));

  const intervals = config.days?.[String(weekday)] || [];
  return intervals.some(
    ({ start, end }) => minutes >= toMinutes(start) && minutes < toMinutes(end)
  );
};
