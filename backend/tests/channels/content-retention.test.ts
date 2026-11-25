import fs from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// the files of the messages live in a throw-away folder
const dir = vi.hoisted(() => {
  const d = `${String(process.env.TMPDIR || "/tmp").replace(/\/$/, "")}/retention-${process.pid}-${Date.now()}`;
  process.env.UPLOAD_DIR = d;
  return d;
});

const db = vi.hoisted(() => ({ calls: [] as string[], settings: {} as Record<string, string>, ticketBatches: 0 }));

vi.mock("../../src/database", () => ({
  default: {
    getDialect: () => "postgres",
    transaction: vi.fn(async (cb: any) => cb("tx")),
    query: vi.fn(async (sql: string) => {
      db.calls.push(sql);
      if (/FROM "Polos"/.test(sql)) return [{ id: 1, name: "Polo Centro" }];
      if (/UPDATE "Messages" x SET "mediaUrl" = NULL, "mediaPurgedAt"/.test(sql)) return [{ file: "old-voice.ogg", ticketId: 10 }, { file: "shared.ogg", ticketId: 10 }];
      if (/SELECT DISTINCT "mediaUrl"/.test(sql)) return [{ file: "shared.ogg" }];
      if (/UPDATE "Messages" x SET body = ''/.test(sql)) return [{ file: "old-photo.jpg", ticketId: 20 }, { file: null, ticketId: 20 }];
      if (/UPDATE "Tickets" t SET "lastMessage" = ''/.test(sql)) return [{ id: 20 }];
      if (/^SELECT t\.id FROM "Tickets" t WHERE/.test(sql.trim())) { db.ticketBatches += 1; return db.ticketBatches === 1 ? [{ id: 20 }] : []; }
      if (/SELECT t\.id, COALESCE/.test(sql)) return [{ id: 10, poloId: 1 }, { id: 20, poloId: null }];
      if (/COUNT\(\*\) FILTER/.test(sql)) return [{ openElsewhere: 2, pendingEnrollment: 1 }];
      if (/COUNT\(transcript\)/.test(sql)) return [{ poloId: 1, files: 5, withTranscript: 3 }];
      if (/COUNT\(DISTINCT "ticketId"\)/.test(sql)) return [{ poloId: 1, conversations: 2, messages: 7, files: 3, text: 4, audio: 1, image: 1, video: 0, document: 1 }];
      return [];
    })
  }
}));
vi.mock("../../src/helpers/AppSettings", () => ({ getSetting: vi.fn(async (k: string, fallback: string) => db.settings[k] ?? fallback), setSetting: vi.fn() }));
const runs = vi.hoisted(() => ({ created: [] as any[], updated: [] as any[] }));
vi.mock("../../src/models/DataPurgeRun", () => ({
  default: {
    create: vi.fn(async (row: any) => { runs.created.push(row); return { id: runs.created.length, update: async (patch: any) => { runs.updated.push(patch); } }; }),
    findAll: vi.fn(async () => [])
  }
}));

import { AUDIO_WHERE, PENDING_ENROLLMENT, TICKET_WHERE, daysOf, runContentRetention, simulateContentRetention } from "../../src/services/SystemServices/ContentRetention";

const touch = (name: string) => fs.writeFileSync(path.join(dir, name), "x");
const exists = (name: string) => fs.existsSync(path.join(dir, name));
const writes = () => db.calls.filter(s => /\b(UPDATE|DELETE|INSERT|TRUNCATE|DROP)\b/i.test(s));

beforeEach(() => {
  db.calls.length = 0;
  db.settings = {};
  db.ticketBatches = 0;
  runs.created.length = 0;
  runs.updated.length = 0;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  ["old-voice.ogg", "shared.ogg", "old-photo.jpg"].forEach(touch);
});

