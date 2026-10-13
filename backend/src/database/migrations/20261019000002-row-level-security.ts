import { QueryInterface } from "sequelize";

// Supabase exposes public tables over its REST API: close them (see helpers/EnsureRls.ts).
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const sequelize: any = queryInterface.sequelize;
    if (sequelize.getDialect() !== "postgres") return;
    await sequelize.query(`
      DO $$
      DECLARE r record;
      BEGIN
        FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
          EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
        END LOOP;
      END $$;
    `);
  },
  down: async () => undefined
};
