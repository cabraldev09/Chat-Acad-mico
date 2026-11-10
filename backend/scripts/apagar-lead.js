// Deletes the leads of one phone number whose name starts with the given name (a test or a mistake), like an administrator does in the
// CRM: never a student, a won lead or a lead with a paid charge. The open flow runs of that contact end, so its next message starts over.
const sequelize = require("/app/backend/dist/database").default;
const digits = String(process.env.NUMERO || "").replace(/\D/g, "");
const name = String(process.env.NOME || "").trim();
const variants = () => {
  const out = new Set([digits]);
  if (/^55\d{2}9\d{8}$/.test(digits)) out.add(digits.slice(0, 4) + digits.slice(5));
  if (/^55\d{2}[6-9]\d{7}$/.test(digits)) out.add(`${digits.slice(0, 4)}9${digits.slice(4)}`);
  return [...out];
};
(async () => {
  if (digits.length < 10 || name.length < 3) throw new Error("informe o número completo e o nome (3 letras ou mais)");
  const nums = variants();
  const [contacts] = await sequelize.query(`SELECT id, name, number FROM "Contacts" WHERE number IN (:nums)`, { replacements: { nums } });
  const ids = contacts.map(c => c.id);
  console.log("contatos com esse número:", JSON.stringify(contacts));
  const [leads] = await sequelize.query(
    `SELECT l.id, l.name, l.phone, l."contactId", l."enrolledAt", l."wonAt", (SELECT COUNT(*) FROM "Payments" p WHERE p."leadId" = l.id AND p.status = 'paid') AS pagos
       FROM "Leads" l
      WHERE l.name ILIKE :name AND (l."contactId" IN (:ids) OR regexp_replace(COALESCE(l.phone, ''), '\\D', '', 'g') IN (:nums))`,
    { replacements: { name: `${name}%`, ids: ids.length ? ids : [0], nums } }
  );
  console.log("leads encontrados:", JSON.stringify(leads));
  if (!leads.length) return console.log("nada para apagar");
  if (leads.length > 3) throw new Error("mais de 3 leads encontrados: nada foi apagado");
  const blocked = leads.filter(l => l.enrolledAt || l.wonAt || Number(l.pagos) > 0);
  if (blocked.length) throw new Error(`aluno, matrícula ganha ou pagamento: nada foi apagado (${blocked.map(l => l.id).join(", ")})`);
  await sequelize.transaction(async transaction => {
    await sequelize.query(`DELETE FROM "Leads" WHERE id IN (:ids)`, { replacements: { ids: leads.map(l => l.id) }, transaction });
    if (ids.length)
      await sequelize.query(
        `UPDATE "ChatFlowRuns" SET status = 'done', "resumeAt" = NULL WHERE status IN ('waiting', 'delayed') AND "ticketId" IN (SELECT id FROM "Tickets" WHERE "contactId" IN (:ids))`,
        { replacements: { ids }, transaction }
      );
  });
  console.log(`apagado(s): ${leads.map(l => `#${l.id} ${l.name}`).join(", ")}; roteiros em andamento desse contato encerrados`);
})()
  .catch(err => {
    console.error(`::error::${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
