export const normalizeCpf = (raw?: string | null): string | null => {
  if (!raw) return null;
  const d = String(raw).replace(/\D/g, "");
  return d.length === 11 ? d : null;
};

// Check digits (mod 11); rejects 000.000.000-00 style sequences
export const isValidCpf = (raw?: string | null): boolean => {
  const d = normalizeCpf(raw);
  if (!d || /^(\d)\1{10}$/.test(d)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i += 1) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digit(9) === Number(d[9]) && digit(10) === Number(d[10]);
};

export const maskCpf = (raw?: string | null): string | null => {
  const d = normalizeCpf(raw);
  return d ? `***.***.${d.slice(6, 9)}-${d.slice(9)}` : null;
};
