import fs from "fs";
import path from "path";
import { QueryTypes } from "sequelize";

import sequelize from "../../database";
import { PUBLIC_DIR } from "../../config/paths";
import { getSetting } from "../../helpers/AppSettings";
import DataPurgeRun from "../../models/DataPurgeRun";
import { logger } from "../../utils/logger";

// Retention of the CONTENT of the conversations. Both rules are OFF by default (0 days): deleting is irreversible and turning it on is a
// decision of the owner of the company (LGPD and the needs of the operation). Only the administrator changes them (routes/dataRetentionRoutes).
// - audio: the file of a voice note older than N days is deleted; the record of the message and its transcript stay.
// - conversation: in a conversation that is closed and without any activity for N days, the text, the transcript and the file of each
//   message are deleted; the record of the message (who, when) stays. Never touched: leads, enrollments, proposals, tasks, the activity
//   history, the reviews of the consultants (ConsultantReviews) and the academic data (their own tables and files). A conversation is
//   never cleared while it is open, while the same contact has another open conversation, or while the lead waits for the confirmation
//   of the enrollment (won without enrollment, form sent, print of the enrollment not attached yet).
// It runs at night with the trimming of the other tables (workers/DataRetention), in small batches. The simulation counts what would go,
// by polo and by type, and deletes nothing. Every run and every simulation is written in DataPurgeRuns (only numbers).

export const KEYS = { conversation: "retention_conversation_days", audio: "retention_audio_days" };
export const SUGGESTED = { conversationDays: 180, audioDays: 90 };
export const MIN_DAYS = 30;
export const MAX_DAYS = 3650;

// 0 (or anything not positive) is off; otherwise between 30 days and 10 years
export const daysOf = (v: unknown): number => {
  const n = Math.round(Number(v) || 0);
  if (n <= 0) return 0;
  return Math.min(MAX_DAYS, Math.max(MIN_DAYS, n));
};

export interface RetentionConfig { conversationDays: number; audioDays: number }
export const retentionConfig = async (): Promise<RetentionConfig> => ({
  conversationDays: daysOf(await getSetting(KEYS.conversation, "0")),
  audioDays: daysOf(await getSetting(KEYS.audio, "0"))
});

const cutoffOf = (days: number): Date => new Date(Date.now() - days * 86400000);

// ------------------------------------------------------------------ what may go (Postgres; :cutoff is the date before which it is old)

// the same rule of services/AiServices/Media.mediaKindOf: a PDF and a sticker are never audio
const AUDIO_FILE = (a: string) =>
  `(lower(${a}."mediaUrl") !~ '\\.(pdf|webp)$' AND (${a}."mediaType" IN ('audio', 'ptt') OR lower(${a}."mediaUrl") ~ '\\.(ogg|opus|mp3|m4a|wav|oga|aac)$'))`;

export const AUDIO_WHERE = `m."mediaUrl" IS NOT NULL AND m."mediaPurgedAt" IS NULL AND m."createdAt" < :cutoff AND ${AUDIO_FILE("m")}`;

// a message that still has something to delete
const HAS_CONTENT = (a: string) => `${a}."bodyPurgedAt" IS NULL AND (COALESCE(${a}.body, '') <> '' OR ${a}."mediaUrl" IS NOT NULL OR ${a}.transcript IS NOT NULL)`;

// the lead of the conversation waits for the confirmation of the enrollment
export const PENDING_ENROLLMENT = `EXISTS (SELECT 1 FROM "Leads" l WHERE (l.id = t."leadId" OR l."contactId" = t."contactId") AND l."lostAt" IS NULL AND (
    (l."wonAt" IS NOT NULL AND l."enrolledAt" IS NULL)
    OR (l."enrolledAt" IS NULL AND EXISTS (SELECT 1 FROM "EnrollmentForms" f WHERE f."leadId" = l.id AND f."submittedAt" IS NOT NULL))
    OR EXISTS (SELECT 1 FROM "EnrollmentProofs" p WHERE p."leadId" = l.id AND p."attachedAt" IS NULL)))`;

const OPEN_ELSEWHERE = `EXISTS (SELECT 1 FROM "Tickets" o WHERE o."contactId" = t."contactId" AND o.status <> 'closed')`;

