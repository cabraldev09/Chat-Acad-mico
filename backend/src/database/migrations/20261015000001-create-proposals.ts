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
const fk = (model: string, onDelete = "SET NULL") => ({
  type: DataTypes.INTEGER,
  allowNull: true,
  references: { model, key: "id" },
  onDelete
});

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("Institutions", {
      ...pk,
      name: { type: DataTypes.STRING, allowNull: false },
      cnpj: { type: DataTypes.STRING, allowNull: true },
      logoFile: { type: DataTypes.STRING, allowNull: true },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      ...ts
    });

    await queryInterface.createTable("ProposalTemplates", {
      ...pk,
      name: { type: DataTypes.STRING, allowNull: false },
      institutionId: fk("Institutions"),
      enrollmentFee: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      dueDay: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 10 },
      installments: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 6 },
      punctualityPct: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 25 },
      lateFee1Pct: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 15 },
      lateFee2Pct: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 25 },
      annualMin: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 5 },
      annualMax: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 11 },
      semestralSchedule: { type: DataTypes.TEXT, allowNull: false },
      bolsaFirst: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      bolsaNext: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      bolsaNote: { type: DataTypes.TEXT, allowNull: true },
      observation: { type: DataTypes.TEXT, allowNull: true },
      disclaimer: { type: DataTypes.TEXT, allowNull: true },
      finalMessage: { type: DataTypes.TEXT, allowNull: true },
      isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      ...ts
    });
    const now = new Date();
    await queryInterface.bulkInsert("ProposalTemplates", [
      {
        name: "Graduação",
        enrollmentFee: 99,
        dueDay: 10,
        installments: 6,
        punctualityPct: 25,
        lateFee1Pct: 15,
        lateFee2Pct: 25,
        annualMin: 5,
        annualMax: 11,
        semestralSchedule: JSON.stringify([
          { from: 2, pct: 2 },
          { from: 6, pct: 3 }
        ]),
        bolsaFirst: 25,
        bolsaNext: 20,
        bolsaNote:
          "Descontos de pontualidade, desconto de ingressante, campanha comercial etc.",
        observation:
          "o desconto de pontualidade já está considerado nos valores com bolsa. O benefício é fixo e não acumulativo.",
        disclaimer:
          "Apresente ao aluno uma faixa de planejamento: 5% é o cenário anual mínimo e 11% é o teto. A projeção é uma estimativa de planejamento, não uma promessa de mensalidade futura.",
        finalMessage: "Proposta exclusiva. Condições válidas na data de hoje.",
        isDefault: true,
        createdAt: now,
        updatedAt: now
      }
    ]);

    await queryInterface.addColumn("Courses", "institutionId", fk("Institutions"));
    await queryInterface.addColumn("Courses", "category", {
      type: DataTypes.STRING,
      allowNull: true
    });
    await queryInterface.addColumn("Courses", "semesters", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 8
    });

    await queryInterface.createTable("Proposals", {
      ...pk,
      token: { type: DataTypes.STRING, allowNull: false, unique: true },
      status: { type: DataTypes.STRING, allowNull: false, defaultValue: "draft" },
      courseName: { type: DataTypes.STRING, allowNull: true },
      grossFee: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      firstMonthly: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      bolsaPct: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
      params: { type: DataTypes.TEXT({ length: "long" }), allowNull: false },
      sentAt: { type: DataTypes.DATE, allowNull: true },
      viewedAt: { type: DataTypes.DATE, allowNull: true },
      leadId: { ...fk("Leads", "CASCADE"), allowNull: false },
      courseId: fk("Courses"),
      templateId: fk("ProposalTemplates"),
      institutionId: fk("Institutions"),
      createdBy: fk("Users"),
      ...ts
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("Proposals");
    await queryInterface.removeColumn("Courses", "semesters");
    await queryInterface.removeColumn("Courses", "category");
    await queryInterface.removeColumn("Courses", "institutionId");
    await queryInterface.dropTable("ProposalTemplates");
    await queryInterface.dropTable("Institutions");
  }
};
