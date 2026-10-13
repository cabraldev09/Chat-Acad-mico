/* eslint-disable */
// Runs on every container start, after the migrations. Idempotent:
//  * creates the first administrator when the system has none
//    - ADMIN_EMAIL (default admin@whaticket.com) and ADMIN_PASSWORD from the environment;
//      without ADMIN_PASSWORD a random one is generated and printed ONCE in the log
//  * makes sure the settings the screens read exist (public sign-up off, API token)
require("dotenv").config();
const crypto = require("crypto");
const { v4: uuid } = require("uuid");

(async () => {
  const sequelize = require("../dist/database").default;
  const User = require("../dist/models/User").default;
  const Setting = require("../dist/models/Setting").default;

  try {
    const admins = await User.count({ where: { profile: "admin" } });
    if (!admins) {
      const email = (process.env.ADMIN_EMAIL || "admin@whaticket.com").toLowerCase();
      const generated = !process.env.ADMIN_PASSWORD;
      const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString("base64").replace(/[+/=]/g, "x");
      await User.create({ name: "Administrador", email, password, profile: "admin" });
      console.log(`[início] Administrador criado: ${email}`);
      if (generated) {
        console.log("[início] ==============================================================");
        console.log(`[início] SENHA INICIAL (aparece só desta vez): ${password}`);
        console.log("[início] Entre e troque a senha em seguida. Para escolher a sua, defina ADMIN_PASSWORD em Variables.");
        console.log("[início] ==============================================================");
      }
    }
    const ensure = async (key, value) => {
      const found = await Setting.findOne({ where: { key } });
      if (!found) await Setting.create({ key, value });
    };
    await ensure("userCreation", "disabled");
    await ensure("userApiToken", uuid());
    await sequelize.close();
    process.exit(0);
  } catch (err) {
    console.error(`[início] Falhou ao preparar o sistema: ${err.message}`);
    process.exit(1);
  }
})();
