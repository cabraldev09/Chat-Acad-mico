import { corsOrigin } from "../helpers/AllowedOrigins";
import { Server as SocketIO } from "socket.io";
import { Server } from "http";
import { verify } from "jsonwebtoken";
import AppError from "../errors/AppError";
import { logger } from "../utils/logger";
import authConfig from "../config/auth";

let io: SocketIO;

export const initIO = (httpServer: Server): SocketIO => {
  io = new SocketIO(httpServer, {
    cors: {
      origin: corsOrigin()
    }
  });

  // Connection events carry the QR Code. Everyone receives them without it; the QR Code itself only goes to
  // the administrators and to the owner of that number.
  const broadcast = io.emit.bind(io);
  (io as any).emit = (event: string, ...args: any[]) => {
    const payload = args[0];
    const key = event === "whatsappSession" ? "session" : event === "whatsapp" ? "whatsapp" : null;
    const item = key && payload ? payload[key] : null;
    if (!item || typeof item !== "object") return broadcast(event, ...args);
    const plain = typeof item.toJSON === "function" ? item.toJSON() : { ...item };
    const { qrcode, ...withoutQr } = plain;
    // one by one: the QR Code only goes to administrators and to the owner of that number
    // a personal number is not announced to other people at all
    io.sockets.sockets.forEach((sock: any) => {
      const mayScan = sock.isAdminUser || (plain.ownerId && sock.userIdOf === plain.ownerId);
      if (plain.ownerId && !mayScan) return;
      sock.emit(event, { ...payload, [key as string]: mayScan ? plain : withoutQr });
    });
    return true;
  };

  io.on("connection", socket => {
    const { token } = socket.handshake.query;
    let tokenData = null;
    try {
      tokenData = verify(token, authConfig.secret);
      logger.debug(JSON.stringify(tokenData), "io-onConnection: tokenData");
    } catch (error) {
      logger.error(JSON.stringify(error), "Error decoding token");
      socket.disconnect();
      return io;
    }

    logger.info("Client Connected");
    const who: any = tokenData;
    (socket as any).isAdminUser = who?.profile === "admin";
    (socket as any).userIdOf = who?.id ? Number(who.id) : null;
    socket.on("joinChatBox", (ticketId: string) => {
      logger.info("A client joined a ticket channel");
      socket.join(ticketId);
    });

    socket.on("joinNotification", () => {
      logger.info("A client joined notification channel");
      socket.join("notification");
    });

    socket.on("joinTickets", (status: string) => {
      logger.info(`A client joined to ${status} tickets channel.`);
      socket.join(status);
    });

    socket.on("disconnect", () => {
      logger.info("Client disconnected");
    });

    return socket;
  });
  return io;
};

export const getIO = (): SocketIO => {
  if (!io) {
    throw new AppError("Socket IO not initialized");
  }
  return io;
};
