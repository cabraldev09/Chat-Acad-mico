import PoloMember from "../../models/PoloMember";
import Queue from "../../models/Queue";
import User from "../../models/User";
import UserQueue from "../../models/UserQueue";

export interface PoloTutor {
  id: number;
  name: string;
  // not from this polo: listed only because the polo has no tutor yet
  outside?: boolean;
}

const TUTOR_ROLES = ["tutor", "academico"];

// Who can be chosen as the tutor of a polo: the tutors listed in Polos e equipes, whoever belongs to the polo's tutoring queue (and is
// a tutor), and tutors listed in the polo under another function. A polo with nobody yet offers every tutor of the institution, marked,
// so a student is never stuck waiting because the registration of the team is incomplete.
export const tutorsOfPolo = async (poloId: number): Promise<PoloTutor[]> => {
  const found = new Map<number, PoloTutor>();
  const members = poloId ? await PoloMember.findAll({ where: { poloId }, include: [{ model: User, as: "user", attributes: ["id", "name", "role"] }] }) : [];
  members.forEach(m => {
    if (m.user && (m.role === "tutoria" || TUTOR_ROLES.includes(m.user.role))) found.set(m.user.id, { id: m.user.id, name: m.user.name });
  });
  const queues = poloId ? await Queue.findAll({ where: { poloId, role: "tutoria" } as any, attributes: ["id"] }) : [];
  if (queues.length) {
    const links = await UserQueue.findAll({ where: { queueId: queues.map(q => q.id) }, attributes: ["userId"] });
    const users = await User.findAll({ where: { id: links.map(l => l.userId) }, attributes: ["id", "name", "role"] });
    users.filter(u => TUTOR_ROLES.includes(u.role)).forEach(u => found.set(u.id, { id: u.id, name: u.name }));
  }
  if (!found.size) {
    const all = await User.findAll({ where: { role: TUTOR_ROLES } as any, attributes: ["id", "name"] });
    all.forEach(u => found.set(u.id, { id: u.id, name: u.name, outside: true }));
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
};

export const canTutorPolo = async (poloId: number, userId: number): Promise<boolean> => (await tutorsOfPolo(poloId)).some(t => t.id === userId);
