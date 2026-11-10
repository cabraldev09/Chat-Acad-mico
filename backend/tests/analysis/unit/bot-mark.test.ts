import { describe, expect, it } from "vitest";
import { BOT_MARK, startsWithBotMark } from "../../../src/helpers/BotMark";

describe("the robots' invisible mark", () => {
  it("is told from a person's message, so the sender stores what the listener skips", () => {
    expect(startsWithBotMark(`${BOT_MARK}Qual cidade você mora?`)).toBe(true);
    expect(startsWithBotMark("Qual cidade você mora?")).toBe(false);
    expect(startsWithBotMark("")).toBe(false);
    // the mark in the middle of a text does not count
    expect(startsWithBotMark(`oi ${BOT_MARK}`)).toBe(false);
    // same character the listener of the connection looks for
    expect(BOT_MARK.charCodeAt(0)).toBe(0x200e);
  });
});
