import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/services/AiServices/Keys", () => ({ anthropicAccess: async () => ({ apiKey: "" }), openaiAccess: async () => ({ apiKey: "" }) }));

import { cleanPrintReading, PrintReadError, readCoursePrint } from "../../src/services/CommercialServices/CoursePrint";

describe("the print of a course read by the AI", () => {
  it("keeps the format, the percentages from 0 to 100 and the text, without emoji", () => {
    const r = cleanPrintReading({ curso: " Biomedicina ", formato: "semipresencial", percentualPresencial: "40%", percentualSincrono: 20, textoAprovado: "Com as mudanças do MEC 🎓 o curso terá 40% de prática." });
    expect(r).toEqual({ course: "Biomedicina", format: "Semipresencial", percent: 40, syncPercent: 20, text: "Com as mudanças do MEC o curso terá 40% de prática." });
  });
  it("refuses a percentage out of range and a format it does not know", () => {
    const r = cleanPrintReading({ formato: "híbrido", percentualPresencial: 140, percentualSincrono: -5, textoAprovado: "" });
    expect(r).toEqual({ course: null, format: null, percent: null, syncPercent: null, text: null });
    expect(cleanPrintReading({ formato: "Ensino a distância", percentualPresencial: "12,5" })).toMatchObject({ format: "EAD", percent: 12.5 });
    expect(cleanPrintReading(null)).toEqual({ course: null, format: null, percent: null, syncPercent: null, text: null });
  });
  it("without a key of AI the print waits to be filled in by hand", async () => {
    await expect(readCoursePrint(Buffer.from("x"), "image/png", "Direito")).rejects.toBeInstanceOf(PrintReadError);
  });
});
