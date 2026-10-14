import { Op, Sequelize } from "sequelize";
import QuickAnswer from "../../models/QuickAnswer";

interface Request {
  searchParam?: string;
  pageNumber?: string;
}

interface Response {
  quickAnswers: QuickAnswer[];
  count: number;
  hasMore: boolean;
}

const ListQuickAnswerService = async ({
  searchParam = "",
  pageNumber = "1"
}: Request): Promise<Response> => {
  // typing "/ficha" in a conversation must find "fichamatricula": the shortcut counts as much as the text
  const term = `%${searchParam.toLowerCase().trim()}%`;
  const whereCondition = {
    [Op.or]: [
      Sequelize.where(Sequelize.fn("LOWER", Sequelize.col("shortcut")), "LIKE", term),
      Sequelize.where(Sequelize.fn("LOWER", Sequelize.col("message")), "LIKE", term)
    ]
  };
  const limit = 40;
  const offset = limit * (+pageNumber - 1);

  const { count, rows: quickAnswers } = await QuickAnswer.findAndCountAll({
    where: whereCondition,
    limit,
    offset,
    order: [["shortcut", "ASC"]]
  });

  const hasMore = count > offset + quickAnswers.length;

  return {
    quickAnswers,
    count,
    hasMore
  };
};

export default ListQuickAnswerService;
