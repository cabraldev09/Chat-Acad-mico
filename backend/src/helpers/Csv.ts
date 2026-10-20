import { getAppTz } from "./AppTime";
import { Response } from "express";

// CSV for Brazilian spreadsheets: ";" between columns, "\r\n" between lines, a BOM so Excel reads the accents, every cell
// quoted. A text that a spreadsheet would run as a formula (it starts with = + - @ or a control character) gets a leading
// apostrophe, so a name like "=HYPERLINK(...)" typed by a stranger stays text.
const FORMULA = /^[=+\-@\t\r]/;

// a cell already written the way the spreadsheet must read it (only built here, never from typed text)
class CsvRaw {
  constructor(public readonly text: string) {}
}

export const csvCell = (value: unknown): string => {
  if (value instanceof CsvRaw) return value.text;
  if (value === null || value === undefined) return '""';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (FORMULA.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

// a number the spreadsheet must keep as typed (phones, RGM): the long digits would turn into 5,5E+12
export const csvAsText = (digits: string | null | undefined): CsvRaw | string => {
  const d = String(digits ?? "").trim();
  return /^\d+$/.test(d) ? new CsvRaw(`="${d}"`) : d;
};

export const csvRow = (cells: unknown[]): string => cells.map(csvCell).join(";");

export const csvBody = (header: string[], rows: unknown[][]): string => `﻿${[csvRow(header), ...rows.map(csvRow)].join("\r\n")}\r\n`;

export const sendCsv = (res: Response, filename: string, header: string[], rows: unknown[][]): Response => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename.replace(/[^\w.-]+/g, "-")}"`);
  return res.send(csvBody(header, rows));
};

// day as dd/mm/aaaa in the company timezone
export const csvDay = (d: Date | string | null | undefined, tz = getAppTz()): string =>
  d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: tz }) : "";
