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
const fk = (model: string, onDelete = "SET NULL", allowNull = true) => ({
  type: DataTypes.INTEGER,
  allowNull,
  references: { model, key: "id" },
  onDelete
});

// Default funnel for higher education enrolment
const STAGES = [
  ["Novo lead", "#64748b", "open"],
  ["Primeiro contato", "#0693E3", "open"],
  ["Qualificado", "#6366f1", "open"],
  ["Visita / aula experimental", "#8b5cf6", "open"],
  ["Proposta enviada", "#f59e0b", "open"],
  ["Matrícula em andamento", "#14b8a6", "open"],
  ["Matriculado", "#16a34a", "won"],
  ["Perdido", "#dc2626", "lost"]
];

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("LeadStages", {
      ...pk,
      name: { type: DataTypes.STRING, allowNull: false },
      color: { type: DataTypes.STRING, allowNull: false },
      type: { type: DataTypes.STRING, allowNull: false, defaultValue: "open" },
      position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      ...ts
    });
    const now = new Date();
    await queryInterface.bulkInsert(
      "LeadStages",
      STAGES.map(([name, color, type], i) => ({
        name,
        color,
        type,
        position: i + 1,
        createdAt: now,
        updatedAt: now
      }))
    );

    await queryInterface.createTable("Courses", {
      ...pk,
      name: { type: DataTypes.STRING, allowNull: false },
      level: { type: DataTypes.STRING, allowNull: true },
      modality: { type: DataTypes.STRING, allowNull: true },
      monthlyFee: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      ...ts
    });

    await queryInterface.createTable("Leads", {
      ...pk,
      name: { type: DataTypes.STRING, allowNull: false },
      phone: { type: DataTypes.STRING, allowNull: true },
      email: { type: DataTypes.STRING, allowNull: true },
      city: { type: DataTypes.STRING, allowNull: true },
      state: { type: DataTypes.STRING, allowNull: true },
      modality: { type: DataTypes.STRING, allowNull: true },
      shift: { type: DataTypes.STRING, allowNull: true },
      entryTerm: { type: DataTypes.STRING, allowNull: true },
      educationLevel: { type: DataTypes.STRING, allowNull: true },
      enemScore: { type: DataTypes.INTEGER, allowNull: true },
      financing: { type: DataTypes.STRING, allowNull: true },
      source: { type: DataTypes.STRING, allowNull: true },
      channel: { type: DataTypes.STRING, allowNull: true },
      utmSource: { type: DataTypes.STRING, allowNull: true },
      utmMedium: { type: DataTypes.STRING, allowNull: true },
      utmCampaign: { type: DataTypes.STRING, allowNull: true },
      score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      lostReason: { type: DataTypes.STRING, allowNull: true },
      lostNote: { type: DataTypes.TEXT, allowNull: true },
      wonAt: { type: DataTypes.DATE, allowNull: true },
      lostAt: { type: DataTypes.DATE, allowNull: true },
      firstContactAt: { type: DataTypes.DATE, allowNull: true },
      lastContactAt: { type: DataTypes.DATE, allowNull: true },
      lastInboundAt: { type: DataTypes.DATE, allowNull: true },
      nextFollowUpAt: { type: DataTypes.DATE, allowNull: true },
      consentAt: { type: DataTypes.DATE, allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      courseId: fk("Courses"),
      stageId: fk("LeadStages", "RESTRICT", false),
      ownerId: fk("Users"),
      contactId: fk("Contacts"),
      ...ts
    });
    await queryInterface.addIndex("Leads", ["phone"]);
    await queryInterface.addIndex("Leads", ["email"]);
    await queryInterface.addIndex("Leads", ["stageId"]);
    await queryInterface.addIndex("Leads", ["ownerId"]);

    await queryInterface.createTable("LeadActivities", {
      ...pk,
      type: { type: DataTypes.STRING, allowNull: false },
      body: { type: DataTypes.TEXT, allowNull: true },
      meta: { type: DataTypes.TEXT, allowNull: true },
      leadId: fk("Leads", "CASCADE", false),
      userId: fk("Users"),
      ...ts
    });

    await queryInterface.createTable("LeadTasks", {
      ...pk,
      title: { type: DataTypes.STRING, allowNull: false },
      type: { type: DataTypes.STRING, allowNull: false, defaultValue: "ligar" },
      dueAt: { type: DataTypes.DATE, allowNull: false },
      doneAt: { type: DataTypes.DATE, allowNull: true },
      notifiedAt: { type: DataTypes.DATE, allowNull: true },
      leadId: fk("Leads", "CASCADE", false),
      userId: fk("Users"),
      ...ts
    });

    await queryInterface.createTable("LeadTags", {
      leadId: {
        ...fk("Leads", "CASCADE", false),
        primaryKey: true
      },
      tagId: {
        ...fk("Tags", "CASCADE", false),
        primaryKey: true
      },
      ...ts
    });

    await queryInterface.addColumn("Campaigns", "templateName", {
      type: DataTypes.STRING,
      allowNull: true
    });
    await queryInterface.addColumn("Campaigns", "templateLanguage", {
      type: DataTypes.STRING,
      allowNull: true
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Campaigns", "templateLanguage");
    await queryInterface.removeColumn("Campaigns", "templateName");
    await queryInterface.dropTable("LeadTags");
    await queryInterface.dropTable("LeadTasks");
    await queryInterface.dropTable("LeadActivities");
    await queryInterface.dropTable("Leads");
    await queryInterface.dropTable("Courses");
    await queryInterface.dropTable("LeadStages");
  }
};
