// The limit by polo of raw SQL over Leads (see middleware/scope.crmPolosOf): "" when there is no limit (null = every polo).
// Never an empty IN (): no polo = no lead. Only whole positive numbers go into the text.
export const poloSql = (polos: number[] | null | undefined, col = "l.poloId"): string => {
  if (polos === null || polos === undefined) return "";
  const ids = polos.map(n => Math.trunc(Number(n))).filter(n => Number.isInteger(n) && n > 0);
  return `AND ${col} IN (${ids.length ? ids.join(", ") : "0"})`;
};
