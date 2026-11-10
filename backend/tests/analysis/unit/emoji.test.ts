import { describe, expect, it } from "vitest";
import { countEmojis, limitEmojis } from "../../../src/helpers/Emoji";

describe("few emojis", () => {
  it("keeps the first one and drops the rest, tidying the spaces", () => {
    expect(limitEmojis("Oi, Maria! 😊 Tudo bem? 👋 Vamos 🚀 lá.", 1)).toBe("Oi, Maria! 😊 Tudo bem? Vamos lá.");
    expect(limitEmojis("Sem emoji nenhum.", 1)).toBe("Sem emoji nenhum.");
    expect(limitEmojis("Só um 🙂", 1)).toBe("Só um 🙂");
    expect(limitEmojis("Dois 🙂🙂", 0)).toBe("Dois");
  });

  it("counts a joined sequence or a variation selector as one", () => {
    expect(countEmojis("❤️ e 👩‍🏫 e 👍🏽")).toBe(3);
    expect(limitEmojis("✅ ok ✅ ok", 1)).toBe("✅ ok ok");
  });

  it("does not touch the robots' invisible mark or ordinary punctuation", () => {
    expect(limitEmojis("‎Olá! Tudo certo?", 1)).toBe("‎Olá! Tudo certo?");
  });
});
