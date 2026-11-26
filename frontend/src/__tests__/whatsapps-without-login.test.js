import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";

const get = vi.fn();
const disconnect = vi.fn();
const openSocket = vi.fn(() => ({ on: vi.fn(), disconnect }));
vi.mock("../services/api", () => ({ default: { get: (...a) => get(...a) } }));
vi.mock("../services/socket-io", () => ({ default: (...a) => openSocket(...a) }));
vi.mock("../errors/toastError", () => ({ default: vi.fn() }));

import { AuthContext } from "../context/Auth/AuthContext";
import useWhatsApps from "../hooks/useWhatsApps";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const Probe = ({ onState }) => { const state = useWhatsApps(); onState(state); return null; };
const mount = (isAuth, onState = () => {}) => render(<AuthContext.Provider value={{ isAuth }}><Probe onState={onState} /></AuthContext.Provider>);

describe("conexões do WhatsApp só com login (QA-02: a tela de login não chama rota protegida)", () => {
  it("sem login: nenhuma chamada à API e nenhum socket aberto", async () => {
    let last;
    mount(false, (s) => { last = s; });
    await waitFor(() => expect(last.loading).toBe(false));
    await new Promise((r) => setTimeout(r, 50));
    expect(get).not.toHaveBeenCalled();
    expect(openSocket).not.toHaveBeenCalled();
    expect(last.whatsApps).toEqual([]);
  });

  it("com login: carrega a lista uma vez e abre um socket; ao sair, fecha o socket e esvazia a lista", async () => {
    get.mockResolvedValue({ data: [{ id: 1, name: "Principal", status: "CONNECTED" }] });
    let last;
    const view = mount(true, (s) => { last = s; });
    await waitFor(() => expect(last.whatsApps.length).toBe(1));
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("/whatsapp/");
    expect(openSocket).toHaveBeenCalledTimes(1);
    view.rerender(<AuthContext.Provider value={{ isAuth: false }}><Probe onState={(s) => { last = s; }} /></AuthContext.Provider>);
    await waitFor(() => expect(last.whatsApps).toEqual([]));
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(1);
  });
});
