// Every day of the chosen period, even the ones with nothing in them, so the charts show the real timeline.
// `byDay` maps "yyyy-MM-dd" to the values of that day; `empty` is what a day without data looks like.
export const fillDays = (from, to, byDay, empty) => {
  const out = [];
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return out;
  for (let d = new Date(start), n = 0; d <= end && n < 400; d.setDate(d.getDate() + 1), n += 1) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push({ ...empty, ...(byDay[key] || {}), key, day: `${key.slice(8, 10)}/${key.slice(5, 7)}` });
  }
  return out;
};
