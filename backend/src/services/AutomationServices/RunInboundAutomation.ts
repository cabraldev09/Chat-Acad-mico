import { subHours } from "date-fns";

import ChatbotNode from "../../models/ChatbotNode";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import { logger } from "../../utils/logger";
import ShowTicketService from "../TicketServices/ShowTicketService";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import { findAgentForTicket, generateReply, HANDOFF_MARKER } from "../AiServices/RunAiAgent";
import AutoAssignTicket from "./AutoAssignTicket";
import { isWithinBusinessHours } from "./BusinessHours";
import { Op } from "sequelize";

// Bot messages carry an invisible mark so they can be told apart from agent
// messages (same convention the queue greeting already used).
const MARK = "‎";

const say = async (ticket: Ticket, body: string): Promise<void> => {
  try {
    await SendWhatsAppMessage({ body: `${MARK}${body}`, ticket });
  } catch (err) {
    logger.error(`Automation could not send message: ${err}`);
  }
};

// chatbotNodeId: null = not started, 0 = waiting at root menu,
// >0 = waiting at that menu node, -1 = flow finished for this ticket
const FLOW_DONE = -1;
const ROOT = 0;

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

const loadChildren = (whatsappId: number, parentId: number | null) =>
  ChatbotNode.findAll({
    where: {
      parentId: parentId === null ? { [Op.is]: null } : parentId,
      whatsappId: { [Op.or]: [whatsappId, null] }
    } as any,
    order: [
      ["position", "ASC"],
      ["id", "ASC"]
    ]
  });

const menuText = (
  intro: string | null | undefined,
  options: ChatbotNode[],
  withBack: boolean
): string => {
  const list = options.map((n, i) => `*${i + 1}* - ${n.title}`).join("\n");
  const back = withBack ? "\n*0* - Voltar" : "";
  return `${intro ? `${intro}\n\n` : ""}${list}${back}`;
};

const finishFlow = (ticket: Ticket) =>
  ticket.update({ chatbotNodeId: FLOW_DONE });

const runNodeAction = async (ticket: Ticket, node: ChatbotNode): Promise<void> => {
  const whatsappId = ticket.whatsappId;
  switch (node.action) {
    case "menu": {
      const children = await loadChildren(whatsappId, node.id);
      if (!children.length) {
        if (node.message) await say(ticket, node.message);
        await finishFlow(ticket);
        return;
      }
      await ticket.update({ chatbotNodeId: node.id });
      await say(ticket, menuText(node.message || node.title, children, true));
      return;
    }
    case "queue": {
      if (node.message) await say(ticket, node.message);
      await UpdateTicketService({
        ticketData: { queueId: node.targetId },
        ticketId: ticket.id
      });
      await finishFlow(ticket);
      await AutoAssignTicket(await ShowTicketService(ticket.id));
      return;
    }
    case "user": {
      if (node.message) await say(ticket, node.message);
      const user = node.targetId ? await User.findByPk(node.targetId) : null;
      if (user) {
        await UpdateTicketService({
          ticketData: { userId: user.id, status: "open" },
          ticketId: ticket.id
        });
      }
      await finishFlow(ticket);
      return;
    }
    case "close": {
      if (node.message) await say(ticket, node.message);
      await finishFlow(ticket);
      await UpdateTicketService({
        ticketData: { status: "closed" },
        ticketId: ticket.id
      });
      return;
    }
    case "ai": {
      await ticket.update({ chatbotNodeId: FLOW_DONE, aiActive: true });
      if (node.message) await say(ticket, node.message);
      return;
    }
    default: {
      // "message": answer with text and end the flow
      if (node.message) await say(ticket, node.message);
      await finishFlow(ticket);
    }
  }
};

