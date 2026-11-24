import { QueryInterface, DataTypes } from "sequelize";

// The other names and the short forms people use for a course ("RH", "gestão de pessoas" for "Cst Em Gestão De Recursos Humanos"), written by
// the team, separated by commas. The commercial agent recognises the course by them (CommercialServices/CourseMatch.ts).
module.exports = {
  up: async (q: QueryInterface) => {
    const cols = await q.describeTable("Courses");
    if (!(cols as any).aliases) await q.addColumn("Courses", "aliases", { type: DataTypes.TEXT, allowNull: true });
  },
  down: async (q: QueryInterface) => {
    await q.removeColumn("Courses", "aliases");
  }
};
