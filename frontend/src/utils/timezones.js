// Every civil timezone used in Brazil (IANA names), west to east.
export const BRAZIL_TIMEZONES = [
  { value: "America/Rio_Branco", label: "Acre", detail: "AC" },
  { value: "America/Eirunepe", label: "Amazonas (oeste)", detail: "AM: Eirunepé, Benjamin Constant" },
  { value: "America/Porto_Velho", label: "Rondônia", detail: "RO" },
  { value: "America/Boa_Vista", label: "Roraima", detail: "RR" },
  { value: "America/Manaus", label: "Amazonas (leste)", detail: "AM: Manaus e região" },
  { value: "America/Cuiaba", label: "Mato Grosso", detail: "MT" },
  { value: "America/Campo_Grande", label: "Mato Grosso do Sul", detail: "MS" },
  { value: "America/Santarem", label: "Pará (oeste)", detail: "PA: Santarém, Itaituba" },
  { value: "America/Belem", label: "Pará (leste) e Amapá", detail: "PA: Belém · AP" },
  { value: "America/Araguaina", label: "Tocantins", detail: "TO" },
  { value: "America/Fortaleza", label: "Ceará, Maranhão, Piauí, Rio Grande do Norte e Paraíba", detail: "CE · MA · PI · RN · PB" },
  { value: "America/Recife", label: "Pernambuco", detail: "PE" },
  { value: "America/Maceio", label: "Alagoas e Sergipe", detail: "AL · SE" },
  { value: "America/Bahia", label: "Bahia", detail: "BA" },
  { value: "America/Sao_Paulo", label: "Brasília", detail: "SP · RJ · MG · ES · PR · SC · RS · GO · DF" },
  { value: "America/Noronha", label: "Fernando de Noronha", detail: "PE (ilha)" },
];

export const offsetLabel = (tz) => {
  try {
    const part = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, timeZoneName: "shortOffset" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName");
    return part ? part.value.replace("GMT", "UTC").replace("−", "-") : "";
  } catch (e) {
    return "";
  }
};

export const clockIn = (tz) => {
  try {
    return new Date().toLocaleTimeString("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    return "";
  }
};

// "Rondônia (RO) · UTC-4"
export const timezoneText = (tz) => {
  const z = BRAZIL_TIMEZONES.find((t) => t.value === tz);
  return z ? `${z.label} · ${offsetLabel(tz)}` : tz;
};
