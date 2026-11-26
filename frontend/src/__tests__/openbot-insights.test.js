import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";

vi.mock("../services/api", () => ({ default: { get: vi.fn(), put: vi.fn() } }));
vi.mock("../errors/toastError", () => ({ default: vi.fn() }));
vi.mock("react-toastify", () => ({ toast: { info: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
vi.mock("react-router-dom", () => ({ useHistory: () => ({ push: vi.fn() }), Link: ({ children }) => children }));

import { OpenbotInsights } from "../pages/CommercialCenter";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const item = (over = {}) => ({ id: 1, kind: "indicador", level: "warning", title: "Origem Instagram caiu 40% na semana", body: "Os contatos da origem caíram em relação à semana anterior.", link: "/estatisticas", source: "OpenBot", createdAt: "2026-11-26T15:00:00Z", ...over });

describe("Recomendações do OpenBot (Central Comercial)", () => {
  it("sem recomendações o bloco não aparece", () => {
    const { container } = render(<OpenbotInsights items={[]} onDismiss={vi.fn()} onOpen={vi.fn()} />);
    expect(container.firstChild).toBeNull();
    cleanup();
    const again = render(<OpenbotInsights items={undefined} onDismiss={vi.fn()} onOpen={vi.fn()} />);
    expect(again.container.firstChild).toBeNull();
  });

  it("mostra o título do bloco, a origem OpenBot e a data em cada item", () => {
    render(<OpenbotInsights items={[item(), item({ id: 2, level: "urgent", title: "Mediana da 1ª resposta subiu", link: null })]} onDismiss={vi.fn()} onOpen={vi.fn()} />);
    expect(screen.getByText("Recomendações do OpenBot")).toBeTruthy();
    expect(screen.getAllByText("OpenBot").length).toBe(2);
    expect(screen.getByText("Origem Instagram caiu 40% na semana")).toBeTruthy();
    expect(screen.getAllByText("26/11").length).toBe(2);
    // the link of the first one only
    expect(screen.getAllByText(/Ver detalhe/).length).toBe(1);
  });

  it("o texto é puro: HTML e scripts aparecem como texto, nunca viram elementos", () => {
    const { container } = render(<OpenbotInsights items={[item({ title: "<img src=x onerror=alert(1)>", body: "<script>alert(1)</script><b>negrito</b>" })]} onDismiss={vi.fn()} onOpen={vi.fn()} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
    expect(screen.getByText("<script>alert(1)</script><b>negrito</b>")).toBeTruthy();
  });

  it("Dispensar chama o servidor com o id; Ver detalhe abre o caminho interno", () => {
    const onDismiss = vi.fn();
    const onOpen = vi.fn();
    render(<OpenbotInsights items={[item({ id: 7 })]} onDismiss={onDismiss} onOpen={onOpen} />);
    fireEvent.click(screen.getByText("Dispensar"));
    expect(onDismiss).toHaveBeenCalledWith(7);
    fireEvent.click(screen.getByText(/Ver detalhe/));
    expect(onOpen).toHaveBeenCalledWith("/estatisticas");
  });
});
