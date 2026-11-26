import { describe, expect, it, vi, afterEach } from "vitest";
import { batchToast, namesLine } from "../utils/toastBatch";

afterEach(() => { vi.useRealTimers(); });

describe("alertas agrupados", () => {
  it("vários do mesmo tipo em poucos segundos viram um só, sem contar duas vezes o mesmo", () => {
    vi.useFakeTimers();
    const flush = vi.fn();
    batchToast("lead", { ticketId: 1, name: "Michael" }, flush);
    batchToast("lead", { ticketId: 2, name: "Karina" }, flush);
    batchToast("lead", { ticketId: 2, name: "Karina" }, flush);
    batchToast("lead", { ticketId: 3, name: "Emanuel" }, flush);
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2600);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush.mock.calls[0][0].map((i) => i.ticketId)).toEqual([1, 2, 3]);
  });

  it("um só sai sozinho, e outro tipo não se mistura", () => {
    vi.useFakeTimers();
    const a = vi.fn();
    const b = vi.fn();
    batchToast("x", { id: 1 }, a);
    batchToast("y", { id: 1 }, b);
    vi.advanceTimersByTime(2600);
    expect(a.mock.calls[0][0]).toHaveLength(1);
    expect(b.mock.calls[0][0]).toHaveLength(1);
  });

  it("os nomes cabem numa linha", () => {
    expect(namesLine(["Ana"])).toBe("Ana");
    expect(namesLine(["Ana", "Bia"])).toBe("Ana e Bia");
    expect(namesLine(["Ana", "Bia", "Caio", "Davi"])).toBe("Ana, Bia e mais 2");
  });
});
