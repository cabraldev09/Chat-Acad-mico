import { describe, expect, it } from "vitest";

import { renderCampaignText } from "../../../src/helpers/CampaignText";
import formatBody from "../../../src/helpers/Mustache";
import { brPhoneVariants } from "../../../src/helpers/PhoneVariants";
import { csvAsText, csvBody, csvCell } from "../../../src/helpers/Csv";

describe("texto das campanhas", () => {
  it("manda o nome como foi digitado, sem escapar HTML", () => {
    const text = renderCampaignText("Oi {{name}}!", { name: "D'Ávila & Cia <Ltda>", number: "5511" });
    expect(text).toBe("Oi D'Ávila & Cia <Ltda>!");
  });

  it("tem o primeiro nome e o nome completo em português e em inglês", () => {
    const text = renderCampaignText("{{primeiro_nome}} | {{first_name}} | {{nome}} | {{number}}", { name: "Maria da Silva", number: "5511999990000" });
    expect(text).toBe("Maria | Maria | Maria da Silva | 5511999990000");
  });

  it("o texto das conversas também não escapa o nome", () => {
    expect(formatBody("Olá {{name}}", { name: "Zé & Cia" } as any)).toBe("Olá Zé & Cia");
  });

  it("sorteia uma das opções de {{spin|...}}", () => {
    expect(["Oi", "Olá"]).toContain(renderCampaignText("{{spin|Oi|Olá}}", { name: "A", number: "1" }));
  });
});

describe("número com e sem o nono dígito", () => {
  it("o celular com nove gera a forma sem ele, e o contrário", () => {
    expect(brPhoneVariants("5569999993333").sort()).toEqual(["556999993333", "5569999993333"]);
    expect(brPhoneVariants("556999993333").sort()).toEqual(["556999993333", "5569999993333"]);
  });

  it("telefone fixo e número de fora não ganham dígito", () => {
    expect(brPhoneVariants("556932223333")).toEqual(["556932223333"]);
    expect(brPhoneVariants("13055551234")).toEqual(["13055551234"]);
  });
});

describe("planilha (CSV)", () => {
  it("neutraliza o que a planilha executaria como fórmula", () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell("+55 11")).toBe(`"'+55 11"`);
    expect(csvCell("-1")).toBe(`"'-1"`);
    expect(csvCell("@usuario")).toBe(`"'@usuario"`);
    expect(csvCell("Maria")).toBe('"Maria"');
    expect(csvCell(null)).toBe('""');
  });

  it("guarda o telefone como texto, mas um nome parecido com isso continua neutralizado", () => {
    expect(csvBody(["Tel"], [[csvAsText("5511999990000")]])).toBe('﻿"Tel"\r\n="5511999990000"\r\n');
    expect(csvBody(["Nome"], [['="5511999990000"']])).toBe('﻿"Nome"\r\n"\'=""5511999990000"""\r\n');
  });

  it("usa ponto e vírgula, quebra de linha do Windows e BOM", () => {
    expect(csvBody(["A", "B"], [["1", "2"]])).toBe('﻿"A";"B"\r\n"1";"2"\r\n');
  });
});
