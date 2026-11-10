import { csvCell as safeCell } from "../helpers/Csv";
import { Request, Response } from "express";
import { QueryTypes } from "sequelize";

import sequelize from "../database";
import AppError from "../errors/AppError";
import { dayBounds, shiftDays } from "../helpers/AppTime";
import { getBusinessConfig, businessMinutes } from "../helpers/BusinessTime";
import { portable, nowSql, diffHours, countIf } from "../helpers/sqlDialect";
import { reqRole } from "../middleware/scope";

const q = async (sql: string, replacements: Record<string, any>): Promise<any[]> =>
  (await sequelize.query(portable(sql), { replacements, type: QueryTypes.SELECT })) as any[];

interface Row {
  name: string;
  leads: number;
  contacted: number;
  noContact: number;
  open: number;
  won: number;
  lost: number;
  conversion: number;
  avgFirstContactMin: number | null;
  avgDaysToEnroll: number | null;
  overdueTasks: number;
}

const COLUMNS: Array<{ key: keyof Row; label: string; kind: "text" | "int" | "pct" | "min" | "dec" }> = [
  { key: "name", label: "Nome", kind: "text" },
  { key: "leads", label: "Leads captados", kind: "int" },
  { key: "contacted", label: "Contatados", kind: "int" },
  { key: "noContact", label: "Sem contato", kind: "int" },
  { key: "open", label: "Em andamento", kind: "int" },
  { key: "won", label: "Matrículas", kind: "int" },
  { key: "lost", label: "Perdidos", kind: "int" },
  { key: "conversion", label: "Conversão (%)", kind: "pct" },
  { key: "avgFirstContactMin", label: "Tempo até o 1º contato (min)", kind: "min" },
  { key: "avgDaysToEnroll", label: "Dias até a matrícula", kind: "dec" },
  { key: "overdueTasks", label: "Tarefas atrasadas", kind: "int" }
];

const csvCell = (value: unknown, kind: string): string => {
  if (value === null || value === undefined) return "";
  // a name typed by a stranger that starts with = + - @ would run as a formula in the spreadsheet: it gets the apostrophe of helpers/Csv
  if (kind === "text") return safeCell(value);
  // Brazilian spreadsheets use the comma as the decimal separator
  if (kind === "int") return String(Math.round(Number(value)));
  return Number(value).toFixed(1).replace(".", ",");
};

