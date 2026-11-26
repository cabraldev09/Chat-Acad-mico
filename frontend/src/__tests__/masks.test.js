import { describe, expect, it } from "vitest";
import { brl, brlTyping, cpfMask, emailNormalize, isValidCpf, isValidEmail, isValidPhone, nameClean, parseMoney, phoneClean, phoneMask, titleCaseName } from "../utils/masks";

describe("máscaras dos campos", () => {
  it("CPF se forma enquanto digita e confere os dígitos", () => {
    expect(cpfMask("123")).toBe("123");
    expect(cpfMask("1234")).toBe("123.4");
    expect(cpfMask("123456789")).toBe("123.456.789");
    expect(cpfMask("12345678909")).toBe("123.456.789-09");
    expect(cpfMask("123456789091234")).toBe("123.456.789-09");
    expect(isValidCpf("123.456.789-09")).toBe(true);
    expect(isValidCpf("111.111.111-11")).toBe(false);
  });

  it("telefone fixo, celular e com 55; guarda só os dígitos", () => {
    expect(phoneMask("6")).toBe("(6");
    expect(phoneMask("693")).toBe("(69) 3");
    expect(phoneMask("6933334444")).toBe("(69) 3333-4444");
    expect(phoneMask("69999998888")).toBe("(69) 99999-8888");
    expect(phoneMask("5569999998888")).toBe("+55 (69) 99999-8888");
    expect(phoneClean("+55 (69) 99999-8888")).toBe("5569999998888");
    expect(isValidPhone("(69) 99999-8888")).toBe(true);
    expect(isValidPhone("(69) 9999")).toBe(false);
  });

  it("e-mail sem espaço e minúsculo", () => {
    expect(emailNormalize(" Maria.Silva@Gmail.COM ")).toBe("maria.silva@gmail.com");
    expect(isValidEmail("maria@gmail.com")).toBe(true);
    expect(isValidEmail("maria@gmail")).toBe(false);
  });

  it("nome e cidade com a primeira letra maiúscula, sem comer o espaço de quem digita", () => {
    expect(titleCaseName("joão DA silva")).toBe("João da Silva");
    expect(titleCaseName("maria ")).toBe("Maria ");
    expect(titleCaseName("ji-paraná")).toBe("Ji-Paraná");
    expect(titleCaseName("são joão do rio preto")).toBe("São João do Rio Preto");
    expect(titleCaseName("da costa")).toBe("Da Costa");
    expect(nameClean("  ana   paula  de souza ")).toBe("Ana Paula de Souza");
  });

  it("valor em reais se forma da direita para a esquerda", () => {
    expect(brlTyping("1")).toEqual({ text: "R$ 0,01", value: 0.01 });
    expect(brlTyping("12")).toEqual({ text: "R$ 0,12", value: 0.12 });
    expect(brlTyping("12145")).toEqual({ text: "R$ 121,45", value: 121.45 });
    expect(brlTyping("1234567")).toEqual({ text: "R$ 12.345,67", value: 12345.67 });
    // typing one more digit into the field already formatted
    expect(brlTyping("R$ 121,453").value).toBe(1214.53);
    // erasing one
    expect(brlTyping("R$ 121,4").value).toBe(12.14);
    // pasting
    expect(brlTyping("1.221,45").value).toBe(1221.45);
    expect(brlTyping("1221.45").value).toBe(1221.45);
    expect(brlTyping("")).toEqual({ text: "", value: null });
    // erasing down to zeros empties the field (never stuck on R$ 0,00)
    expect(brlTyping("R$ 0,0")).toEqual({ text: "", value: null });
    expect(parseMoney("1073,8")).toBe(1073.8);
    expect(brl(1073.8)).toBe("R$ 1.073,80");
  });
});
