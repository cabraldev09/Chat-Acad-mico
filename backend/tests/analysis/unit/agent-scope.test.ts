import { describe, expect, it } from "vitest";
import { robotMayTalk } from "../../../src/helpers/AgentScope";

describe("where the robots may talk", () => {
  it("only in a lead's private conversation", () => {
    expect(robotMayTalk({ isGroup: false, contact: { isStaff: false, isPersonal: false, kind: "contact" } })).toBe(true);
    expect(robotMayTalk({ isGroup: false })).toBe(true);
  });

  it("never in groups, communities, channels, the team's chats and personal contacts", () => {
    expect(robotMayTalk({ isGroup: true })).toBe(false);
    expect(robotMayTalk({ isGroup: false, contact: { kind: "community" } })).toBe(false);
    expect(robotMayTalk({ isGroup: false, contact: { kind: "channel" } })).toBe(false);
    expect(robotMayTalk({ isGroup: false, contact: { parentGroupId: "12345@g.us" } })).toBe(false);
    expect(robotMayTalk({ isGroup: false, contact: { isStaff: true } })).toBe(false);
    expect(robotMayTalk({ isGroup: false, contact: { isPersonal: true } })).toBe(false);
  });
});
