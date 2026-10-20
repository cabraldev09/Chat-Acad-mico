import { QueryInterface } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) => {
    // only the test suites (e2e, CI) use this known account; real installations create the administrator with
    // `scripts/bootstrap-production.js` (ADMIN_EMAIL/ADMIN_PASSWORD, or a random password printed once)
    if (process.env.NODE_ENV !== "test") return Promise.resolve();
    return queryInterface.bulkInsert(
      "Users",
      [
        {
          name: "Administrador",
          email: "admin@whaticket.com",
          passwordHash:
            "$2a$08$WaEmpmFDD/XkDqorkpQ42eUZozOqRCPkPcTkmHHMyuTGUOkI8dHsq",
          profile: "admin",
          tokenVersion: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ],
      {}
    );
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.bulkDelete("Users", {});
  }
};
