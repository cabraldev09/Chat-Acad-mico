import { Sequelize, Op } from "sequelize";
import Contact from "../../models/Contact";

interface Request {
  searchParam?: string;
  pageNumber?: string;
  // the groups the person may see (see ConnectionScope)
  scope?: any | null;
}

interface Response {
  contacts: Contact[];
  count: number;
  hasMore: boolean;
}

// the search of the contacts screen (name or number); the spreadsheet of contacts uses the same one
export const contactsSearchWhere = (searchParam = "") => ({
  [Op.or]: [
    {
      name: Sequelize.where(
        Sequelize.fn("LOWER", Sequelize.col("name")),
        "LIKE",
        `%${searchParam.toLowerCase().trim()}%`
      )
    },
    { number: { [Op.like]: `%${searchParam.toLowerCase().trim()}%` } }
  ]
});

const ListContactsService = async ({
  searchParam = "",
  pageNumber = "1",
  scope = null
}: Request): Promise<Response> => {
  const whereCondition: any = scope ? { [Op.and]: [contactsSearchWhere(searchParam), scope] } : contactsSearchWhere(searchParam);
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
