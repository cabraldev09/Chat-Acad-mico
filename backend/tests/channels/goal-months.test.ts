import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/database", () => ({ default: { query: vi.fn(), getDialect: () => "postgres" } }));
import { distribute, rollMonthly } from "../../src/controllers/GoalController";

const months = ["2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05"];
const sum = (a: number[]) => a.reduce((t, n) => t + n, 0);
const base = (target: number) => ({ target, months, monthly: distribute(target, months.length), custom: false });

describe("meta de cada mês de um polo: uma conta só, que não perde o que ficou para trás", () => {
  it("no primeiro mês, sem nada feito, é a divisão igual da meta do semestre", () => {
    expect(rollMonthly({ ...base(26), doneByMonth: [0, 0, 0, 0, 0, 0, 0], done: 0, now: "2026-11" })).toEqual([4, 4, 4, 4, 4, 3, 3]);
  });

  it("o que não foi feito num mês que passou vai para os meses seguintes, e eles somam o que falta do semestre", () => {
    const plan = rollMonthly({ ...base(26), doneByMonth: [1, 0, 0, 0, 0, 0, 0], done: 1, now: "2026-12" });
    expect(plan[0]).toBe(4);
    expect(plan.slice(1)).toEqual([5, 4, 4, 4, 4, 4]);
    expect(sum(plan.slice(1))).toBe(25);
  });

  it("o que o polo já tinha (digitado na planilha) conta como feito antes dos meses à frente", () => {
    const plan = rollMonthly({ ...base(150), doneByMonth: [0, 0, 3, 0, 0, 0, 0], done: 40 + 3, now: "2027-01" });
    expect(sum(plan.slice(2))).toBe(110);
    expect(plan.slice(2)).toEqual([22, 22, 22, 22, 22]);
  });

  it("meta já batida: os meses à frente ficam em zero, nunca negativos", () => {
    expect(rollMonthly({ ...base(10), doneByMonth: [12, 0, 0, 0, 0, 0, 0], done: 12, now: "2026-12" }).slice(1)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("meses digitados à mão ficam como foram digitados; polo sem meta e semestre encerrado não mudam", () => {
    const typed = [10, 0, 0, 5, 5, 3, 3];
    expect(rollMonthly({ target: 26, months, monthly: typed, custom: true, doneByMonth: [0, 0, 0, 0, 0, 0, 0], done: 0, now: "2027-01" })).toEqual(typed);
    expect(rollMonthly({ target: null, months, monthly: [0, 0, 0, 0, 0, 0, 0], custom: false, doneByMonth: [0, 0, 0, 0, 0, 0, 0], done: 0, now: "2027-01" })).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(rollMonthly({ ...base(26), doneByMonth: [0, 0, 0, 0, 0, 0, 0], done: 0, now: "2027-08" })).toEqual([4, 4, 4, 4, 4, 3, 3]);
  });
});
