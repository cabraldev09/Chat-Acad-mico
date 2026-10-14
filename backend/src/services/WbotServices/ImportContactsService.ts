import Whatsapp from "../../models/Whatsapp";
import User from "../../models/User";
import SaveImportedContacts from "../../helpers/SaveImportedContacts";
import { whatsappProvider } from "../../providers/WhatsApp";
import AppError from "../../errors/AppError";
import { logger } from "../../utils/logger";

// Which connected WhatsApp number to read the address book from: the user's own, then the one linked to them or
// the company default, and finally (administrators only) any connected number.
const pickConnection = async (userId: number, whatsappId?: number): Promise<Whatsapp> => {
  const user = await User.findByPk(userId, { attributes: ["id", "profile", "whatsappId"] });
  const isAdmin = user?.profile === "admin";
  const connected = await Whatsapp.findAll({
    where: { status: "CONNECTED", channel: "whatsapp" },
    order: [["id", "ASC"]]
  });

  if (whatsappId) {
    const chosen = connected.find(w => w.id === Number(whatsappId));
    if (!chosen || (!isAdmin && chosen.ownerId !== userId)) throw new AppError("ERR_NO_PERMISSION", 403);
    return chosen;
  }

  const found =
    connected.find(w => w.ownerId === userId) ||
    connected.find(w => w.id === user?.whatsappId) ||
    connected.find(w => w.isDefault) ||
    (isAdmin ? connected[0] : undefined);
  if (!found) throw new AppError("ERR_NO_CONNECTED_WHATSAPP", 400);
  return found;
};

export interface ImportReport {
  connection: string;
  total: number;
  saved: number;
  withPhone: number;
  created: number;
  updated: number;
  groupsMode: string;
  groupsFound: number;
  groupsCreated: number;
}

// Picks the number (quickly, so a problem is reported right away) and returns what to run in the background:
// reading a big address book from WhatsApp can take a while.
const startContactsImport = async (userId: number, whatsappId?: number) => {
  const connection = await pickConnection(userId, whatsappId);

  const run = async (): Promise<ImportReport> => {
    let phoneContacts: any;
    try {
      phoneContacts = await whatsappProvider.getContacts(connection.id);
    } catch (err) {
      logger.error(`Could not get whatsapp contacts from phone. Err: ${err}`);
      throw new AppError("ERR_WAPP_NOT_INITIALIZED");
    }
    const stats = phoneContacts.stats || {};
    const people = await SaveImportedContacts(phoneContacts);

    // groups follow the connection's own rule: none, only the chosen ones, or all
    let groupsFound = 0;
    let groupsCreated = 0;
    const mode = connection.groupsMode || "off";
    if (mode !== "off" && whatsappProvider.listGroups) {
      try {
        let allowed: string[] = [];
        try {
          allowed = connection.allowedGroups ? JSON.parse(connection.allowedGroups) : [];
        } catch (e) {
          allowed = [];
        }
        const groups = (await whatsappProvider.listGroups(connection.id)).filter(
          g => mode === "all" || allowed.includes(g.id)
        );
        groupsFound = groups.length;
        const saved = await SaveImportedContacts(
          groups.map(g => ({ number: g.id, name: g.name, isGroup: true }))
        );
        groupsCreated = saved.created;
      } catch (err) {
        logger.error(`Could not list the groups of the phone. Err: ${err}`);
      }
    }

    return {
      connection: connection.name,
      total: stats.total ?? phoneContacts.length,
      saved: stats.saved ?? phoneContacts.length,
      withPhone: phoneContacts.length,
      created: people.created,
      updated: people.updated,
      groupsMode: mode,
      groupsFound,
      groupsCreated
    };
  };

  return { connection, run };
};

export default startContactsImport;
