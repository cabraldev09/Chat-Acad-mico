import { Sequelize, Op } from "sequelize";
import Contact from "../../models/Contact";

interface Request {
  searchParam?: string;
  pageNumber?: string;
  // the groups the person may see (see ConnectionScope)
  scope?: any | null;
  // people: persons and companies; groups: groups and communities (channels are neither); nothing: everything
  kind?: "people" | "groups";
}

interface Response {
  contacts: Contact[];
  count: number;
  hasMore: boolean;
}

// the search of the contacts screen (name or number); the spreadsheet of contacts uses the same one
export const contactsSearchWhere = (searchParam = "") => {
  // a "%" or "_" typed in the search is a character, not a wildcard
  const like = `%${searchParam.toLowerCase().trim().replace(/[\\%_]/g, "\\$&")}%`;
  return {
    [Op.or]: [
      { name: Sequelize.where(Sequelize.fn("LOWER", Sequelize.col("name")), "LIKE", like) },
      { number: { [Op.like]: like } }
    ]
  };
};

const ListContactsService = async ({
  searchParam = "",
  pageNumber = "1",
  scope = null,
  kind
}: Request): Promise<Response> => {
  const kindWhere: any[] =
    kind === "people"
      ? [{ isGroup: false }, { [Op.or]: [{ kind: { [Op.in]: ["person", "business"] } }, { kind: { [Op.is]: null } }] }]
      : kind === "groups"
        ? [{ isGroup: true }, { [Op.or]: [{ kind: { [Op.ne]: "channel" } }, { kind: { [Op.is]: null } }] }]
        : [];
  const parts: any[] = [contactsSearchWhere(searchParam), ...(scope ? [scope] : []), ...kindWhere];
  const whereCondition: any = parts.length > 1 ? { [Op.and]: parts } : parts[0];
  const limit = 20;
  const offset = limit * (+pageNumber - 1);

  const { count, rows: contacts } = await Contact.findAndCountAll({
    where: whereCondition,
    limit,
    offset,
    order: [["name", "ASC"]]
  });

  const hasMore = count > offset + contacts.length;

  return {
    contacts,
    count,
    hasMore
  };
};

export default ListContactsService;
