import { QueryInterface } from "sequelize";

// GET /api/v1/indicadores reads the reviews of the conversations by day (a period of up to 93 days): an index on the day, so the read does
// not walk the whole table as it grows (about 60 reviews a day).
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addIndex("ConsultantReviews", ["day"], { name: "consultant_reviews_day_idx" });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeIndex("ConsultantReviews", "consultant_reviews_day_idx");
  }
};
