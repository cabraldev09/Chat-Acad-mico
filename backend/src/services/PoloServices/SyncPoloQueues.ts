import Polo from "../../models/Polo";
import PoloMember from "../../models/PoloMember";
import Queue from "../../models/Queue";
import { POLO_FUNCTIONS, POLO_FUNCTION_LABEL, PoloFunction } from "../../helpers/Roles";

const BASE_HUE: Record<PoloFunction, number> = {
  comercial: 212,
  tutoria: 168,
  coordenacao: 28
};

const hslToHex = (h: number, s: number, l: number): string => {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

// Queue colors are unique in the system: walk lightness/hue until a free one is found
const freeColor = async (role: PoloFunction): Promise<string> => {
  const used = new Set((await Queue.findAll({ attributes: ["color"] })).map(q => q.color));
  for (let i = 0; i < 80; i += 1) {
    const color = hslToHex((BASE_HUE[role] + Math.floor(i / 8) * 7) % 360, 62, 30 + (i % 8) * 5);
    if (!used.has(color)) return color;
  }
  return hslToHex(Math.floor(Math.random() * 360), 60, 40);
};

const queueName = async (polo: Polo, role: PoloFunction, ownId?: number): Promise<string> => {
  const base = `${POLO_FUNCTION_LABEL[role]} · ${polo.name}`;
  const clash = await Queue.findOne({ where: { name: base } });
  return clash && clash.id !== ownId ? `${base} (${polo.code || polo.id})` : base;
};

// One queue per function of the polo ("Comercial · Vilhena", "Tutoria · Vilhena"…),
// each filled with the people the polo lists for that function. Idempotent.
const syncPoloQueues = async (poloOrId: Polo | number): Promise<void> => {
  const polo = typeof poloOrId === "number" ? await Polo.findByPk(poloOrId) : poloOrId;
  if (!polo) return;
  const members = await PoloMember.findAll({ where: { poloId: polo.id } });

  for (const role of POLO_FUNCTIONS) {
    // eslint-disable-next-line no-await-in-loop
    let queue = await Queue.findOne({ where: { poloId: polo.id, role } });
    // eslint-disable-next-line no-await-in-loop
    const name = await queueName(polo, role, queue?.id);
    if (!queue) {
      // eslint-disable-next-line no-await-in-loop
      queue = await Queue.create({
        name,
        color: await freeColor(role),
        poloId: polo.id,
        role,
        autoAssign: "roundrobin"
      } as any);
    } else if (queue.name !== name) {
      // eslint-disable-next-line no-await-in-loop
      await queue.update({ name });
    }
    const userIds = members.filter(m => m.role === role).map(m => m.userId);
    // eslint-disable-next-line no-await-in-loop
    await queue.$set("users", userIds);
  }
};

export default syncPoloQueues;
