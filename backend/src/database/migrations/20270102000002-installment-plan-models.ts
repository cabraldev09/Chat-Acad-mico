import { QueryInterface, QueryTypes } from "sequelize";

// The proposal models asked by the team (25/11/2026), created only when a model with the same name does not exist yet (so a model the
// management already changed is never touched). The fees and the percentages start at zero: the management fills them in.
//  - "Pós-graduação Cruzeiro": in installments, 6 months = 12 installments, 9 months = 15, 12 months = 18;
//  - "SESTED: técnicos e pós": in installments, enrollment and certification fees;
//  - "SESTED: profissionalizante": paid at once (boleto, Pix with a discount, card), the consultant may change it to installments.
const MODELS = [
  { name: "Pós-graduação Cruzeiro", institution: /cruzeiro/i, byDuration: [{ months: 6, installments: 12 }, { months: 9, installments: 15 }, { months: 12, installments: 18 }], certification: false },
  { name: "SESTED: técnicos e pós", institution: /sested|sistema de ensino superior tecnol/i, byDuration: [], certification: true },
  { name: "SESTED: profissionalizante", institution: /sested|sistema de ensino superior tecnol/i, byDuration: [], certification: true }
];

module.exports = {
  up: async (q: QueryInterface) => {
    const db = q.sequelize;
    const institutions = (await db.query(`SELECT id, name FROM "Institutions"`, { type: QueryTypes.SELECT })) as Array<{ id: number; name: string }>;
    for (const m of MODELS) {
      // eslint-disable-next-line no-await-in-loop
      const exists = (await db.query(`SELECT id FROM "ProposalTemplates" WHERE name = :name`, { replacements: { name: m.name }, type: QueryTypes.SELECT })) as any[];
      if (exists.length) continue;
      // eslint-disable-next-line no-await-in-loop
      const [row] = (await db.query(
        `INSERT INTO "ProposalTemplates" (name, "enrollmentFee", "dueDay", installments, "punctualityPct", "lateFee1Pct", "lateFee2Pct", "annualMin", "annualMax",
           "semestralSchedule", "bolsaFirst", "bolsaNext", "isDefault", "hasRegression", "hasAdjustment", "fixedUntilEnd", "firstExempt", active,
           "planType", "installmentsByDuration", "certificationFee", "chargeCertification", "pixDiscountPct", "cardMaxInstallments", "cardRatePct", "cardPassInterest",
           "observation", "createdAt", "updatedAt")
         VALUES (:name, 0, 10, 6, 0, 0, 0, 0, 0, '[]', 0, 0, false, false, false, true, false, true,
           'parcelado', :byDuration, 0, :certification, 0, 12, 0, true,
           'Valor fixo até o fim do curso, sem reajuste.', NOW(), NOW()) RETURNING id`,
        { replacements: { name: m.name, byDuration: JSON.stringify(m.byDuration), certification: m.certification }, type: QueryTypes.SELECT }
      )) as any[];
      const inst = institutions.find(i => m.institution.test(i.name));
      if (row && inst) {
        // eslint-disable-next-line no-await-in-loop
        await db.query(`INSERT INTO "ProposalTemplateInstitutions" ("templateId","institutionId","createdAt","updatedAt") VALUES (:t, :i, NOW(), NOW())`, { replacements: { t: row.id, i: inst.id } });
      }
    }
  },
  down: async () => {
    // models are data of the management: never removed by a rollback
  }
};
