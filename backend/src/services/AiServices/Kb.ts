import { Op, QueryTypes } from "sequelize";

import sequelize from "../../database";
import AiAgent from "../../models/AiAgent";
import KbDocument from "../../models/KbDocument";
import KbChunk from "../../models/KbChunk";
import { isPg } from "../../helpers/sqlDialect";

// lowercase, no accents: what the index stores and what a question is turned into
export const norm = (s: string): string =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const TARGET = 800; // characters per chunk, about 200 tokens

// Splits on blank lines and headings, then packs paragraphs up to ~TARGET characters.
export const chunkText = (text: string): string[] => {
  const paragraphs = String(text || "")
    .replace(/\r/g, "")
    .split(/\n{2,}|\n(?=#{1,4}\s)/)
    .map(p => p.trim())
    .filter(Boolean);
  const out: string[] = [];
  let current = "";
  const flush = () => {
    if (current.trim()) out.push(current.trim());
    current = "";
  };
  for (const p of paragraphs) {
    if (p.length > TARGET * 1.5) {
      // a long paragraph: cut at sentence ends
      flush();
      let piece = "";
      for (const sentence of p.split(/(?<=[.!?])\s+/)) {
        if ((piece + " " + sentence).length > TARGET && piece) {
          out.push(piece.trim());
          piece = sentence;
        } else {
          piece = piece ? `${piece} ${sentence}` : sentence;
        }
      }
      if (piece.trim()) out.push(piece.trim());
    } else if ((current + "\n\n" + p).length > TARGET && current) {
      flush();
      current = p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  flush();
  return out;
};

interface NewDoc {
  title: string;
  content: string;
  kind?: "doc" | "faq";
  source?: "texto" | "arquivo" | "url" | "aprendido";
  keywords?: string | null;
  agentId?: number | null;
}

export const indexDocument = async (doc: KbDocument): Promise<number> => {
  await KbChunk.destroy({ where: { documentId: doc.id } });
  // FAQ answers stay whole: they are sent as they are
  const pieces = doc.kind === "faq" ? [doc.title + "\n" + doc.content] : chunkText(`${doc.title}\n\n${doc.content}`);
  await KbChunk.bulkCreate(
    pieces.map((content, position) => ({ documentId: doc.id, position, content, contentNorm: norm(content) }))
  );
  return pieces.length;
};

export const addDocument = async (input: NewDoc): Promise<KbDocument> => {
  const doc = await KbDocument.create({
    title: input.title.trim().slice(0, 250),
    content: input.content,
    kind: input.kind || "doc",
    source: input.source || "texto",
    keywords: input.keywords || null,
    agentId: input.agentId || null
  } as any);
  await indexDocument(doc);
  return doc;
};

// Agents created before the knowledge base had documents keep their pasted text: it becomes a document once.
export const ensureLegacy = async (agent: AiAgent): Promise<void> => {
  if (!agent.knowledgeBase || !agent.knowledgeBase.trim()) return;
  const exists = await KbDocument.count({ where: { agentId: agent.id, source: "texto", title: "Base de conhecimento original" } });
  if (exists) return;
  await addDocument({ title: "Base de conhecimento original", content: agent.knowledgeBase, agentId: agent.id });
};

const STOP = new Set(
  "a o as os um uma uns umas de do da dos das em no na nos nas por para com sem sobre e ou que se eu voce vc me te meu minha seu sua ao aos pra pro ja mais muito quero queria gostaria saber tem ter ha qual quais como quando onde quanto quantos esta estou sao foi ser ficar fazer".split(" ")
);

const tokens = (text: string): string[] =>
  [...new Set(norm(text).replace(/[^a-z0-9 ]/g, " ").split(" ").filter(t => t.length > 2 && !STOP.has(t)))].slice(0, 12);

export interface Hit {
  documentId: number;
  title: string;
  content: string;
  score: number;
}

// Best chunks for a question among the agent's documents (and the shared ones).
export const searchChunks = async (agentId: number, question: string, limit = 4): Promise<Hit[]> => {
  const words = tokens(question);
  if (!words.length) return [];

  if (isPg()) {
    const rows: any[] = await sequelize.query(
      `SELECT c."documentId", d.title, c.content, ts_rank(c.tsv, q.query) AS score
         FROM "KbChunks" c
         JOIN "KbDocuments" d ON d.id = c."documentId"
         CROSS JOIN (SELECT to_tsquery('portuguese', :q) AS query) q
        WHERE d.kind = 'doc' AND (d."agentId" IS NULL OR d."agentId" = :agentId) AND c.tsv @@ q.query
        ORDER BY score DESC, c.id
        LIMIT :limit`,
      { replacements: { q: words.join(" | "), agentId, limit }, type: QueryTypes.SELECT }
    );
    return rows.map(r => ({ documentId: r.documentId, title: r.title, content: r.content, score: Number(r.score) }));
  }

  // other databases: count how many words each chunk contains
  const docs = await KbDocument.findAll({ where: { kind: "doc", agentId: { [Op.or]: [agentId, null] } } as any, attributes: ["id", "title"] });
  const chunks = await KbChunk.findAll({ where: { documentId: docs.map(d => d.id) } });
  return chunks
    .map(c => ({
      documentId: c.documentId,
      title: docs.find(d => d.id === c.documentId)?.title || "",
      content: c.content,
      score: words.filter(w => c.contentNorm.includes(w)).length
    }))
    .filter(h => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
};

// FAQ answered without calling the model: the message equals the question, or is short and holds a keyword phrase.
export const matchFaq = async (agentId: number, message: string): Promise<KbDocument | null> => {
  const text = norm(message).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const faqs = await KbDocument.findAll({ where: { kind: "faq", agentId: { [Op.or]: [agentId, null] } } as any });
  const short = text.split(" ").length <= 6;
  return (
    faqs.find(f => norm(f.title).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim() === text) ||
    (short
      ? faqs.find(f =>
          (f.keywords || "")
            .split(",")
            .map(k => norm(k).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim())
            .filter(Boolean)
            .some(k => text === k || ` ${text} `.includes(` ${k} `))
        )
      : null) ||
    null
  );
};
