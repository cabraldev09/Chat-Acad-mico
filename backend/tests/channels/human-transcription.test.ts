import fs from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// the files of the messages live in a throw-away folder
const dir = vi.hoisted(() => {
  const d = `${String(process.env.TMPDIR || "/tmp").replace(/\/$/, "")}/human-audio-${process.pid}-${Date.now()}`;
  process.env.UPLOAD_DIR = d;
  return d;
});

const st = vi.hoisted(() => ({
  settings: {} as Record<string, string>,
  pending: [] as Array<{ id: string; ticketId: number; mediaUrl: string }>,
  tried: new Set<string>(),
  queries: [] as string[],
  humanSeconds: 0,
  tokens: 0,
  spentUsd: 0,
  updates: [] as any[],
  openai: 0,
  emitted: 0
}));

vi.mock("../../src/database", () => ({
  default: {
    getDialect: () => "postgres",
    query: vi.fn(async (sql: string, opts: any) => {
      st.queries.push(sql);
      if (/UPDATE "Messages" SET "transcribeTriedAt"/.test(sql)) {
        const id = opts.replacements.id;
        if (st.tried.has(id)) return [[], { rowCount: 0 }];
        st.tried.add(id);
        return [[], { rowCount: 1 }];
      }
      if (/FROM "Messages" m JOIN "Tickets" t/.test(sql)) return st.pending.filter(p => !st.tried.has(p.id)).slice(0, opts.replacements.limit);
      return [];
    })
  }
}));
vi.mock("../../src/helpers/AppSettings", () => ({ getSetting: vi.fn(async (k: string, fallback: string) => st.settings[k] ?? fallback), setSetting: vi.fn() }));
vi.mock("../../src/helpers/SecretSettings", () => ({ getSecretSetting: vi.fn(async () => "sk-test-only") }));
vi.mock("../../src/models/AiAgent", () => ({ default: { findOne: vi.fn(async () => null) } }));
vi.mock("../../src/models/AiUsage", () => ({
  default: {
    sum: vi.fn(async (col: string, opts: any) => {
      if (opts?.where?.kind === "reading") return st.humanSeconds;
      if (col === "estimatedUsd") return st.spentUsd;
      return col === "inputTokens" ? st.tokens : 0;
    })
  }
}));
vi.mock("../../src/models/AiBudgetReservation", () => ({ default: { sum: vi.fn(async () => 0) } }));
vi.mock("../../src/models/Message", () => ({
  default: {
    update: vi.fn(async (patch: any, opts: any) => { st.updates.push({ patch, id: opts.where.id }); return [1]; }),
    findByPk: vi.fn(async (id: string) => ({ id, ticketId: 7 }))
  }
}));
vi.mock("../../src/libs/socket", () => ({ getIO: () => ({ to: () => ({ emit: () => { st.emitted += 1; } }) }) }));
vi.mock("../../src/services/AiServices/Usage", () => ({ logUsage: vi.fn(async () => undefined), priceOf: vi.fn(async () => ({ in: 100, out: 0 })) }));
// the OpenAI is simulated: nothing leaves the machine
vi.mock("axios", () => ({
  default: {
    post: vi.fn(async () => { st.openai += 1; return { data: { text: "Quero saber o valor da mensalidade", duration: 5 } }; })
  }
}));

import { transcribePending } from "../../src/services/AiServices/HumanTranscription";
import { reviewTranscript, isAudioRow } from "../../src/services/AnalyticsServices/ConsultantReview";

const voice = (id: string, bytes = 10000) => {
  fs.writeFileSync(path.join(dir, `${id}.ogg`), Buffer.alloc(bytes));
  st.pending.push({ id, ticketId: 7, mediaUrl: `${id}.ogg` });
};

beforeEach(() => {
  st.settings = {};
  st.pending = [];
  st.tried = new Set();
  st.queries = [];
  st.humanSeconds = 0;
  st.tokens = 0;
  st.spentUsd = 0;
  st.updates = [];
  st.openai = 0;
  st.emitted = 0;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
});

