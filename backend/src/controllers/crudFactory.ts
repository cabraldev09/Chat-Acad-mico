import { Request, Response } from "express";
import { ModelCtor } from "sequelize-typescript";
import AppError from "../errors/AppError";
import { getIO } from "../libs/socket";

interface CrudOptions {
  // event name emitted over socket.io, e.g. "tag"
  event?: string;
  required?: string[];
  include?: any[];
  order?: any[];
  fields: string[];
  where?: (req: Request) => any;
  beforeSave?: (data: any, req: Request, existing?: any) => Promise<any> | any;
  afterSave?: (row: any, req: Request, created: boolean) => Promise<void> | void;
  afterDelete?: (row: any) => Promise<void> | void;
}

const pick = (body: any, fields: string[]) => {
  const data: Record<string, any> = {};
  fields.forEach(f => {
    if (body[f] !== undefined) data[f] = body[f];
  });
  return data;
};

const makeCrud = (Model: ModelCtor<any>, opts: CrudOptions) => {
  const load = async (id: string) => {
    const row = await Model.findByPk(id, { include: opts.include });
    if (!row) throw new AppError("ERR_NOT_FOUND", 404);
    return row;
  };

  const emit = (action: string, payload: any) => {
    if (opts.event) getIO().emit(opts.event, { action, ...payload });
  };

  return {
    index: async (req: Request, res: Response): Promise<Response> => {
      const rows = await Model.findAll({
        where: opts.where ? opts.where(req) : undefined,
        include: opts.include,
        order: opts.order || [["id", "DESC"]]
      });
      return res.json(rows);
    },

    show: async (req: Request, res: Response): Promise<Response> =>
      res.json(await load(req.params.id)),

    store: async (req: Request, res: Response): Promise<Response> => {
      let data = pick(req.body, opts.fields);
      (opts.required || []).forEach(f => {
        if (data[f] === undefined || data[f] === null || data[f] === "") {
          throw new AppError(`ERR_FIELD_REQUIRED_${f}`);
        }
      });
      if (opts.beforeSave) data = await opts.beforeSave(data, req);
      const created = await Model.create(data);
      const row = await load(String(created.id));
      if (opts.afterSave) await opts.afterSave(row, req, true);
      emit("create", { row });
      return res.status(201).json(row);
    },

    update: async (req: Request, res: Response): Promise<Response> => {
      const row = await load(req.params.id);
      let data = pick(req.body, opts.fields);
      if (opts.beforeSave) data = await opts.beforeSave(data, req, row);
      await row.update(data);
      const fresh = await load(req.params.id);
      if (opts.afterSave) await opts.afterSave(fresh, req, false);
      emit("update", { row: fresh });
      return res.json(fresh);
    },

    remove: async (req: Request, res: Response): Promise<Response> => {
      const row = await load(req.params.id);
      await row.destroy();
      if (opts.afterDelete) await opts.afterDelete(row);
      emit("delete", { id: Number(req.params.id) });
      return res.json({ message: "deleted" });
    }
  };
};

export default makeCrud;
