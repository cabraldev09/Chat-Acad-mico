import { describe, expect, it } from "vitest";

import { contactPoloSql, ticketPoloSql } from "../../src/helpers/TicketPoloScope";

describe("conversas e contatos por polo (regra da coordenação e do relacionamento)", () => {
  it("coordenação: fila do polo ou lead do polo; relacionamento: só aluno matriculado do polo", () => {
    const coord = ticketPoloSql([3, 7], false, "t", true);
    expect(coord).toContain("pq.poloId IN (3,7)");
    expect(coord).toContain("pl.poloId IN (3,7)");
    expect(coord).not.toContain("enrolledAt");
    const rel = ticketPoloSql([3], true, "t", true);
    expect(rel).toContain("pl.enrolledAt IS NOT NULL");
    expect(rel).not.toContain("Queues");
  });
  it("sem polo, nenhuma conversa; nada além de números entra no SQL", () => {
    expect(ticketPoloSql([], false, "t", true)).toContain("IN (0)");
    expect(ticketPoloSql([1, NaN as any, -2, "4) OR 1=1 --" as any, 5], false, "t", true)).toContain("IN (1,5)");
    expect(contactPoloSql(["9; DROP TABLE x" as any], false, "c", true)).toContain("IN (0)");
  });
  it("no formato do Sequelize, os nomes saem entre aspas", () => {
    expect(ticketPoloSql([2], false)).toContain(`"Ticket"."contactId"`);
    expect(contactPoloSql([2], false)).toContain(`"Contact".id`);
  });
});