// closed, and nothing happened in it since the cutoff (no message, no change of the conversation)
const OLD_CLOSED = `t.status = 'closed' AND t."updatedAt" < :cutoff AND COALESCE(t."lastMessageAt", t."closedAt", t."updatedAt") < :cutoff
  AND NOT EXISTS (SELECT 1 FROM "Messages" r WHERE r."ticketId" = t.id AND r."createdAt" >= :cutoff)`;

export const TICKET_WHERE = `${OLD_CLOSED} AND NOT ${OPEN_ELSEWHERE} AND NOT ${PENDING_ENROLLMENT}`;

// the polo of a conversation: the one of its queue, else the one of its lead
const POLO = `COALESCE(q."poloId", (SELECT l1."poloId" FROM "Leads" l1 WHERE l1.id = t."leadId"),
  (SELECT l2."poloId" FROM "Leads" l2 WHERE l2."contactId" = t."contactId" ORDER BY l2.id DESC LIMIT 1))`;

const KIND = `CASE WHEN m."mediaUrl" IS NULL AND m.transcript IS NULL THEN 'text'
  WHEN m."mediaUrl" IS NULL THEN 'audio'
  WHEN ${AUDIO_FILE("m")} THEN 'audio'
  WHEN lower(m."mediaUrl") ~ '\\.webp$' OR m."mediaType" = 'image' OR lower(m."mediaUrl") ~ '\\.(jpg|jpeg|png|heic|gif)$' THEN 'image'
  WHEN m."mediaType" = 'video' OR lower(m."mediaUrl") ~ '\\.(mp4|3gp|mov)$' THEN 'video'
  ELSE 'document' END`;

const select = (sql: string, replacements: Record<string, any>, transaction?: any): Promise<any[]> =>
  sequelize.query(sql, { replacements, type: QueryTypes.SELECT, transaction }) as Promise<any[]>;

const poloNames = async (): Promise<Map<number, string>> =>
  new Map((await select(`SELECT id, name FROM "Polos"`, {})).map((p: any) => [Number(p.id), String(p.name)]));

const nameOf = (names: Map<number, string>, id: any): string => (id ? names.get(Number(id)) || `Polo ${id}` : "Sem polo");

// ------------------------------------------------------------------ simulation: what would go, deleting nothing

export interface AudioCount { poloId: number | null; polo: string; files: number; withTranscript: number; withoutTranscript: number }
export interface ConversationCount { poloId: number | null; polo: string; conversations: number; messages: number; text: number; audio: number; image: number; video: number; document: number }
export interface Simulation {
  audio: { days: number; files: number; withTranscript: number; withoutTranscript: number; byPolo: AudioCount[] } | null;
  conversations: { days: number; conversations: number; messages: number; files: number; byType: Record<string, number>; byPolo: ConversationCount[]; kept: { openElsewhere: number; pendingEnrollment: number } } | null;
}

export const simulateAudio = async (days: number, transaction?: any): Promise<Simulation["audio"]> => {
  const names = await poloNames();
  const rows = await select(`SELECT "poloId", COUNT(*) AS files, COUNT(transcript) AS "withTranscript" FROM (
      SELECT ${POLO} AS "poloId", m.transcript FROM "Messages" m JOIN "Tickets" t ON t.id = m."ticketId" LEFT JOIN "Queues" q ON q.id = t."queueId"
      WHERE ${AUDIO_WHERE}) s GROUP BY "poloId"`, { cutoff: cutoffOf(days) }, transaction);
  const byPolo = rows.map((r: any) => {
    const files = Number(r.files) || 0;
    const withTranscript = Number(r.withTranscript) || 0;
    return { poloId: r.poloId ? Number(r.poloId) : null, polo: nameOf(names, r.poloId), files, withTranscript, withoutTranscript: files - withTranscript };
  }).sort((a, b) => b.files - a.files);
  const sum = (k: keyof AudioCount) => byPolo.reduce((n, r) => n + Number(r[k] || 0), 0);
  return { days, files: sum("files"), withTranscript: sum("withTranscript"), withoutTranscript: sum("withoutTranscript"), byPolo };
};

