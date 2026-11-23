import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../services/api", () => ({ default: {
  get: vi.fn((path) => Promise.resolve({ data: path === "/institutions"
    ? [{ id: 1, name: "Universidade A", isDefault: true, active: true }, { id: 2, name: "Universidade B", isDefault: false, active: true }]
    : [{ key: "commercial", name: "Agente comercial", commercial: true, description: "Modelo comercial", stages: 1, blocks: 2 }] })),
  post: vi.fn().mockResolvedValue({ data: { agentId: 8, flowId: 9 } })
} }));
vi.mock("../pages/AiAgents/useIntro", () => ({ default: () => "" }));
vi.mock("lucide-react", () => {
  const Icon = () => null;
  return { Check: Icon, ChevronDown: Icon, GraduationCap: Icon, Headphones: Icon, Info: Icon, Pencil: Icon, Bot: Icon, MessageSquare: Icon, Workflow: Icon, X: Icon };
});

import api from "../services/api";
import NewAgentDialog from "../pages/AiAgents/NewAgentDialog";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const selectUniversityB = async () => {
  const selector = await screen.findByRole("button", { name: /Universidade A/ });
  fireEvent.mouseDown(selector);
  fireEvent.click(await screen.findByText("Universidade B"));
};

describe("quick AI agent institution selection", () => {
  it("sends selected university B to from-template while A is the default", async () => {
    render(<NewAgentDialog open onClose={() => {}} onCreated={() => {}} onManual={() => {}} />);
    await selectUniversityB();
    fireEvent.click(screen.getByRole("button", { name: "Criar agente" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/ai-agents/from-template", expect.objectContaining({ institutionId: 2 })));
  });

  it("sends selected university B to generate", async () => {
    render(<NewAgentDialog open onClose={() => {}} onCreated={() => {}} onManual={() => {}} />);
    await selectUniversityB();
    fireEvent.click(screen.getByRole("button", { name: /Outras formas de criar/ }));
    fireEvent.click(screen.getByRole("button", { name: "Descrever para a IA" }));
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "Atendimento de cursos técnicos com agendamento de visita." } });
    fireEvent.click(screen.getByRole("button", { name: "Criar com IA" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/ai-agents/generate", expect.objectContaining({ institutionId: 2 })));
  });
});
