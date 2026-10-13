import { Request, Response } from "express";
import { Op } from "sequelize";
import ChatbotNode from "../models/ChatbotNode";
import makeCrud from "./crudFactory";

const crud = makeCrud(ChatbotNode, {
  event: "chatbotNode",
  fields: [
    "whatsappId",
    "parentId",
    "position",
    "title",
    "keywords",
    "message",
    "action",
    "targetId",
    "field"
  ],
  required: ["title"],
  order: [
    ["position", "ASC"],
    ["id", "ASC"]
  ],
  beforeSave: data => {
    ["whatsappId", "parentId", "targetId"].forEach(k => {
      if (data[k] === "" || data[k] === 0) data[k] = null;
    });
    return data;
  },
  afterDelete: async row => {
    // remove the whole subtree
    const stack = [row.id];
    while (stack.length) {
      const id = stack.pop();
      // eslint-disable-next-line no-await-in-loop
      const children = await ChatbotNode.findAll({ where: { parentId: id } });
      children.forEach(c => stack.push(c.id));
      // eslint-disable-next-line no-await-in-loop
      await ChatbotNode.destroy({ where: { parentId: id } });
    }
  }
});

export const { show, store, update, remove } = crud;

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.query;
  const where: any = {};
  if (whatsappId === "global") where.whatsappId = { [Op.is]: null };
  else if (whatsappId) where.whatsappId = whatsappId;
  const nodes = await ChatbotNode.findAll({
    where,
    order: [
      ["position", "ASC"],
      ["id", "ASC"]
    ]
  });
  return res.json(nodes);
};
