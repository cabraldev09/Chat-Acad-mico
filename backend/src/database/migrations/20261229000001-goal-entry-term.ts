import { DataTypes, QueryInterface } from "sequelize";

// The entry term of a polo goal ("2026/2"): an enrollment counts in the semester of the student's entry term, whatever the day it was
// made. Filled from the title of the existing polo goals ("Graduação 2º semestre de 2026" -> "2026/2").
module.exports = {
  up: async (q: QueryInterface) => {
    await q.addColumn("Goals", "entryTerm", { type: DataTypes.STRING(7), allowNull: true });
    await q.sequelize.query(`UPDATE "Goals" SET "entryTerm" = substring(title from '(20[0-9]{2})') || '/' || substring(title from '([12])\\s*[ºo°]?\\s*semestre')
      WHERE kind = 'polo' AND "entryTerm" IS NULL AND title ~* '[12]\\s*[ºo°]?\\s*semestre\\s+de\\s+20[0-9]{2}'`);
  },
  down: async (q: QueryInterface) => {
    await q.removeColumn("Goals", "entryTerm");
  }
};
