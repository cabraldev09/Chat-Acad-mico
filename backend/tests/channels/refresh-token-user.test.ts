import { describe, expect, it, vi } from "vitest";

// the session renewal (every page reload) must hand the screen the same person the login does: an administrator whose
// stored role is the column default ("consultor") is the administrator, not a consultant (menu, labels and checks read user.role)
const refreshed = vi.fn();
vi.mock("../../src/services/AuthServices/RefreshTokenService", () => ({ RefreshTokenService: (...a: any[]) => refreshed(...a) }));
vi.mock("../../src/services/UserServices/AuthUserService", () => ({ default: vi.fn() }));
vi.mock("../../src/helpers/SendRefreshToken", () => ({ SendRefreshToken: vi.fn(), refreshCookieOptions: {} }));
vi.mock("../../src/libs/socket", () => ({ disconnectUser: vi.fn() }));
vi.mock("../../src/models/User", () => ({ default: {} }));
vi.mock("../../src/utils/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { update } from "../../src/controllers/SessionController";

describe("renovação da sessão: a pessoa devolvida é a mesma do login", () => {
  it("administrador com o papel padrão no banco volta como admin e sem campos internos", async () => {
    const stored = { id: 1, name: "Administrador", email: "a@x.com", profile: "admin", role: "consultor", tokenVersion: 4, whatsappId: null, queues: [], whatsapp: null };
    refreshed.mockResolvedValue({ user: stored, newToken: "t", refreshToken: "r" });
    const json = vi.fn();
    await update({ cookies: { jrt: "x" } } as any, { json } as any);
    const { user } = json.mock.calls[0][0];
    expect(user.role).toBe("admin");
    expect(user.profile).toBe("admin");
    expect(user).not.toHaveProperty("tokenVersion");
  });
});
