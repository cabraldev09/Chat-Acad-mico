import { Request, Response } from "express";
import AiAgent from "../models/AiAgent";
import { getSetting, setSetting } from "../helpers/AppSettings";
import { isMasked, maskSecret } from "../helpers/Secrets";
import makeCrud from "./crudFactory";

const crud = makeCrud(AiAgent, {
  fields: [
    "name",
    "provider",
    "model",
    "apiKey",
    "systemPrompt",
    "knowledgeBase",
    "handoffMessage",
    "maxHistory",
    "active",
    "queueId",
    "whatsappId"
  ],
  required: ["name", "model"],
  beforeSave: data => {
    if (isMasked(data.apiKey)) delete data.apiKey;
    ["queueId", "whatsappId"].forEach(k => {
      if (data[k] === "" || data[k] === 0) data[k] = null;
    });
    return data;
  }
});

export const { index, show, store, update, remove } = crud;

export const getKeys = async (_req: Request, res: Response): Promise<Response> =>
  res.json({
    anthropic: maskSecret(await getSetting("ai_anthropic_key")) || "",
    openai: maskSecret(await getSetting("ai_openai_key")) || ""
  });

export const setKeys = async (req: Request, res: Response): Promise<Response> => {
  const { anthropic, openai } = req.body;
  if (anthropic !== undefined && !isMasked(anthropic)) {
    await setSetting("ai_anthropic_key", anthropic);
  }
  if (openai !== undefined && !isMasked(openai)) {
    await setSetting("ai_openai_key", openai);
  }
  return res.json({ ok: true });
};
