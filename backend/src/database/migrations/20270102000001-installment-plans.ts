import { QueryInterface, DataTypes } from "sequelize";

// Proposals in installments (post-graduate, technical and short courses): a fixed number of installments of a fixed value, with no
// semester projection. The course says how long it lasts, how many installments it has, its fees and whether it is paid at once; the
// proposal model says how it is sold (the type, the installments by duration, the certification fee and the ways of payment).
module.exports = {
  up: async (q: QueryInterface) => {
    const course = (await q.describeTable("Courses")) as any;
    const addC = async (name: string, def: any) => { if (!course[name]) await q.addColumn("Courses", name, def); };
    await addC("durationMonths", { type: DataTypes.INTEGER, allowNull: true });
    await addC("installmentsTotal", { type: DataTypes.INTEGER, allowNull: true });
    await addC("enrollmentFee", { type: DataTypes.DECIMAL(10, 2), allowNull: true });
    await addC("certificationFee", { type: DataTypes.DECIMAL(10, 2), allowNull: true });
    await addC("singlePayment", { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });

    const tpl = (await q.describeTable("ProposalTemplates")) as any;
    const addT = async (name: string, def: any) => { if (!tpl[name]) await q.addColumn("ProposalTemplates", name, def); };
    await addT("planType", { type: DataTypes.STRING(20), allowNull: false, defaultValue: "semestral" });
    await addT("installmentsByDuration", { type: DataTypes.TEXT, allowNull: true });
    await addT("certificationFee", { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 });
    await addT("chargeCertification", { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
    await addT("pixDiscountPct", { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 });
    await addT("cardMaxInstallments", { type: DataTypes.INTEGER, allowNull: false, defaultValue: 12 });
    await addT("cardRatePct", { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 });
    await addT("cardPassInterest", { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true });
  },
  down: async (q: QueryInterface) => {
    for (const c of ["durationMonths", "installmentsTotal", "enrollmentFee", "certificationFee", "singlePayment"]) {
      // eslint-disable-next-line no-await-in-loop
      await q.removeColumn("Courses", c);
    }
    for (const c of ["planType", "installmentsByDuration", "certificationFee", "chargeCertification", "pixDiscountPct", "cardMaxInstallments", "cardRatePct", "cardPassInterest"]) {
      // eslint-disable-next-line no-await-in-loop
      await q.removeColumn("ProposalTemplates", c);
    }
  }
};
