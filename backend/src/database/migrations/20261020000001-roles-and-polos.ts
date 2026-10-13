import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // job function inside the institution: admin | coordenacao | consultor | tutor | academico
    await queryInterface.addColumn("Users", "role", {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "consultor"
    });
    await queryInterface.bulkUpdate("Users", { role: "admin" }, { profile: "admin" });

    await queryInterface.createTable("Polos", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      code: { type: DataTypes.STRING, allowNull: true, unique: true },
      name: { type: DataTypes.STRING, allowNull: false },
      city: { type: DataTypes.STRING, allowNull: true },
      state: { type: DataTypes.STRING(2), allowNull: true },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: DataTypes.DATE(6), allowNull: false },
      updatedAt: { type: DataTypes.DATE(6), allowNull: false }
    });

    // who works at which polo and in which function (a polo may have several tutors)
    await queryInterface.createTable("PoloMembers", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      poloId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Polos", key: "id" },
        onDelete: "CASCADE"
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
        onDelete: "CASCADE"
      },
      role: { type: DataTypes.STRING, allowNull: false },
      createdAt: { type: DataTypes.DATE(6), allowNull: false },
      updatedAt: { type: DataTypes.DATE(6), allowNull: false }
    });
    await queryInterface.addIndex("PoloMembers", ["poloId", "userId", "role"], { unique: true });

    await queryInterface.addColumn("Queues", "poloId", {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "Polos", key: "id" },
      onDelete: "SET NULL"
    });
    await queryInterface.addColumn("Queues", "role", { type: DataTypes.STRING, allowNull: true });

    await queryInterface.addColumn("Leads", "poloId", {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "Polos", key: "id" },
      onDelete: "SET NULL"
    });

    // stage of the relationship a conversation belongs to: sales | onboarding | support | postsale
    await queryInterface.addColumn("Tickets", "segment", {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "sales"
    });
    await queryInterface.addColumn("Tickets", "leadId", { type: DataTypes.INTEGER, allowNull: true });
    await queryInterface.addIndex("Tickets", ["leadId"]);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Tickets", "leadId");
    await queryInterface.removeColumn("Tickets", "segment");
    await queryInterface.removeColumn("Leads", "poloId");
    await queryInterface.removeColumn("Queues", "role");
    await queryInterface.removeColumn("Queues", "poloId");
    await queryInterface.dropTable("PoloMembers");
    await queryInterface.dropTable("Polos");
    await queryInterface.removeColumn("Users", "role");
  }
};
