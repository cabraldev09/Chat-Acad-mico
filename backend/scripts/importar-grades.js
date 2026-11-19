// Publishes every curricular matrix that ships with the system (backend/data/grades), like the "Importar grades padrão" button:
// new ones are created, the existing ones are read again and updated, the unchanged ones are kept. Prints how many of each.
require("/app/backend/dist/database");
const { importDefaultGrades } = require("/app/backend/dist/analysis/Grades");
(async () => {
  const r = await importDefaultGrades();
  console.log(`grades padrão: ${r.created} novas, ${r.updated} atualizadas, ${r.unchanged} sem mudança, ${r.failed.length} com problema`);
  r.failed.slice(0, 20).forEach(f => console.log(`  problema: ${f}`));
  process.exit(0);
})().catch(err => { console.error(err.message || err); process.exit(1); });
