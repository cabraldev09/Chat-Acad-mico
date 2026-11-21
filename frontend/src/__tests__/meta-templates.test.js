import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

const handlers = {};
vi.mock("../services/socket-io", () => ({ default: () => ({ on: (ev, fn) => { handlers[ev] = fn; }, disconnect: () => {} }) }));
vi.mock("../services/api", () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock("../errors/toastError", () => ({ default: vi.fn() }));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), warn: vi.fn() } }));

import api from "../services/api";
import MetaTemplates from "../pages/SettingsHub/MetaTemplates";

describe("Modelos da Meta", () => {
  it("uma atualização automática que falha avisa que a lista pode estar desatualizada", async () => {
    api.get.mockResolvedValueOnce({ data: { templates: [], pack: [], linked: [] } }).mockRejectedValueOnce(new Error("rede"));
    render(<MetaTemplates />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(handlers.metaTemplates).toBeTruthy());
    await act(async () => { handlers.metaTemplates(); });
    await waitFor(() => expect(screen.getByText(/a lista pode estar desatualizada/)).toBeTruthy());
  });
});
