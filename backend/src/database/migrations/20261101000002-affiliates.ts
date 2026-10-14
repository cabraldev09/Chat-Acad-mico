import { QueryInterface, DataTypes } from "sequelize";

const ts = {
  createdAt: { type: DataTypes.DATE(6), allowNull: false },
  updatedAt: { type: DataTypes.DATE(6), allowNull: false }
};
const pk = { id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false } };
const fk = (model: string, onDelete = "SET NULL", allowNull = true) => ({
  type: DataTypes.INTEGER,
  allowNull,
  references: { model, key: "id" },
  onDelete
});

// Affiliates: people outside the team who refer students. Each one is followed by a consultant, has a link to the
// support-material portal (no login) and earns a bonus (or Pix) for each enrolment, paid later by the maintainer.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("Affiliates", {
      ...pk,
      name: { type: DataTypes.STRING, allowNull: false },
      phone: { type: DataTypes.STRING, allowNull: true },
      email: { type: DataTypes.STRING, allowNull: true },
      document: { type: DataTypes.STRING, allowNull: true },
      city: { type: DataTypes.STRING, allowNull: true },
      ownerId: fk("Users"),
      poloId: fk("Polos"),
      refCode: { type: DataTypes.STRING, allowNull: false, unique: true },
      portalToken: { type: DataTypes.STRING, allowNull: false, unique: true },
      pixKeyType: { type: DataTypes.STRING, allowNull: true },
      pixKey: { type: DataTypes.STRING, allowNull: true },
      status: { type: DataTypes.STRING, allowNull: false, defaultValue: "active" },
      notes: { type: DataTypes.TEXT, allowNull: true },
      bonusValue: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      lastAccessAt: { type: DataTypes.DATE(6), allowNull: true },
      ...ts
    });
    await queryInterface.addIndex("Affiliates", ["ownerId"]);

    await queryInterface.addColumn("Leads", "affiliateId", fk("Affiliates"));
    await queryInterface.addColumn("Proposals", "affiliateId", fk("Affiliates"));
    await queryInterface.addIndex("Leads", ["affiliateId"]);
    await queryInterface.addIndex("Proposals", ["affiliateId"]);

    await queryInterface.createTable("AffiliateCampaigns", {
      ...pk,
      title: { type: DataTypes.STRING, allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      coverFile: { type: DataTypes.STRING, allowNull: true },
      startsAt: { type: DataTypes.DATE(6), allowNull: true },
      endsAt: { type: DataTypes.DATE(6), allowNull: true },
      audience: { type: DataTypes.STRING, allowNull: false, defaultValue: "all" },
      bonusValue: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      createdBy: fk("Users"),
      ...ts
    });

    await queryInterface.createTable("AffiliateMaterials", {
      ...pk,
      title: { type: DataTypes.STRING, allowNull: false },
      kind: { type: DataTypes.STRING, allowNull: false, defaultValue: "other" },
      description: { type: DataTypes.TEXT, allowNull: true },
      fileName: { type: DataTypes.STRING, allowNull: true },
      originalName: { type: DataTypes.STRING, allowNull: true },
      mimeType: { type: DataTypes.STRING, allowNull: true },
      fileSize: { type: DataTypes.INTEGER, allowNull: true },
      externalUrl: { type: DataTypes.TEXT, allowNull: true },
      copyText: { type: DataTypes.TEXT, allowNull: true },
      courseId: fk("Courses"),
      campaignId: fk("AffiliateCampaigns"),
      audience: { type: DataTypes.STRING, allowNull: false, defaultValue: "all" },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      downloads: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      createdBy: fk("Users"),
      ...ts
    });

    // who a material or a campaign is released to, when it is not for everyone
    await queryInterface.createTable("AffiliateAudiences", {
      ...pk,
      targetType: { type: DataTypes.STRING, allowNull: false },
      targetId: { type: DataTypes.INTEGER, allowNull: false },
      ownerId: fk("Users", "CASCADE"),
      affiliateId: fk("Affiliates", "CASCADE"),
      ...ts
    });
    await queryInterface.addIndex("AffiliateAudiences", ["targetType", "targetId"]);

    await queryInterface.createTable("AffiliateBonuses", {
      ...pk,
      affiliateId: fk("Affiliates", "CASCADE", false),
      leadId: { ...fk("Leads", "CASCADE", false), unique: true },
      campaignId: fk("AffiliateCampaigns"),
      kind: { type: DataTypes.STRING, allowNull: false, defaultValue: "bonus" },
      amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      status: { type: DataTypes.STRING, allowNull: false, defaultValue: "pending" },
      reason: { type: DataTypes.STRING, allowNull: true },
      approvedBy: fk("Users"),
      approvedAt: { type: DataTypes.DATE(6), allowNull: true },
      paidBy: fk("Users"),
      paidAt: { type: DataTypes.DATE(6), allowNull: true },
      paymentRef: { type: DataTypes.STRING, allowNull: true },
      note: { type: DataTypes.TEXT, allowNull: true },
      ...ts
    });
    await queryInterface.addIndex("AffiliateBonuses", ["affiliateId", "status"]);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("AffiliateBonuses");
    await queryInterface.dropTable("AffiliateAudiences");
    await queryInterface.dropTable("AffiliateMaterials");
    await queryInterface.dropTable("AffiliateCampaigns");
    await queryInterface.removeColumn("Proposals", "affiliateId");
    await queryInterface.removeColumn("Leads", "affiliateId");
    await queryInterface.dropTable("Affiliates");
  }
};
