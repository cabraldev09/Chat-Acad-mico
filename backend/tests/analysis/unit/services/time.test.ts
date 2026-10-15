import { describe, expect, it } from "vitest";
import {
  businessDaysSince,
  daysSince,
  formatDateTime,
  formatRelativeTime,
  isBusinessHours,
  isSameNotificationPeriod,
  notificationPeriod,
  startOfCurrentMonth,
  zonedDateParts,
} from "@/lib/time";
import { suggestStartTerm } from "@/domain/curricular-analysis/simulation/terms";

describe("fuso horário da aplicação (America/Porto_Velho, UTC-4)", () => {
  it("exibe instantes UTC no horário de Rondônia", () => {
    // 22/09/2026 01:58 UTC = 21/09/2026 21:58 em Porto Velho
    expect(formatDateTime("2026-09-22T01:58:00.000Z")).toBe(
      "21/09/2026, 21:58",
    );
    expect(formatDateTime(null)).toBe("—");
  });

  it("calcula ano/mês civis no fuso da aplicação", () => {
    expect(zonedDateParts(new Date("2026-10-01T02:00:00.000Z"))).toEqual({
      year: 2026,
      month: 9,
      day: 30,
    });
  });

  it("início do mês respeita o fuso (não o do servidor)", () => {
    const start = startOfCurrentMonth(new Date("2026-10-01T02:00:00.000Z"));
    expect(start.toISOString()).toBe("2026-09-01T04:00:00.000Z");
  });

  it("sugere o semestre pelo calendário local", () => {
    // 1º de julho 02:00 UTC ainda é 30 de junho em Porto Velho → cabe X.2
    expect(suggestStartTerm(new Date("2026-07-01T02:00:00.000Z"))).toBe(
      "2026.2",
    );
    expect(suggestStartTerm(new Date("2026-07-01T12:00:00.000Z"))).toBe(
      "2027.1",
    );
  });

  it("descreve inatividade em linguagem natural", () => {
    const now = new Date("2026-09-21T12:00:00.000Z");
    expect(formatRelativeTime(null, now)).toBe("nunca");
    expect(formatRelativeTime("2026-09-21T11:59:30.000Z", now)).toBe("agora");
    expect(formatRelativeTime("2026-09-21T11:20:00.000Z", now)).toBe(
      "há 40 minutos",
    );
    expect(formatRelativeTime("2026-09-09T12:00:00.000Z", now)).toBe(
      "há 12 dias",
    );
    expect(daysSince("2026-09-09T12:00:00.000Z", now)).toBe(12);
    expect(daysSince(null)).toBeNull();
  });

  it("respeita horário comercial e fins de semana para lembretes", () => {
    expect(isBusinessHours(new Date("2026-09-21T12:00:00.000Z"))).toBe(true); // segunda, 08:00 em Porto Velho
    expect(isBusinessHours(new Date("2026-09-21T21:59:00.000Z"))).toBe(true); // 17:59
    expect(isBusinessHours(new Date("2026-09-21T22:00:00.000Z"))).toBe(false); // 18:00
    expect(isBusinessHours(new Date("2026-09-19T15:00:00.000Z"))).toBe(false); // sábado
    expect(
      businessDaysSince(
        "2026-09-18T21:00:00.000Z",
        new Date("2026-09-21T13:00:00.000Z"),
      ),
    ).toBe(1);
  });

  it("distingue os avisos da manhã e da tarde no mesmo dia", () => {
    const morning = new Date("2026-09-21T12:30:00.000Z"); // 08:30 em Porto Velho
    const afternoon = new Date("2026-09-21T18:30:00.000Z"); // 14:30 em Porto Velho
    expect(notificationPeriod(morning)).toBe("morning");
    expect(notificationPeriod(afternoon)).toBe("afternoon");
    expect(isSameNotificationPeriod(morning, afternoon)).toBe(false);
    expect(
      isSameNotificationPeriod(morning, new Date("2026-09-21T15:30:00.000Z")),
    ).toBe(true);
  });
});
