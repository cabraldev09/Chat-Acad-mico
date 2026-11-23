import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../services/api", () => ({ default: { post: vi.fn() } }));
vi.mock("../components/charts", () => ({ useChartTheme: () => ({}) }));
vi.mock("../components/ui", () => ({
  ErrorState: ({ title: titulo, onRetry }) => <div role="alert">{titulo}<button type="button" onClick={onRetry}>Tentar de novo</button></div>
}));
vi.mock("lucide-react", () => {
  const Icon = () => null;
  return { AlertTriangle: Icon, Building2: Icon, CheckCircle2: Icon, Gauge: Icon, MapPin: Icon, RefreshCw: Icon, Sparkles: Icon, Users: Icon };
});
vi.mock("recharts", () => {
  const ChartPart = () => null;
  return { Bar: ChartPart, BarChart: ChartPart, CartesianGrid: ChartPart, Cell: ChartPart, ReferenceLine: ChartPart, ResponsiveContainer: ChartPart, Tooltip: ChartPart, XAxis: ChartPart, YAxis: ChartPart };
});
vi.mock("../pages/Reports/shared", () => ({ useShared: () => ({ panel: "painel", title: "titulo", sub: "resumo", stack: "pilha" }), Insights: () => null, SlaBar: () => null, hm: value => String(value) }));

import api from "../services/api";
import { ManagementFeedback } from "../pages/Reports/Management";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("feedback gerencial por polo", () => {
  it("mostra os dados agregados recebidos do backend", async () => {
    api.post.mockResolvedValueOnce({ data: {
      period: { days: 7 }, minimumSample: 5,
      source: { generatedAt: new Date(Date.now() - 600000).toISOString(), cacheSeconds: 300 },
      base: [{ poloId: 4, polo: "Polo Norte", attendances: 7, receivedMessages: 12, enrollments: 2, unansweredNow: 1 }],
      summary: "Resultado de teste.", strengths: ["Boa resposta"],
      risks: [{ poloId: 4, polo: "Polo Norte", issue: "Fila acumulada", evidence: "7 atendimentos; 1 sem resposta", action: "Revisar amanhã" }],
      nextActions: ["Acompanhar a fila"], caveats: []
    } });

    render(<ManagementFeedback days={7} />);
    fireEvent.click(screen.getByRole("button", { name: "Gerar feedback com IA" }));

    expect(await screen.findByText(/Resultado de teste\./)).toBeTruthy();
    expect(screen.getByText("Polo Norte")).toBeTruthy();
    expect(screen.getByText(/7 atendimentos; 1 sem resposta/)).toBeTruthy();
    expect(screen.getByText(/Revisar amanhã/)).toBeTruthy();
    expect(api.post).toHaveBeenCalledWith("/dashboard/management/feedback", { days: 7 });
  });

  it("mostra erro e permite tentar novamente", async () => {
    api.post.mockRejectedValueOnce(new Error("rede")).mockResolvedValueOnce({ data: {
      period: { days: 1 }, summary: "Recuperado.", risks: [], strengths: [], nextActions: [], caveats: [],
      source: { generatedAt: new Date(Date.now() - 600000).toISOString(), cacheSeconds: 300 }, base: []
    } });

    render(<ManagementFeedback days={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Gerar feedback com IA" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(screen.getByText("Recuperado.")).toBeTruthy());
    expect(api.post).toHaveBeenCalledTimes(2);
  });
});
