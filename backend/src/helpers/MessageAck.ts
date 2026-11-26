import { MessageAck } from "../providers/WhatsApp/types/ProviderMessage";

// The ticks of WhatsApp Web (-1 failed, 0 pending, 1 sent, 2 delivered, 3 read, 4 played); anything else is "pending"
export const mapMessageAck = (wbotAck: any): MessageAck => {
  const ackMap: Record<number, MessageAck> = { "-1": -1, 0: 0, 1: 1, 2: 2, 3: 3, 4: 4 };
  return ackMap[wbotAck] ?? 0;
};

// The tick a message already has when it is created (sent from the phone, or by the system): stored right away, so it does not stay
// "Enviando" (clock in the list) when WhatsApp sends no later tick for it. A received message carries none (it is stored as 0).
export const ackOfCreated = (msg: { fromMe?: boolean; ack?: any }): MessageAck | undefined =>
  msg.fromMe ? mapMessageAck(msg.ack) : undefined;
