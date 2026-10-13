import { QueryInterface, DataTypes } from "sequelize";

const ts = {
  createdAt: { type: DataTypes.DATE, allowNull: false },
  updatedAt: { type: DataTypes.DATE, allowNull: false }
};
const pk = {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false
  }
};

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("Tags", {
      ...pk,
      name: { type: DataTypes.STRING, allowNull: false, unique: true },
      color: { type: DataTypes.STRING, allowNull: false },
      ...ts
    });
    for (const [table, col, ref] of [
      ["TicketTags", "ticketId", "Tickets"],
      ["ContactTags", "contactId", "Contacts"]
    ]) {
      await queryInterface.createTable(table, {
        [col]: {
          type: DataTypes.INTEGER,
          allowNull: false,
          primaryKey: true,
          references: { model: ref, key: "id" },
          onDelete: "CASCADE"
        },
        tagId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          primaryKey: true,
          references: { model: "Tags", key: "id" },
          onDelete: "CASCADE"
        },
        ...ts
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("ContactTags");
    await queryInterface.dropTable("TicketTags");
    await queryInterface.dropTable("Tags");
  }
};
