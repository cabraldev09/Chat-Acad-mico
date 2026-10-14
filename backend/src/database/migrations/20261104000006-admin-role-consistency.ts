import { QueryInterface } from "sequelize";

// An administrator created by the installer kept the default role "consultor" next to profile "admin". Opening and
// saving that person in the user form then wrote role "consultor" back and took the administrator rights away.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(`UPDATE "Users" SET "role" = 'admin' WHERE "profile" = 'admin' AND "role" <> 'admin'`);
  },
  down: async () => undefined
};
