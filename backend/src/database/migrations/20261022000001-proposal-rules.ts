import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // rules a proposal model can carry
    await queryInterface.addColumn("ProposalTemplates", "installmentsFixed", { type: DataTypes.INTEGER, allowNull: true }); // null = until the end of the course
    await queryInterface.addColumn("ProposalTemplates", "hasRegression", { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true });
    await queryInterface.addColumn("ProposalTemplates", "hasAdjustment", { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true });
    await queryInterface.addColumn("ProposalTemplates", "fixedUntilEnd", { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
    await queryInterface.addColumn("ProposalTemplates", "firstExempt", { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
    await queryInterface.addColumn("ProposalTemplates", "waIntro", { type: DataTypes.TEXT, allowNull: true });
    await queryInterface.addColumn("ProposalTemplates", "waClosing", { type: DataTypes.TEXT, allowNull: true });

    // one model can serve several institutions
    await queryInterface.createTable("ProposalTemplateInstitutions", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      templateId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "ProposalTemplates", key: "id" }, onDelete: "CASCADE" },
      institutionId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Institutions", key: "id" }, onDelete: "CASCADE" },
      createdAt: { type: DataTypes.DATE(6), allowNull: false },
      updatedAt: { type: DataTypes.DATE(6), allowNull: false }
    });
    await queryInterface.addIndex("ProposalTemplateInstitutions", ["templateId", "institutionId"], { unique: true });
    // carry the old single institution over
    await queryInterface.sequelize.query(
      `INSERT INTO "ProposalTemplateInstitutions" ("templateId","institutionId","createdAt","updatedAt")
       SELECT id, "institutionId", NOW(), NOW() FROM "ProposalTemplates" WHERE "institutionId" IS NOT NULL`
    );
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("ProposalTemplateInstitutions");
    for (const c of ["waClosing", "waIntro", "firstExempt", "fixedUntilEnd", "hasAdjustment", "hasRegression", "installmentsFixed"]) {
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.removeColumn("ProposalTemplates", c);
    }
  }
};
