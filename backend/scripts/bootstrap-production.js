/* eslint-disable */
// Runs on every container start, after the migrations. Idempotent:
//  * administrator: with ADMIN_EMAIL + ADMIN_PASSWORD, that user is created or promoted to admin with that password;
//    without them and with no admin yet, one is created with a random password printed ONCE in the log
//  * makes sure the settings the screens read exist (public sign-up off, API token)
require("dotenv").config();
const crypto = require("crypto");
const { v4: uuid } = require("uuid");

(async () => {
  const sequelize = require("../dist/database").default;
  const User = require("../dist/models/User").default;
  const Setting = require("../dist/models/Setting").default;

  try {
    const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    if (email && process.env.ADMIN_PASSWORD) {
      // ADMIN_EMAIL + ADMIN_PASSWORD are the source of truth: create that administrator, or promote the
      // existing user with this e-mail and set the password (so changing the variables fixes a lost access)
      const found = await User.findOne({ where: { email } });
      if (found) {
        await found.update({ profile: "admin", password: process.env.ADMIN_PASSWORD, tokenVersion: (found.tokenVersion || 0) + 1 });
        console.log(`[início] ${email} é administrador (senha definida por ADMIN_PASSWORD).`);
      } else {
        await User.create({ name: process.env.ADMIN_NAME || "Administrador", email, password: process.env.ADMIN_PASSWORD, profile: "admin" });
        console.log(`[início] Administrador criado: ${email}`);
      }
    } else if (!(await User.count({ where: { profile: "admin" } }))) {
      const adminEmail = email || "admin@whaticket.com";
      const password = crypto.randomBytes(9).toString("base64").replace(/[+/=]/g, "x");
      await User.create({ name: process.env.ADMIN_NAME || "Administrador", email: adminEmail, password, profile: "admin" });
      console.log(`[início] Administrador criado: ${adminEmail}`);
      console.log("[início] ==============================================================");
      console.log(`[início] SENHA INICIAL (aparece só desta vez): ${password}`);
      console.log("[início] Entre e troque a senha em seguida. Para escolher a sua, defina ADMIN_PASSWORD em Variables.");
      console.log("[início] ==============================================================");
    }
    const ensure = async (key, value) => {
      const found = await Setting.findOne({ where: { key } });
      if (!found) await Setting.create({ key, value });
    };
    await ensure("userCreation", "disabled");
    await ensure("userApiToken", uuid());
    // an environment with no courses yet gets the shipped catalogue (never touches an existing one)
    try {
      const { loadCatalogIfEmpty } = require("../dist/services/CrmServices/CatalogLoader");
      const loaded = await loadCatalogIfEmpty();
      if (loaded) console.log(`[início] Catálogo de cursos carregado: ${loaded.created} cursos.`);
    } catch (err) {
      console.error(`[início] Catálogo de cursos não carregado: ${err.message}`);
    }
    await sequelize.close();
    process.exit(0);
  } catch (err) {
    console.error(`[início] Falhou ao preparar o sistema: ${err.message}`);
    process.exit(1);
  }
})();