export const simulateConversations = async (days: number, transaction?: any): Promise<Simulation["conversations"]> => {
  const names = await poloNames();
  const cutoff = cutoffOf(days);
  const rows = await select(`SELECT "poloId", COUNT(DISTINCT "ticketId") AS conversations, COUNT(*) AS messages, COUNT(file) AS files,
      SUM(CASE WHEN kind = 'text' THEN 1 ELSE 0 END) AS text, SUM(CASE WHEN kind = 'audio' THEN 1 ELSE 0 END) AS audio,
      SUM(CASE WHEN kind = 'image' THEN 1 ELSE 0 END) AS image, SUM(CASE WHEN kind = 'video' THEN 1 ELSE 0 END) AS video,
      SUM(CASE WHEN kind = 'document' THEN 1 ELSE 0 END) AS document
    FROM (SELECT ${POLO} AS "poloId", t.id AS "ticketId", m."mediaUrl" AS file, ${KIND} AS kind
      FROM "Tickets" t LEFT JOIN "Queues" q ON q.id = t."queueId" JOIN "Messages" m ON m."ticketId" = t.id AND ${HAS_CONTENT("m")}
      WHERE ${TICKET_WHERE}) s GROUP BY "poloId"`, { cutoff }, transaction);
  const byPolo: ConversationCount[] = rows.map((r: any) => ({
    poloId: r.poloId ? Number(r.poloId) : null,
    polo: nameOf(names, r.poloId),
    conversations: Number(r.conversations) || 0,
    messages: Number(r.messages) || 0,
    text: Number(r.text) || 0,
    audio: Number(r.audio) || 0,
    image: Number(r.image) || 0,
    video: Number(r.video) || 0,
    document: Number(r.document) || 0
  })).sort((a, b) => b.messages - a.messages);
  const files = rows.reduce((n: number, r: any) => n + (Number(r.files) || 0), 0);
  // the old closed conversations that stay because of the protections (shown so the owner sees the rule working)
  const [kept] = await select(`SELECT
      COUNT(*) FILTER (WHERE ${OPEN_ELSEWHERE}) AS "openElsewhere",
      COUNT(*) FILTER (WHERE NOT ${OPEN_ELSEWHERE} AND ${PENDING_ENROLLMENT}) AS "pendingEnrollment"
    FROM "Tickets" t WHERE ${OLD_CLOSED} AND EXISTS (SELECT 1 FROM "Messages" c WHERE c."ticketId" = t.id AND ${HAS_CONTENT("c")})`, { cutoff }, transaction);
  const sum = (k: keyof ConversationCount) => byPolo.reduce((n, r) => n + Number(r[k] || 0), 0);
  return {
    days,
    conversations: sum("conversations"),
    messages: sum("messages"),
    files,
    byType: { text: sum("text"), audio: sum("audio"), image: sum("image"), video: sum("video"), document: sum("document") },
    byPolo,
    kept: { openElsewhere: Number(kept?.openElsewhere) || 0, pendingEnrollment: Number(kept?.pendingEnrollment) || 0 }
  };
};

// read-only, inside a transaction with a time limit (a slow count never holds the database); written down in DataPurgeRuns
export const simulateContentRetention = async (opts: { audioDays?: number; conversationDays?: number; actorId?: number | null } = {}): Promise<Simulation & { runId: number }> => {
  const audioDays = daysOf(opts.audioDays);
  const conversationDays = daysOf(opts.conversationDays);
  const startedAt = new Date();
  const result = await sequelize.transaction(async transaction => {
    await sequelize.query("SET TRANSACTION READ ONLY", { transaction });
    await sequelize.query("SET LOCAL statement_timeout = 60000", { transaction });
    const audio = audioDays ? await simulateAudio(audioDays, transaction) : null;
    const conversations = conversationDays ? await simulateConversations(conversationDays, transaction) : null;
    return { audio, conversations };
  });
  const run = await DataPurgeRun.create({
    mode: "simulation", audioDays, conversationDays,
    audioFiles: result.audio?.files || 0,
    conversations: result.conversations?.conversations || 0,
    conversationMessages: result.conversations?.messages || 0,
    filesDeleted: 0,
    details: JSON.stringify({ audio: result.audio?.byPolo || [], conversations: result.conversations?.byPolo || [] }),
    actorId: opts.actorId || null,
    startedAt,
    finishedAt: new Date()
  } as any);
  return { ...result, runId: run.id };
};

// ------------------------------------------------------------------ the real run (only when the setting is on)

const AUDIO_BATCH = 500;
const TICKET_BATCH = 100;
const MESSAGE_BATCH = 2000;
const MAX_BATCHES = 25;
// at most this many messages cleared per night: a huge backlog is worked over the following nights
const MAX_MESSAGES_PER_RUN = 50000;
const pause = () => new Promise(resolve => setTimeout(resolve, 200));