describe("transcrição dos áudios das conversas entre pessoas", () => {
  it("o áudio de uma conversa humana é transcrito uma única vez, e a conversa aberta recebe o texto", async () => {
    voice("wamid.voz1");
    const first = await transcribePending();
    expect(first).toMatchObject({ transcribed: 1, failed: 0 });
    expect(st.openai).toBe(1);
    expect(st.updates).toEqual([{ id: "wamid.voz1", patch: { transcript: "Quero saber o valor da mensalidade" } }]);
    expect(st.emitted).toBe(1);
    // the next runs find it already tried: the OpenAI is never called again for it
    const again = await transcribePending();
    expect(again.transcribed).toBe(0);
    expect(st.openai).toBe(1);
  });

  it("teto próprio de minutos por dia atingido: não transcreve (e o áudio espera, não é marcado)", async () => {
    voice("wamid.voz2");
    st.humanSeconds = 120 * 60;
    const run = await transcribePending();
    expect(run.stopped).toBe("own_cap");
    expect(st.openai).toBe(0);
    expect(st.tried.has("wamid.voz2")).toBe(false);
  });

  it("teto diário de gasto da IA (dólares ou tokens) atingido: não transcreve", async () => {
    voice("wamid.voz3");
    st.settings = { ai_daily_usd_cap: "1" };
    st.spentUsd = 1;
    expect((await transcribePending()).stopped).toBe("usd_cap");
    st.settings = { ai_daily_token_cap: "1000" };
    st.spentUsd = 0;
    st.tokens = 1000;
    expect((await transcribePending()).stopped).toBe("token_cap");
    expect(st.openai).toBe(0);
  });

  it("configuração desligada (a própria ou a geral de áudios) não transcreve nem procura áudios", async () => {
    voice("wamid.voz4");
    for (const settings of [{ ai_transcribe_human: "0" }, { ai_transcribe_audio: "0" }]) {
      st.settings = settings;
      // eslint-disable-next-line no-await-in-loop
      expect((await transcribePending()).stopped).toBe("off");
    }
    expect(st.openai).toBe(0);
    expect(st.queries).toEqual([]);
  });

  it("áudio longo demais não é enviado e fica marcado (não é olhado de novo)", async () => {
    voice("wamid.longo", 11 * 60 * 2000);
    const run = await transcribePending();
    expect(run).toMatchObject({ transcribed: 0, skipped: 1 });
    expect(st.openai).toBe(0);
    expect(st.tried.has("wamid.longo")).toBe(true);
  });

  it("só procura áudios recentes, de conversas que não são grupo, nos números de WhatsApp (oficial e QR)", async () => {
    voice("wamid.voz5");
    await transcribePending();
    const select = st.queries.find(q => /FROM "Messages" m JOIN "Tickets" t/.test(q)) || "";
    expect(select).toContain(`w.channel IN ('whatsapp', 'whatsapp_cloud')`);
    expect(select).toContain(`t."isGroup" = false`);
    expect(select).toContain(`m."transcribeTriedAt" IS NULL`);
    expect(select).toContain("m.transcript IS NULL");
  });
});

describe("revisão diária do consultor com áudio", () => {
  const names = ["Maria Souza", "João Vitor"];
  it("o áudio entra como o texto transcrito, sem dados pessoais; sem transcrição, um marcador", () => {
    const text = reviewTranscript([
      { fromMe: false, body: "abc.ogg", mediaType: "audio", mediaUrl: "abc.ogg", transcript: "Oi, sou a Maria Souza, meu CPF é 123.456.789-09 e o fone 69 99999-1234. Achei caro." },
      { fromMe: true, body: "Entendo, Maria. Posso te mostrar a bolsa?", mediaType: "chat", mediaUrl: null, transcript: null },
      { fromMe: false, body: "def.ogg", mediaType: "audio", mediaUrl: "def.ogg", transcript: null }
    ], names);
    expect(text).toContain("Interessado: [áudio] Oi, sou a [NOME]");
    expect(text).toContain("Achei caro.");
    expect(text).toContain("Interessado: [áudio sem transcrição]");
    expect(text).not.toMatch(/Maria|Souza|123\.456|99999|abc\.ogg/);
  });

  it("PDF e figurinha nunca são tomados por áudio", () => {
    expect(isAudioRow({ mediaType: "audio", mediaUrl: "x.ogg" })).toBe(true);
    expect(isAudioRow({ mediaType: "ptt", mediaUrl: null })).toBe(true);
    expect(isAudioRow({ mediaType: "document", mediaUrl: "x.pdf" })).toBe(false);
    expect(isAudioRow({ mediaType: "image", mediaUrl: "x.webp" })).toBe(false);
    expect(isAudioRow({ mediaType: "chat", mediaUrl: null })).toBe(false);
  });
});

process.on("exit", () => fs.rmSync(dir, { recursive: true, force: true }));
