import { describe, expect, it, vi, beforeEach } from "vitest";
import { sign } from "jsonwebtoken";

const showUser = vi.fn();
vi.mock("../../src/services/UserServices/ShowUserService", () => ({ default: (...a: any[]) => showUser(...a) }));
vi.mock("../../src/utils/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import AppError from "../../src/errors/AppError";
import authConfig from "../../src/config/auth";
import { RefreshTokenService } from "../../src/services/AuthServices/RefreshTokenService";

const res = () => ({ clearCookie: vi.fn() }) as any;
const refresh = (payload: object, secret = authConfig.refreshSecret, opts: object = { expiresIn: "7d" }) => sign(payload, secret, opts as any);
const user = { id: 3, name: "Pessoa", tokenVersion: 2, profile: "user", role: "consultor" };

beforeEach(() => showUser.mockReset());

describe("renovação da sessão: só login perdido de verdade vira 401", () => {
  it("renova e gira os tokens quando tudo confere (duas renovações com o mesmo cookie dão certo)", async () => {
    showUser.mockResolvedValue(user);
    const token = refresh({ id: 3, tokenVersion: 2 });
    const [a, b] = await Promise.all([RefreshTokenService(res(), token), RefreshTokenService(res(), token)]);
    expect(a.newToken).toBeTruthy();
    expect(b.newToken).toBeTruthy();
  });

  it("token inválido, de outra chave ou vencido: 401 e o cookie é apagado", async () => {
    for (const token of ["lixo", refresh({ id: 3, tokenVersion: 2 }, "outra-chave"), refresh({ id: 3, tokenVersion: 2 }, authConfig.refreshSecret, { expiresIn: -10 })]) {
      const r = res();
      await expect(RefreshTokenService(r, token)).rejects.toMatchObject({ message: "ERR_SESSION_EXPIRED", statusCode: 401 });
      expect(r.clearCookie).toHaveBeenCalledWith("jrt", expect.anything());
    }
  });

  it("versão diferente (saída em outro lugar) ou pessoa removida: 401 e o cookie é apagado", async () => {
    showUser.mockResolvedValueOnce({ ...user, tokenVersion: 3 });
    const r1 = res();
    await expect(RefreshTokenService(r1, refresh({ id: 3, tokenVersion: 2 }))).rejects.toMatchObject({ statusCode: 401 });
    expect(r1.clearCookie).toHaveBeenCalled();
    showUser.mockRejectedValueOnce(new AppError("ERR_NO_USER_FOUND", 404));
    const r2 = res();
    await expect(RefreshTokenService(r2, refresh({ id: 3, tokenVersion: 2 }))).rejects.toMatchObject({ statusCode: 401 });
    expect(r2.clearCookie).toHaveBeenCalled();
  });

  it("falha do momento (banco fora do ar) NÃO derruba a sessão: o erro sobe como está e o cookie fica", async () => {
    showUser.mockRejectedValueOnce(new Error("connection terminated unexpectedly"));
    const r = res();
    const error: any = await RefreshTokenService(r, refresh({ id: 3, tokenVersion: 2 })).catch(e => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AppError);
    expect(error.message).toMatch(/connection terminated/);
    expect(r.clearCookie).not.toHaveBeenCalled();
  });
});
