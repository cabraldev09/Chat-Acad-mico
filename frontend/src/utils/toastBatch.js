// Many alerts of the same kind in a few seconds (the server checks every minute, and a copy from a phone can bring dozens at once) become
// ONE pop-up that says how many, instead of a wall of cards. The first item waits a moment for the others; then flush gets them all.
const groups = new Map();

export const batchToast = (key, item, flush, wait = 2500, idOf = (i) => (i && (i.id ?? i.ticketId ?? i.leadId)) ?? null) => {
  const group = groups.get(key);
  if (group) {
    // the same notice heard twice (two parts of the screen listen to it) counts once
    const id = idOf(item);
    if (id == null || !group.items.some((i) => idOf(i) === id)) group.items.push(item);
    return;
  }
  const items = [item];
  groups.set(key, {
    items,
    timer: setTimeout(() => {
      groups.delete(key);
      flush(items);
    }, wait),
  });
};

// "Michael Lemos, Karina Moraes e mais 3"
export const namesLine = (names, max = 2) => {
  const list = names.filter(Boolean);
  if (list.length <= max) return list.length === 2 ? `${list[0]} e ${list[1]}` : list.join("");
  const rest = list.length - max;
  return `${list.slice(0, max).join(", ")} e mais ${rest}`;
};

// the person is already looking at what the alert is about: no pop-up (the bell keeps it)
export const alreadyHere = (link) => {
  if (!link) return false;
  try {
    return window.location.pathname === link.split("?")[0];
  } catch (e) {
    return false;
  }
};
