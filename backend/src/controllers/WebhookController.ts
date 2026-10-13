import { Request, Response } from "express";
import axios from "axios";
import Webhook from "../models/Webhook";
import { isMasked } from "../helpers/Secrets";
import { WEBHOOK_EVENTS } from "../services/WebhookServices/DispatchWebhook";
import AppError from "../errors/AppError";
import makeCrud from "./crudFactory";

const crud = makeCrud(Webhook, {
  fields: ["name", "url", "secret", "events", "active"],
  required: ["name", "url"],
  beforeSave: data => {
    if (data.events && Array.isArray(data.events)) {
      data.events = JSON.stringify(data.events);
    }
    if (data.events === undefined) data.events = JSON.stringify(["*"]);
    if (isMasked(data.secret)) delete data.secret;
    if (data.url && !/^https?:\/\//i.test(data.url)) {
      throw new AppError("ERR_WEBHOOK_URL_INVALID");
    }
    return data;
  }
});

export const { index, show, store, update, remove } = crud;

export const events = async (_req: Request, res: Response): Promise<Response> =>
  res.json(WEBHOOK_EVENTS);

export const test = async (req: Request, res: Response): Promise<Response> => {
  const hook = await Webhook.findByPk(req.params.id);
  if (!hook) throw new AppError("ERR_NOT_FOUND", 404);
  try {
    const r = await axios.post(
      hook.url,
      { event: "webhook.test", timestamp: new Date().toISOString(), data: {} },
      { timeout: 8000, validateStatus: () => true }
    );
    await hook.update({ lastStatus: r.status, lastError: null, lastAt: new Date() });
    return res.json({ status: r.status });
  } catch (err) {
    await hook.update({ lastStatus: 0, lastError: String(err.message), lastAt: new Date() });
    throw new AppError(`ERR_WEBHOOK_TEST_FAILED`);
  }
};