// deletes the files that no other message still uses (a copy is always made when a file is forwarded, this is only a guard)
export const removeFiles = async (files: string[]): Promise<number> => {
  const names = [...new Set(files.filter(Boolean).map(String))].filter(f => f === path.basename(f) && !/[\\/\x00]/.test(f) && f !== "." && f !== "..");
  if (!names.length) return 0;
  const used = new Set((await select(`SELECT DISTINCT "mediaUrl" AS file FROM "Messages" WHERE "mediaUrl" IN (:names)`, { names })).map((r: any) => String(r.file)));
  let removed = 0;
  for (const name of names) {
    if (used.has(name)) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      await fs.promises.unlink(path.join(PUBLIC_DIR, name));
      removed += 1;
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") logger.warn(`Retenção: arquivo não apagado (${(err as Error).message})`);
    }
  }
  return removed;
};

const polosOfTickets = async (ticketIds: number[]): Promise<Map<number, number | null>> => {
  if (!ticketIds.length) return new Map();
  const rows = await select(`SELECT t.id, ${POLO} AS "poloId" FROM "Tickets" t LEFT JOIN "Queues" q ON q.id = t."queueId" WHERE t.id IN (:ids)`, { ids: ticketIds });
  return new Map(rows.map((r: any) => [Number(r.id), r.poloId ? Number(r.poloId) : null]));
};

const addTo = (acc: Map<string, number>, key: string, n = 1) => acc.set(key, (acc.get(key) || 0) + n);

// the file of the voice notes older than the cutoff; the record and the transcript stay
export const purgeAudio = async (days: number): Promise<{ files: number; filesDeleted: number; byPolo: Record<string, number> }> => {
  const cutoff = cutoffOf(days);
  let files = 0;
  let filesDeleted = 0;
  const byTicket = new Map<string, number>();
  for (let i = 0; i < MAX_BATCHES; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const rows = await select(`WITH old AS (SELECT m.id, m."mediaUrl" AS file, m."ticketId" FROM "Messages" m WHERE ${AUDIO_WHERE} LIMIT ${AUDIO_BATCH} FOR UPDATE SKIP LOCKED)
      UPDATE "Messages" x SET "mediaUrl" = NULL, "mediaPurgedAt" = NOW() FROM old WHERE x.id = old.id RETURNING old.file AS file, old."ticketId" AS "ticketId"`, { cutoff });
    files += rows.length;
    rows.forEach((r: any) => addTo(byTicket, String(r.ticketId)));
    // eslint-disable-next-line no-await-in-loop
    filesDeleted += await removeFiles(rows.map((r: any) => r.file));
    if (rows.length < AUDIO_BATCH) break;
    // eslint-disable-next-line no-await-in-loop
    await pause();
  }
  const polos = await polosOfTickets([...byTicket.keys()].map(Number));
  const names = await poloNames();
  const byPolo: Record<string, number> = {};
  byTicket.forEach((n, ticketId) => { const p = nameOf(names, polos.get(Number(ticketId))); byPolo[p] = (byPolo[p] || 0) + n; });
  return { files, filesDeleted, byPolo };
};

