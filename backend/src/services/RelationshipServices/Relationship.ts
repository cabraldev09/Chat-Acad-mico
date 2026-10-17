import { getSetting, setSetting } from "../../helpers/AppSettings";
import { RELATIONSHIP_QUEUE_NAME, RELATIONSHIP_QUEUE_ROLE } from "../../helpers/Roles";
import Queue from "../../models/Queue";
import Whatsapp from "../../models/Whatsapp";

// The relationship department works from the institution's own number. Which connection it is lives in a setting (like the
// tutoring number); the queue is one for the whole institution and is made the first time it is needed.
const SETTING = "relationship_whatsapp_id";
const CHANNELS = ["whatsapp", "whatsapp_cloud"];

export const relationshipWhatsappId = async (): Promise<number> => Number(await getSetting(SETTING, "0")) || 0;

export const setRelationshipWhatsappId = async (id: number): Promise<void> => {
  await setSetting(SETTING, String(id > 0 ? id : 0));
};

// the chosen connection, whatever its state (null when none was chosen or it was deleted)
export const relationshipConnection = async (): Promise<Whatsapp | null> => {
  const id = await relationshipWhatsappId();
  if (!id) return null;
  const w = await Whatsapp.findByPk(id);
  return w && CHANNELS.includes(w.channel || "whatsapp") ? w : null;
};

export const isRelationshipConnection = async (whatsappId: number | null | undefined): Promise<boolean> => {
  if (!whatsappId) return false;
  return (await relationshipWhatsappId()) === Number(whatsappId);
};

const PALETTE = ["#7C3AED", "#8B5CF6", "#6D28D9", "#A855F7", "#9333EA", "#7E22CE"];

// the queue of the department (one for the institution), made when missing
export const ensureRelationshipQueue = async (): Promise<Queue> => {
  const found = (await Queue.findOne({ where: { role: RELATIONSHIP_QUEUE_ROLE } })) || (await Queue.findOne({ where: { name: RELATIONSHIP_QUEUE_NAME } }));
  if (found) {
    if (found.role !== RELATIONSHIP_QUEUE_ROLE) await found.update({ role: RELATIONSHIP_QUEUE_ROLE });
    return found;
  }
  const used = new Set((await Queue.findAll({ attributes: ["color"] })).map(q => q.color));
  const color = PALETTE.find(c => !used.has(c)) || "#7E22CE";
  return Queue.create({ name: RELATIONSHIP_QUEUE_NAME, color, role: RELATIONSHIP_QUEUE_ROLE, autoAssign: "roundrobin" } as any);
};

// a person of the relationship team is in the queue of the department (and only the team is added automatically)
export const joinRelationshipQueue = async (userId: number): Promise<void> => {
  const queue = await ensureRelationshipQueue();
  const users = await queue.$get("users", { attributes: ["id"] });
  if (!users.some(u => u.id === userId)) await queue.$add("users", userId);
};

export const leaveRelationshipQueue = async (userId: number): Promise<void> => {
  const queue = await Queue.findOne({ where: { role: RELATIONSHIP_QUEUE_ROLE } });
  if (queue) await queue.$remove("users", userId);
};