// Returns true when the chatbot flow consumed the message
const runChatbot = async (
  ticket: Ticket,
  body: string,
  greeting: string | undefined
): Promise<boolean> => {
  const whatsappId = ticket.whatsappId;
  const nodeCount = await ChatbotNode.count({
    where: { whatsappId: { [Op.or]: [whatsappId, null] } } as any
  });
  if (!nodeCount || ticket.chatbotNodeId === FLOW_DONE) return false;

  const showRoot = async (prefix = "") => {
    const roots = await loadChildren(whatsappId, null);
    if (!roots.length) {
      await finishFlow(ticket);
      return false;
    }
    await ticket.update({ chatbotNodeId: ROOT });
    await say(
      ticket,
      prefix +
        menuText(greeting || "Olá {{name}}! Como posso ajudar? Escolha uma opção:", roots, false)
    );
    return true;
  };

  if (ticket.chatbotNodeId === null || ticket.chatbotNodeId === undefined) {
    return showRoot();
  }

  const currentId = ticket.chatbotNodeId;
  const parentId = currentId === ROOT ? null : currentId;
  const options = await loadChildren(whatsappId, parentId);
  const answer = normalize(body);

  if (answer === "0" && currentId !== ROOT) {
    const current = await ChatbotNode.findByPk(currentId);
    if (current && current.parentId) {
      const parent = await ChatbotNode.findByPk(current.parentId);
      if (parent) {
        await runNodeAction(ticket, parent);
        return true;
      }
    }
    return showRoot();
  }

  const index = /^\d+$/.test(answer) ? Number(answer) - 1 : -1;
  const chosen =
    options[index] ||
    options.find(n => normalize(n.title) === answer) ||
    options.find(n =>
      (n.keywords || "")
        .split(",")
        .map(k => normalize(k))
        .filter(Boolean)
        .includes(answer)
    );

  if (!chosen) {
    const text = menuText(null, options, currentId !== ROOT);
    await say(ticket, `Opção inválida. Escolha uma das opções:\n\n${text}`);
    return true;
  }

  await runNodeAction(ticket, chosen);
  return true;
};

const runAi = async (ticket: Ticket): Promise<boolean> => {
  if (!ticket.aiActive) return false;
  const agent = await findAgentForTicket(ticket);
  if (!agent) return false;

  try {
    const reply = await generateReply(agent, ticket);
    if (!reply) return true;
    if (reply.includes(HANDOFF_MARKER)) {
      await ticket.update({ aiActive: false });
      await say(
        ticket,
        agent.handoffMessage ||
          "Vou transferir você para um de nossos atendentes. Um momento, por favor."
      );
      await AutoAssignTicket(await ShowTicketService(ticket.id));
      return true;
    }
    await say(ticket, reply);
  } catch (err) {
    const detail = err?.response?.data?.error?.message || err?.message || err;
    logger.error(`AI agent "${agent.name}" failed: ${detail}`);
    // leave the ticket for a human instead of going silent
    await ticket.update({ aiActive: false });
  }
  return true;
};

const runClassicQueueMenu = async (
  ticket: Ticket,
  body: string,
  whatsappId: number
): Promise<void> => {
  const { queues, greetingMessage } = await ShowWhatsAppService(whatsappId);
  if (ticket.queueId || !queues.length) return;

  if (queues.length === 1) {
    await UpdateTicketService({
      ticketData: { queueId: queues[0].id },
      ticketId: ticket.id
    });
    await AutoAssignTicket(await ShowTicketService(ticket.id));
    return;
  }

  const chosen = queues[+body - 1];
  if (chosen) {
    await UpdateTicketService({
      ticketData: { queueId: chosen.id },
      ticketId: ticket.id
    });
    if (chosen.greetingMessage) await say(ticket, chosen.greetingMessage);
    await AutoAssignTicket(await ShowTicketService(ticket.id));
    return;
  }

  const options = queues.map((q, i) => `*${i + 1}* - ${q.name}`).join("\n");
  await say(ticket, `${greetingMessage}\n${options}`);
};

interface Input {
  ticketId: number;
  body: string;
}

const RunInboundAutomation = async ({ ticketId, body }: Input): Promise<void> => {
  try {
    const ticket = await ShowTicketService(ticketId);
    if (ticket.isGroup || ticket.status === "closed" || ticket.userId) return;

    const whatsapp = await ShowWhatsAppService(ticket.whatsappId);

    if (!isWithinBusinessHours(whatsapp)) {
      const recently =
        ticket.outOfHoursSentAt && ticket.outOfHoursSentAt > subHours(new Date(), 6);
      if (whatsapp.outOfHoursMessage && !recently) {
        await ticket.update({ outOfHoursSentAt: new Date() });
        await say(ticket, whatsapp.outOfHoursMessage);
      }
      return;
    }

    if (await runChatbot(ticket, body, whatsapp.greetingMessage)) return;
    if (await runAi(ticket)) return;
    await runClassicQueueMenu(ticket, body, ticket.whatsappId);
  } catch (err) {
    logger.error({ info: "Inbound automation error", err });
  }
};

export default RunInboundAutomation;