// the text, the transcript and the file of the messages of the old closed conversations (the conditions are checked again in every batch)
export const purgeConversations = async (days: number): Promise<{ conversations: number; messages: number; filesDeleted: number; byPolo: Record<string, number> }> => {
  const cutoff = cutoffOf(days);
  let messages = 0;
  let filesDeleted = 0;
  const done = new Set<number>();
  const byTicket = new Map<string, number>();
  for (let i = 0; i < MAX_BATCHES && messages < MAX_MESSAGES_PER_RUN; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const ids = (await select(`SELECT t.id FROM "Tickets" t WHERE ${TICKET_WHERE} AND EXISTS (SELECT 1 FROM "Messages" c WHERE c."ticketId" = t.id AND ${HAS_CONTENT("c")})
      ORDER BY t.id LIMIT ${TICKET_BATCH}`, { cutoff })).map((r: any) => Number(r.id));
    if (!ids.length) break;
    let batchMessages = 0;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const rows = await select(`WITH old AS (SELECT m.id, m."mediaUrl" AS file, m."ticketId" FROM "Messages" m
          WHERE m."ticketId" IN (SELECT t.id FROM "Tickets" t WHERE t.id IN (:ids) AND ${TICKET_WHERE}) AND ${HAS_CONTENT("m")}
          LIMIT ${MESSAGE_BATCH} FOR UPDATE SKIP LOCKED)
        UPDATE "Messages" x SET body = '', transcript = NULL, "mediaUrl" = NULL, "bodyPurgedAt" = NOW(),
          "mediaPurgedAt" = CASE WHEN old.file IS NOT NULL THEN NOW() ELSE x."mediaPurgedAt" END
        FROM old WHERE x.id = old.id RETURNING old.file AS file, old."ticketId" AS "ticketId"`, { cutoff, ids });
      messages += rows.length;
      batchMessages += rows.length;
      rows.forEach((r: any) => addTo(byTicket, String(r.ticketId)));
      // eslint-disable-next-line no-await-in-loop
      filesDeleted += await removeFiles(rows.map((r: any) => r.file).filter(Boolean));
      if (rows.length < MESSAGE_BATCH || messages >= MAX_MESSAGES_PER_RUN) break;
      // eslint-disable-next-line no-await-in-loop
      await pause();
    }
    // the list of conversations shows the last message and the summary of the AI: they go with the messages (only when nothing is left)
    // eslint-disable-next-line no-await-in-loop
    const cleared = await select(`UPDATE "Tickets" t SET "lastMessage" = '', "aiSummary" = NULL WHERE t.id IN (:ids) AND ${TICKET_WHERE}
        AND NOT EXISTS (SELECT 1 FROM "Messages" c WHERE c."ticketId" = t.id AND ${HAS_CONTENT("c")}) RETURNING t.id`, { cutoff, ids });
    cleared.forEach((r: any) => done.add(Number(r.id)));
    // nothing could be cleared in this batch (all locked or changed meanwhile): stop for tonight instead of spinning
    if (!batchMessages) break;
    // eslint-disable-next-line no-await-in-loop
    await pause();
  }
  const polos = await polosOfTickets([...byTicket.keys()].map(Number));
  const names = await poloNames();
  const byPolo: Record<string, number> = {};
  byTicket.forEach((n, ticketId) => { const p = nameOf(names, polos.get(Number(ticketId))); byPolo[p] = (byPolo[p] || 0) + n; });
  return { conversations: done.size, messages, filesDeleted, byPolo };
};

export interface ContentRun { ran: boolean; failed: boolean; audioFiles: number; conversations: number; conversationMessages: number; filesDeleted: number }

// the nightly run: nothing at all (not even a record) while both rules are off
export const runContentRetention = async (): Promise<ContentRun> => {
  const cfg = await retentionConfig();
  const out: ContentRun = { ran: false, failed: false, audioFiles: 0, conversations: 0, conversationMessages: 0, filesDeleted: 0 };
  if (!cfg.audioDays && !cfg.conversationDays) return out;
  out.ran = true;
  const run = await DataPurgeRun.create({ mode: "run", audioDays: cfg.audioDays, conversationDays: cfg.conversationDays, startedAt: new Date() } as any);
  const details: Record<string, any> = {};
  const errors: string[] = [];
  if (cfg.conversationDays) {
    try {
      const c = await purgeConversations(cfg.conversationDays);
      Object.assign(out, { conversations: c.conversations, conversationMessages: c.messages, filesDeleted: out.filesDeleted + c.filesDeleted });
      details.conversations = c.byPolo;
    } catch (err) {
      errors.push(`conversas: ${(err as Error).message}`);
    }
  }
  if (cfg.audioDays) {
    try {
      const a = await purgeAudio(cfg.audioDays);
      Object.assign(out, { audioFiles: a.files, filesDeleted: out.filesDeleted + a.filesDeleted });
      details.audio = a.byPolo;
    } catch (err) {
      errors.push(`áudios: ${(err as Error).message}`);
    }
  }
  out.failed = errors.length > 0;
  await run.update({
    audioFiles: out.audioFiles, conversations: out.conversations, conversationMessages: out.conversationMessages, filesDeleted: out.filesDeleted,
    details: JSON.stringify(details), error: errors.length ? errors.join("; ").slice(0, 1000) : null, finishedAt: new Date()
  } as any);
  return out;
};

export const recentRuns = async (limit = 20): Promise<DataPurgeRun[]> =>
  DataPurgeRun.findAll({ order: [["createdAt", "DESC"]], limit, attributes: ["id", "mode", "audioDays", "conversationDays", "audioFiles", "conversations", "conversationMessages", "filesDeleted", "error", "actorId", "startedAt", "finishedAt"] });
