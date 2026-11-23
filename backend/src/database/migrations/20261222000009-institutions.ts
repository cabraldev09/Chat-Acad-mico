import { QueryInterface, DataTypes } from "sequelize";

// One system for the 9 universities of the group: each institution has its brand (name, short name, slug of the public pages, color,
// site, e-mail sender, footer), one of them is the default, and every number, conversation, lead, campaign and AI agent knows its
// university. Polos can serve several (PoloInstitutions); a university can override any setting (InstitutionSettings).
// The data that exists today belongs to the default university (Cruzeiro do Sul Virtual, or the name of Configurações → Geral).
module.exports = {
  up: async (q: QueryInterface) => {
    await q.sequelize.transaction(async transaction => {
      const o = { transaction };
      const col = (type: any, extra: any = {}) => ({ type, allowNull: true, ...extra });
      await q.addColumn("Institutions", "shortName", col(DataTypes.STRING(60)), o);
      await q.addColumn("Institutions", "slug", col(DataTypes.STRING(60)), o);
      await q.addColumn("Institutions", "brandColor", col(DataTypes.STRING(9)), o);
      await q.addColumn("Institutions", "site", col(DataTypes.STRING(200)), o);
      await q.addColumn("Institutions", "mailFromName", col(DataTypes.STRING(120)), o);
      await q.addColumn("Institutions", "mailFrom", col(DataTypes.STRING(200)), o);
      await q.addColumn("Institutions", "footer", col(DataTypes.STRING(400)), o);
      await q.addColumn("Institutions", "isDefault", { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, o);
      await q.addIndex("Institutions", ["slug"], { unique: true, name: "institutions_slug", ...o });
      const ref = { type: DataTypes.INTEGER, allowNull: true, references: { model: "Institutions", key: "id" }, onDelete: "SET NULL", onUpdate: "CASCADE" };
      for (const table of ["Whatsapps", "Tickets", "Leads", "Campaigns", "AiAgents"]) {
        // eslint-disable-next-line no-await-in-loop
        await q.addColumn(table, "institutionId", ref, o);
        // eslint-disable-next-line no-await-in-loop
        await q.addIndex(table, ["institutionId"], { name: `${table.toLowerCase()}_institution_id`, ...o });
      }
      await q.createTable("PoloInstitutions", {
        poloId: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true, references: { model: "Polos", key: "id" }, onDelete: "CASCADE", onUpdate: "CASCADE" },
        institutionId: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true, references: { model: "Institutions", key: "id" }, onDelete: "CASCADE", onUpdate: "CASCADE" },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false }
      }, o);
      await q.createTable("InstitutionSettings", {
        institutionId: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true, references: { model: "Institutions", key: "id" }, onDelete: "CASCADE", onUpdate: "CASCADE" },
        key: { type: DataTypes.STRING(120), allowNull: false, primaryKey: true },
        value: { type: DataTypes.TEXT, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false }
      }, o);

      // the default university: the institution already named like Configurações → Geral, else the first one, else a new one
      const [[setting]]: any = await q.sequelize.query(`SELECT value FROM "Settings" WHERE key = 'institution_name'`, o);
      const name = (setting && setting.value) || "Cruzeiro do Sul Virtual";
      const [[byName]]: any = await q.sequelize.query(`SELECT id FROM "Institutions" WHERE LOWER(name) = LOWER(:name) ORDER BY id LIMIT 1`, { ...o, replacements: { name } });
      const [[first]]: any = await q.sequelize.query(`SELECT id FROM "Institutions" ORDER BY id LIMIT 1`, o);
      let id = (byName || first || {}).id;
      if (!id) {
        const [[created]]: any = await q.sequelize.query(`INSERT INTO "Institutions" (name, active, "createdAt", "updatedAt") VALUES (:name, true, NOW(), NOW()) RETURNING id`, { ...o, replacements: { name } });
        id = created.id;
      }
      await q.sequelize.query(`UPDATE "Institutions" SET "isDefault" = (id = :id)`, { ...o, replacements: { id } });
      // a slug for every institution (the address of its public pages): the name in lowercase, without accents, words joined by "-"
      const [rows]: any = await q.sequelize.query(`SELECT id, name FROM "Institutions" WHERE slug IS NULL`, o);
      const used = new Set<string>();
      for (const r of rows) {
        const base = String(r.name).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || `instituicao-${r.id}`;
        let slug = base;
        for (let i = 2; used.has(slug); i += 1) slug = `${base}-${i}`;
        used.add(slug);
        // eslint-disable-next-line no-await-in-loop
        await q.sequelize.query(`UPDATE "Institutions" SET slug = :slug WHERE id = :id`, { ...o, replacements: { slug, id: r.id } });
      }
      // everything that exists today is of the default university
      for (const table of ["Whatsapps", "Tickets", "Leads", "Campaigns", "AiAgents"]) {
        // eslint-disable-next-line no-await-in-loop
        await q.sequelize.query(`UPDATE "${table}" SET "institutionId" = :id WHERE "institutionId" IS NULL`, { ...o, replacements: { id } });
      }
      await q.sequelize.query(`INSERT INTO "PoloInstitutions" ("poloId", "institutionId", "createdAt", "updatedAt") SELECT id, :id, NOW(), NOW() FROM "Polos" ON CONFLICT DO NOTHING`, { ...o, replacements: { id } });
    });
  },
  down: async (q: QueryInterface) => {
    await q.dropTable("InstitutionSettings");
    await q.dropTable("PoloInstitutions");
    for (const table of ["Whatsapps", "Tickets", "Leads", "Campaigns", "AiAgents"]) {
      // eslint-disable-next-line no-await-in-loop
      await q.removeColumn(table, "institutionId");
    }
    for (const c of ["isDefault", "footer", "mailFrom", "mailFromName", "site", "brandColor", "slug", "shortName"]) {
      // eslint-disable-next-line no-await-in-loop
      await q.removeColumn("Institutions", c);
    }
  }
};
