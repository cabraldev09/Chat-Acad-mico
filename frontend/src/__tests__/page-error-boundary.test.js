import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("../utils/errorReporting", () => ({ newErrorCode: () => "ABCDE", reportClientError: vi.fn() }));
vi.mock("../utils/versionWatch", () => ({ checkVersion: () => Promise.resolve(false) }));

import PageErrorBoundary from "../components/PageErrorBoundary";

const Boom = ({ message }) => { throw new Error(message); };

afterEach(() => { cleanup(); sessionStorage.clear(); vi.restoreAllMocks(); });

describe("tela que falha ao abrir", () => {
  it("durante a publicação de uma versão nova, espera e carrega sozinha, sem mostrar erro", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const timer = vi.spyOn(window, "setTimeout").mockImplementation(() => 0);
    render(<PageErrorBoundary><Boom message="Failed to fetch dynamically imported module: /assets/index-x.js" /></PageErrorBoundary>);
    expect(screen.getByRole("status").textContent).toContain("Carregando a versão nova do sistema");
    expect(timer).toHaveBeenCalled();
  });
  it("depois de 3 tentativas, ou em outro erro, mostra o erro com o código e os botões", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(window, "setTimeout").mockImplementation(() => 0);
    const now = Date.now();
    sessionStorage.setItem("chunk-retries", JSON.stringify([now, now, now]));
    render(<PageErrorBoundary><Boom message="Failed to fetch dynamically imported module: /assets/index-x.js" /></PageErrorBoundary>);
    expect(screen.getByText("Não foi possível abrir esta tela")).toBeTruthy();
    cleanup();
    render(<PageErrorBoundary><Boom message="x is undefined" /></PageErrorBoundary>);
    expect(screen.getByText(/Código do erro: ABCDE/)).toBeTruthy();
  });
});
