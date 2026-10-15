import { vi } from "vitest";

(process.env as Record<string, string>).NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-1234";
process.env.APP_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.APP_ENCRYPTION_KEY_VERSION ??= "1";
process.env.CRON_SECRET ??= "test-cron-secret-123456";

// "server-only" é um marcador do Next; em testes é um módulo vazio.
vi.mock("server-only", () => ({}));
