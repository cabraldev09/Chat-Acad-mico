// Read-only: the catalogue of courses as the commercial agent sees it (name, level, format, active, university). No data of a person.
const sequelize = require("/app/backend/dist/database").default;
(async () => {
  const [rows] = await sequelize.query(`SELECT c.id, c.name, c.level, c.modality, c.active, c."institutionId" AS inst FROM "Courses" c ORDER BY c.active DESC, c.name`);
  console.log(`== cursos: ${rows.length} (ativos: ${rows.filter(r => r.active).length}) ==`);
  rows.forEach(r => console.log([r.active ? "ATIVO" : "inativo", r.id, r.name, r.level || "-", r.modality || "-", r.inst || "-"].join(" | ")));
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
