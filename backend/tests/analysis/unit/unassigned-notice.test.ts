import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/utils/logger", () => ({ logger: { info: () => undefined, warn: () => undefined, error: () => undefined } }));
vi.mock("../../../src/services/CrmServices/HandoffTasks", () => ({ releaseUnreachableTasks: async () => 0, syncHandoffTasks: async () => 0 }));
vi.mock("../../../src/services/AutomationServices/AutoAssignTicket", () => ({ redistributeUnreachableTickets: async () => 0 }));

import { unassignedNotice } from "../../../src/workers/TaskSweep";

describe("aviso de trabalho sem responsável", () => {
  it("diz quantos clientes esperam, há quanto tempo e leva direto à fila", () => {
    const n = unassignedNotice(3, 0);
    expect(n.title).toBe("3 clientes esperando atendente");
    expect(n.body).toContain("Há mais de 30 minutos");
    expect(n.link).toBe("/tickets?filtro=pending");
  });

  it("só tarefas: leva às tarefas sem dono", () => {
    const n = unassignedNotice(0, 1);
    expect(n.title).toBe("1 tarefa sem dono");
    expect(n.link).toContain("/crm/tarefas");
    expect(n.link).toContain("userId=0");
  });

  it("os dois: o título junta e a fila vem primeiro", () => {
    const n = unassignedNotice(1, 2);
    expect(n.title).toBe("1 cliente esperando atendente e 2 tarefas sem dono");
    expect(n.link).toBe("/tickets?filtro=pending");
  });

  it("o texto não usa \"(s)\" nem jargão", () => {
    for (const [a, b] of [[1, 0], [2, 0], [0, 1], [0, 2], [3, 4]]) {
      const n = unassignedNotice(a, b);
      expect(`${n.title} ${n.body}`).not.toMatch(/\(s\)|Trabalho sem responsável/);
    }
  });
});