describe("retenção de conversas e áudios", () => {
  it("começa desligada: nenhuma consulta, nenhum registro, nenhum arquivo apagado", async () => {
    const out = await runContentRetention();
    expect(out.ran).toBe(false);
    expect(db.calls).toEqual([]);
    expect(runs.created).toEqual([]);
    expect(["old-voice.ogg", "shared.ogg", "old-photo.jpg"].every(exists)).toBe(true);
  });

  it("0, vazio ou negativo desliga; o prazo ligado fica entre 30 dias e 10 anos", () => {
    expect([0, "", null, undefined, -5, "abc"].map(daysOf)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(daysOf(7)).toBe(30);
    expect(daysOf(180)).toBe(180);
    expect(daysOf(99999)).toBe(3650);
  });

  it("a simulação só lê (transação somente leitura), conta por polo e por tipo e não apaga nada", async () => {
    const sim = await simulateContentRetention({ audioDays: 90, conversationDays: 180, actorId: 1 });
    expect(writes()).toEqual([]);
    expect(db.calls).toContain("SET TRANSACTION READ ONLY");
    expect(["old-voice.ogg", "shared.ogg", "old-photo.jpg"].every(exists)).toBe(true);
    expect(sim.audio).toMatchObject({ days: 90, files: 5, withTranscript: 3, withoutTranscript: 2, byPolo: [{ polo: "Polo Centro", files: 5 }] });
    expect(sim.conversations).toMatchObject({ days: 180, conversations: 2, messages: 7, files: 3, byType: { text: 4, audio: 1, image: 1, video: 0, document: 1 }, kept: { openElsewhere: 2, pendingEnrollment: 1 } });
    // the simulation is written down (who and when), as a simulation
    expect(runs.created).toHaveLength(1);
    expect(runs.created[0]).toMatchObject({ mode: "simulation", audioDays: 90, conversationDays: 180, filesDeleted: 0, actorId: 1 });
  });

  it("ligada só para áudios: apaga o arquivo, mantém a mensagem e a transcrição, e não apaga arquivo usado por outra mensagem", async () => {
    db.settings = { retention_audio_days: "90" };
    const out = await runContentRetention();
    expect(out).toMatchObject({ ran: true, failed: false, audioFiles: 2, filesDeleted: 1, conversations: 0 });
    expect(exists("old-voice.ogg")).toBe(false);
    expect(exists("shared.ogg")).toBe(true);
    expect(exists("old-photo.jpg")).toBe(true);
    // only the file column of the message changes: the transcript and the text stay; nothing is ever DELETEd
    const w = writes();
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/UPDATE "Messages" x SET "mediaUrl" = NULL, "mediaPurgedAt" = NOW\(\) FROM old/);
    expect(w[0]).not.toMatch(/transcript\s*=|body\s*=/);
    expect(w.some(s => /\bDELETE\b/i.test(s))).toBe(false);
    expect(runs.updated[0]).toMatchObject({ audioFiles: 2, filesDeleted: 1, error: null });
  });

  it("ligada para conversas: só conversas encerradas, antigas, sem outro atendimento aberto e sem matrícula pendente; nunca toca em leads, matrículas, propostas, tarefas, histórico ou revisões", async () => {
    db.settings = { retention_conversation_days: "180" };
    const out = await runContentRetention();
    expect(out).toMatchObject({ ran: true, failed: false, conversations: 1, conversationMessages: 2, filesDeleted: 1, audioFiles: 0 });
    expect(exists("old-photo.jpg")).toBe(false);
    expect(exists("old-voice.ogg")).toBe(true);
    const w = writes();
    expect(w.every(s => /UPDATE "(Messages|Tickets)"/.test(s))).toBe(true);
    expect(w.join("\n")).not.toMatch(/(UPDATE|DELETE FROM|INSERT INTO)\s+"(Leads|LeadEnrollments|Proposals|LeadTasks|LeadActivities|ConsultantReviews|AcademicAnalyses|CurricularAnalyses|EnrollmentForms|EnrollmentProofs|Students)"/);
    // the conditions are checked again in the batch that clears
    expect(w.find(s => /SET body = ''/.test(s))).toContain(TICKET_WHERE);
  });

  it("as regras de proteção estão na condição: aberto, outro atendimento do contato aberto, matrícula esperando confirmação", () => {
    expect(TICKET_WHERE).toContain("t.status = 'closed'");
    expect(TICKET_WHERE).toMatch(/NOT EXISTS \(SELECT 1 FROM "Tickets" o WHERE o\."contactId" = t\."contactId" AND o\.status <> 'closed'\)/);
    expect(TICKET_WHERE).toContain(`NOT ${PENDING_ENROLLMENT}`);
    expect(PENDING_ENROLLMENT).toMatch(/"wonAt" IS NOT NULL AND l\."enrolledAt" IS NULL/);
    expect(PENDING_ENROLLMENT).toMatch(/"EnrollmentForms"/);
    expect(PENDING_ENROLLMENT).toMatch(/"EnrollmentProofs" p WHERE p\."leadId" = l\.id AND p\."attachedAt" IS NULL/);
    // a PDF or a sticker is never taken for a voice note
    expect(AUDIO_WHERE).toMatch(/!~ '\\\.\(pdf\|webp\)\$'/);
  });

  it("uma falha numa das regras não interrompe a outra e fica registrada (a noite tenta de novo)", async () => {
    db.settings = { retention_conversation_days: "180", retention_audio_days: "90" };
    const original = (await import("../../src/database")).default.query as any;
    const impl = original.getMockImplementation();
    original.mockImplementation(async (sql: string, opts: any) => {
      if (/SET body = ''/.test(sql)) throw new Error("lock timeout");
      return impl(sql, opts);
    });
    try {
      const out = await runContentRetention();
      expect(out.failed).toBe(true);
      expect(out.audioFiles).toBe(2);
      expect(runs.updated[0].error).toMatch(/conversas: lock timeout/);
    } finally {
      original.mockImplementation(impl);
    }
  });
});

// the folder is removed at the end
process.on("exit", () => fs.rmSync(dir, { recursive: true, force: true }));
