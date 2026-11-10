import { QueryInterface } from "sequelize";

// The messages with a file but no caption were stored with the NAME of the file as text ("dhasm-1792763841010.jpg"): the list, the toasts and the chat showed it.
// They become "📷 Imagem", "🎤 Áudio", "🎥 Vídeo" and "Figurinha" (documents keep their name). The same for the last message of each conversation.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const sq = queryInterface.sequelize;
    if (sq.getDialect() !== "postgres") return;
    const NAME = "'^[^[:space:]\\\\/]{1,160}\\.(jpe?g|png|gif|webp|bmp|heic|mp4|mov|3gp|avi|mkv|webm|ogg|oga|opus|mp3|m4a|aac|wav|amr)$'";
    const label = (typeCol: string, urlCol: string) =>
      `CASE WHEN ${typeCol} = 'image' AND ${urlCol} ~* '\\.webp(\\?|$)' THEN 'Figurinha' WHEN ${typeCol} = 'image' THEN '📷 Imagem' WHEN ${typeCol} = 'video' THEN '🎥 Vídeo' WHEN ${typeCol} IN ('audio','ptt') THEN '🎤 Áudio' END`;
    await sq.query(
      `UPDATE "Messages" SET body = ${label('"mediaType"', '"mediaUrl"')}
       WHERE "mediaType" IN ('image','video','audio','ptt') AND (body = "mediaUrl" OR body ~* ${NAME} OR body IN ('📷 Foto','Foto','🎤 Mensagem de voz','Mensagem de voz'))`
    );
    // the last message of the conversation: it is a copy of the text of the message (and "sticker" is its own kind)
    await sq.query(
      `UPDATE "Tickets" t SET "lastMessage" = ${label('t."lastMessageType"', "COALESCE(m.\"mediaUrl\", '')")}
       FROM "Messages" m
       WHERE m.id = t."lastMessageId" AND t."lastMessageType" IN ('image','video','audio','ptt') AND (t."lastMessage" = m."mediaUrl" OR t."lastMessage" ~* ${NAME})`
    );
    await sq.query(
      `UPDATE "Tickets" SET "lastMessage" = 'Figurinha' WHERE "lastMessageType" = 'sticker' AND "lastMessage" ~* ${NAME}`
    );
  },
  down: async () => undefined
};
