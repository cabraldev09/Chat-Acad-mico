import { describe, it, expect } from "vitest";
import { graduacao2Block, is20, offer20Text, previousFrom, routeFor, text20, twinOf } from "../../../src/services/CommercialServices/Graduacao2";

const list = ["Educação Física", "Educação Física 2.0", "Administração", "Administração 2.0", "Ciências Contábeis", "Ciências Contábeis 2.0", "Engenharia De Produção", "Engenharia De Produção 2.0", "Pedagogia"].map((name, i) => ({ id: i + 1, name }));

describe("Graduação 2.0: a second degree only for who has the degree it asks for", () => {
  it("knows the 2.0 courses and their twin", () => {
    expect(is20("Educação Física 2.0")).toBe(true);
    expect(is20("Educação Física")).toBe(false);
    expect(twinOf("Educação Física 2.0", list)?.name).toBe("Educação Física");
    expect(twinOf("Administração", list)?.name).toBe("Administração 2.0");
    expect(twinOf("Pedagogia", list)).toBeNull();
  });
  it("opens a 2.0 course only for the degrees of the table", () => {
    expect(routeFor("Educação Física 2.0", "Licenciatura em Educação Física")?.semesters).toBe(4);
    expect(routeFor("Educação Física 2.0", "bacharelado em educação física")).toBeNull();
    expect(routeFor("Ciências Contábeis 2.0", "Administração")?.semesters).toBe(2);
    expect(routeFor("Ciências Contábeis 2.0", "Direito")).toBeNull();
    expect(routeFor("Administração 2.0", "Cst Em Gestão De Recursos Humanos")?.semesters).toBe(4);
    expect(routeFor("Administração 2.0", "rh")?.semesters).toBe(4);
    expect(routeFor("Engenharia De Produção 2.0", "engenharia civil")?.semesters).toBe(5);
    expect(routeFor("Engenharia De Produção 2.0", "engenharia ambiental")?.semesters).toBe(6);
    expect(routeFor("Educação Física 2.0", null)).toBeUndefined();
  });
  it("reads the previous degree in the person's words", () => {
    expect(previousFrom("sou licenciado em educação física e quero o bacharelado")).toBe("Licenciatura em educacao fisica");
    expect(previousFrom("já me formei em administração, quero contábeis")).toMatch(/^administracao/);
    expect(previousFrom("quero fazer educação física")).toBeNull();
  });
  it("asks the degree when it is not known, offers it when it fits, points to the regular course when it does not", () => {
    const ask = text20("Educação Física 2.0", null)!;
    expect(ask).toMatch(/segunda graduação para quem já é formado em Licenciatura em Educação Física/);
    expect(ask.trim().endsWith("Você já tem essa formação?")).toBe(true);
    expect(text20("Educação Física 2.0", "Licenciatura em Educação Física")).toMatch(/4 semestres.*confirma pelo seu diploma/s);
    expect(text20("Ciências Contábeis 2.0", "Direito")).toMatch(/só para quem já é formado em .*caminho é a segunda graduação em \*Ciências Contábeis\*/s);
    expect(text20("Engenharia De Produção 2.0", null)).toMatch(/de 5 a 6 semestres/);
    expect(offer20Text("Administração 2.0", { from: [], label: "", semesters: 4 })).toMatch(/Quer seguir pela Graduação 2\.0\?$/);
    for (const t of [ask, text20("Educação Física 2.0", "Licenciatura em Educação Física")!]) expect((t.match(/\?/g) || []).length).toBe(1);
  });
  it("tells the model who may take each 2.0 course of the catalogue, and nothing when there is none", () => {
    expect(graduacao2Block(list.map(c => c.name))).toMatch(/Educação Física 2\.0: só para quem já é formado em Licenciatura em Educação Física/);
    expect(graduacao2Block(["Pedagogia"])).toBe("");
  });
});
