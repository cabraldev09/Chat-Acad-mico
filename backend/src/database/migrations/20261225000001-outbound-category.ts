import { QueryInterface, DataTypes } from "sequelize";

// The category of each send of the Meta (MARKETING, UTILITY, AUTHENTICATION or SERVICE): the estimate of the cost follows the category,
// and the 1.000 free answers of each number per month are counted by it. What was sent before stays without a category.
module.exports = {
  up: async (q: QueryInterface) => {
    const cols = await q.describeTable("OutboundDeliveries");
    if (!(cols as any).category) await q.addColumn("OutboundDeliveries", "category", { type: DataTypes.STRING(20), allowNull: true });
    await q.addIndex("OutboundDeliveries", ["whatsappId", "category", "createdAt"], { name: "outbound_deliveries_number_category_month" }).catch(() => undefined);
  },
  down: async (q: QueryInterface) => {
    await q.removeIndex("OutboundDeliveries", "outbound_deliveries_number_category_month").catch(() => undefined);
    await q.removeColumn("OutboundDeliveries", "category");
  }
};
