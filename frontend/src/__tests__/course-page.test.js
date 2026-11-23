import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("axios", () => ({ default: { create: () => client } }));

import CoursePage from "../pages/CoursePage";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("CoursePage", () => {
  it("mostra carregamento e permite tentar de novo após falha", async () => {
    client.get.mockRejectedValueOnce(new Error("rede")).mockResolvedValueOnce({
      data: { course: { name: "Administração", category: "Graduação", modality: "EAD" }, thanks: "Em breve." }
    });
    render(<CoursePage match={{ params: { slug: "administracao" } }} />);

    expect(screen.getByRole("status").textContent).toContain("Carregando");
    await screen.findByRole("heading", { name: "Não conseguimos abrir agora" });
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await screen.findByRole("heading", { name: "Administração" });
    expect(client.get).toHaveBeenCalledTimes(2);
    expect(client.get).toHaveBeenLastCalledWith("/public/courses/administracao", { timeout: 15000 });
  });
});
