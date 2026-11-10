// The invisible mark (left-to-right mark) the robots put in front of their messages. The listener of the WhatsApp connection skips what
// starts with it (that is how a robot's message is told from a person's), so the sender has to store those messages itself.
export const BOT_MARK = "‎";
export const startsWithBotMark = (text: string): boolean => String(text || "").charAt(0) === BOT_MARK;
