// The team's standard week, the same the server uses (helpers/BusinessTime.standardWeek): Monday to Thursday 08:00-18:00, Friday
// 08:00-17:00, no weekend. Days are "0" (Sunday) to "6" (Saturday). Every hours editor starts from here.
export const STANDARD_WEEK = {
  0: [],
  1: [{ start: "08:00", end: "18:00" }],
  2: [{ start: "08:00", end: "18:00" }],
  3: [{ start: "08:00", end: "18:00" }],
  4: [{ start: "08:00", end: "18:00" }],
  5: [{ start: "08:00", end: "17:00" }],
  6: [],
};
// the hours a day gets when it is turned on (Friday ends at 17:00; Saturday and Sunday follow a weekday)
export const dayDefault = (d) => ({ ...((STANDARD_WEEK[Number(d)] || [])[0] || { start: "08:00", end: Number(d) === 5 ? "17:00" : "18:00" }) });
export const standardDays = () => Object.fromEntries(Object.entries(STANDARD_WEEK).map(([d, list]) => [d, list.map((i) => ({ ...i }))]));
