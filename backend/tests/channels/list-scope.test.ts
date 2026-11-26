import { describe, expect, it } from "vitest";

import { itemInPolosSql, listVisibleSql, phoneKeyOf } from "../../src/helpers/ListScope";

describe("listas, campanhas e agendamentos por polo: a chave do telefone", () => {
  it("o mesmo celular com e sem o nono dígito é a mesma pessoa", () => {
    expect(phoneKeyOf("5569991234567")).toBe(phoneKeyOf("556991234567"));
    expect(phoneKeyOf("+55 (69) 99123-4567")).toBe("6991234567");
  });
  it("números diferentes ou de outro DDD não se confundem", () => {
    expect(phoneKeyOf("5569991234567")).not.toBe(phoneKeyOf("5511991234567"));
    expect(phoneKeyOf("5569991234567")).not.toBe(phoneKeyOf("5569991234568"));
  });
  it("número que não é brasileiro fica como está", () => {
    expect(phoneKeyOf("14155550100")).toBe("14155550100");
    expect(phoneKeyOf("")).toBe("");
  });
});

describe("listas por polo: o filtro em SQL", () => {
  it("o polo vira uma lista de números, nunca texto livre", () => {
    expect(itemInPolosSql([3, 7])).toContain("IN (3,7)");
    expect(itemInPolosSql([])).toContain("IN (0)");
    expect(itemInPolosSql([Number("1; DROP TABLE x") as any, 4])).toContain("IN (4)");
  });
  it("a lista é da coordenação quando ela a fez ou quando tem gente e TODA a gente é do polo", () => {
    const sql = listVisibleSql([3], 12);
    expect(sql).toContain('"createdById" = 12');
    expect(sql).toContain("EXISTS (SELECT 1 FROM \"ContactListItems\" vi");
    expect(sql).toContain("NOT EXISTS (SELECT 1 FROM \"ContactListItems\" i");
    expect(listVisibleSql([3], Number("x") as any)).toContain('"createdById" = 0');
  });
});