// Report by consultant or by polo, for the chosen period. JSON for the screen, CSV (opens in Excel) to download.
export const crmReport = async (req: Request, res: Response): Promise<Response> => {
  const groupBy = req.query.groupBy === "polo" ? "polo" : "owner";
  // the sales numbers belong to the sales side and the management: tutoring, the academic team and relationship stay out
  if (!["admin", "coordenacao", "consultor"].includes(reqRole(req))) throw new AppError("ERR_NO_PERMISSION", 403);

  const to = dayBounds(req.query.to ? String(req.query.to) : undefined).end;
  const from = req.query.from ? dayBounds(String(req.query.from)).start : dayBounds(shiftDays(new Date(), -29)).start;
  // consultants only ever see their own numbers
  const ownerOnly = reqRole(req) === "consultor" ? Number(req.user.id) : null;
  const rep = { from, to, ownerOnly };
  const f = `AND l.isHistorical = false AND l.createdAt BETWEEN :from AND :to AND (:ownerOnly IS NULL OR l.ownerId = :ownerOnly)`;

  const key = groupBy === "polo" ? "p.id" : "u.id";
  const join = groupBy === "polo" ? "LEFT JOIN Polos p ON p.id = l.poloId" : "LEFT JOIN Users u ON u.id = l.ownerId";
  const label = groupBy === "polo" ? "COALESCE(p.name, 'Sem polo')" : "COALESCE(u.name, 'Sem responsável')";

  const groups = await q(
    `SELECT ${key} AS gid, ${label} AS name, COUNT(*) AS leads,
       ${countIf("l.firstContactAt IS NOT NULL")} AS contacted,
       ${countIf("s.type='open'")} AS open, ${countIf("s.type='won'")} AS won, ${countIf("s.type='lost'")} AS lost,
       AVG(CASE WHEN l.wonAt IS NOT NULL THEN ${diffHours("l.createdAt", "l.wonAt")}/24 END) AS avgDaysToEnroll
     FROM Leads l JOIN LeadStages s ON s.id = l.stageId ${join}
     WHERE 1=1 ${f}
     GROUP BY ${key}, ${label} ORDER BY leads DESC`,
    rep
  );

  const contactedRows = await q(
    `SELECT ${key} AS gid, l.createdAt AS c, l.firstContactAt AS fc
     FROM Leads l ${join}
     WHERE l.firstContactAt IS NOT NULL ${f} LIMIT 50000`,
    rep
  );
  const overdue = await q(
    `SELECT ${key} AS gid, COUNT(*) AS total
     FROM LeadTasks t JOIN Leads l ON l.id = t.leadId ${join}
     WHERE t.doneAt IS NULL AND t.dueAt < ${nowSql()} AND l.isHistorical = false
       AND (:ownerOnly IS NULL OR l.ownerId = :ownerOnly)
     GROUP BY ${key}`,
    rep
  );

  const business = await getBusinessConfig();
  const acc: Record<string, { s: number; n: number }> = {};
  contactedRows.forEach(r => {
    const k = String(r.gid ?? "none");
    acc[k] = { s: (acc[k]?.s || 0) + businessMinutes(business, new Date(r.c), new Date(r.fc)), n: (acc[k]?.n || 0) + 1 };
  });
  const lateBy: Record<string, number> = {};
  overdue.forEach(r => {
    lateBy[String(r.gid ?? "none")] = Number(r.total);
  });

  const rows: Row[] = groups.map(g => {
    const k = String(g.gid ?? "none");
    const leads = Number(g.leads);
    const won = Number(g.won);
    return {
      name: g.name,
      leads,
      contacted: Number(g.contacted),
      noContact: leads - Number(g.contacted),
      open: Number(g.open),
      won,
      lost: Number(g.lost),
      conversion: leads ? (won / leads) * 100 : 0,
      avgFirstContactMin: acc[k] ? acc[k].s / acc[k].n : null,
      avgDaysToEnroll: g.avgDaysToEnroll === null || g.avgDaysToEnroll === undefined ? null : Number(g.avgDaysToEnroll),
      overdueTasks: lateBy[k] || 0
    };
  });

  const sum = (pick: (r: Row) => number) => rows.reduce((a, r) => a + pick(r), 0);
  const allContacted = Object.values(acc).reduce((a, v) => a + v.n, 0);
  const total: Row = {
    name: "Total",
    leads: sum(r => r.leads),
    contacted: sum(r => r.contacted),
    noContact: sum(r => r.noContact),
    open: sum(r => r.open),
    won: sum(r => r.won),
    lost: sum(r => r.lost),
    conversion: sum(r => r.leads) ? (sum(r => r.won) / sum(r => r.leads)) * 100 : 0,
    avgFirstContactMin: allContacted ? Object.values(acc).reduce((a, v) => a + v.s, 0) / allContacted : null,
    avgDaysToEnroll: null,
    overdueTasks: sum(r => r.overdueTasks)
  };

  if (req.query.format === "csv") {
    const head = COLUMNS.map(c => `"${c.label}"`).join(";");
    const lines = [...rows, total].map(r => COLUMNS.map(c => csvCell(r[c.key], c.kind)).join(";"));
    const day = (d: Date) => d.toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="relatorio-${groupBy === "polo" ? "polos" : "consultores"}-${day(from)}-a-${day(to)}.csv"`);
    // BOM so Excel reads the accents correctly
    return res.send(`﻿${[head, ...lines].join("\r\n")}\r\n`);
  }

  return res.json({
    range: { from, to },
    groupBy,
    businessHours: business.enabled,
    columns: COLUMNS,
    rows,
    total
  });
};
