import { describe, expect, it } from "vitest";
import { withKeyLock } from "../../../src/helpers/KeyedLock";

describe("the tasks of the same key run one after the other", () => {
  it("the second message of a person finds what the first one created", async () => {
    const created: string[] = [];
    const findOrCreate = async () => {
      const found = created.length > 0;
      await new Promise(r => setTimeout(r, 20));
      if (!found) created.push("ticket");
      return found;
    };
    const results = await Promise.all([withKeyLock("p:1", findOrCreate), withKeyLock("p:1", findOrCreate), withKeyLock("p:1", findOrCreate)]);
    expect(created).toHaveLength(1);
    expect(results).toEqual([false, true, true]);
  });

  it("other keys do not wait, and a failure does not block the next task", async () => {
    const order: string[] = [];
    await Promise.all([
      withKeyLock("a", async () => { await new Promise(r => setTimeout(r, 30)); order.push("a"); }),
      withKeyLock("b", async () => { order.push("b"); })
    ]);
    expect(order).toEqual(["b", "a"]);
    await expect(withKeyLock("c", async () => { throw new Error("falhou"); })).rejects.toThrow("falhou");
    await expect(withKeyLock("c", async () => "ok")).resolves.toBe("ok");
  });
});
