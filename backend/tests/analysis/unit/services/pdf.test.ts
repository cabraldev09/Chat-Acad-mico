import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parsePdf, countPdfPages } from "@/services/pdf/parser";
import { validatePdfBytes, PdfValidationError } from "@/services/pdf/validate";
import { redactPersonalData } from "@/services/pdf/redaction";

const fixture = readFileSync(path.join(__dirname, "../../fixtures/sample-analise.pdf"));

describe("validação de PDF", () => {
  it("aceita PDF válido", async () => {
    await expect(validatePdfBytes(fixture, { maxBytes: 1024 * 1024 })).resolves.toEqual({ ok: true, mimeType: "application/pdf" });
  });
  it("rejeita vazio, grande demais e não-PDF", async () => {
    await expect(validatePdfBytes(Buffer.alloc(0), { maxBytes: 100 })).rejects.toBeInstanceOf(PdfValidationError);
    await expect(validatePdfBytes(fixture, { maxBytes: 10 })).rejects.toMatchObject({ code: "TOO_LARGE" });
    await expect(validatePdfBytes(Buffer.from("PK\x03\x04 fake zip"), { maxBytes: 1000 })).rejects.toMatchObject({ code: "NOT_PDF" });
    const png = Buffer.concat([Buffer.from("%PDF-"), Buffer.from([0x89, 0x50, 0x4e, 0x47])]);
    await expect(validatePdfBytes(png, { maxBytes: 1000 })).resolves.toBeTruthy(); // header manda; file-type não detecta como outro tipo
  });
});

describe("parser pdf.js", () => {
  it("conta páginas e extrai linhas com posições", async () => {
    expect(await countPdfPages(fixture)).toBe(2);
    const parsed = await parsePdf(fixture);
    expect(parsed.pageCount).toBe(2);
    expect(parsed.pages).toHaveLength(2);
    const p1 = parsed.pages[0];
    expect(p1.width).toBeGreaterThan(500);
    const header = p1.lines.find((l) => l.text.includes("DISCIPLINA"));
    expect(header).toBeDefined();
    expect(header!.text).toContain("\t");
    const row = p1.lines.find((l) => l.text.startsWith("ACOMPANHAMENTO DE CARREIRA"));
    expect(row).toBeDefined();
    expect(row!.text.split("\t")).toEqual(["ACOMPANHAMENTO DE CARREIRA", "0", "2", "CONTABILIDADE BASICA"]);
    expect(row!.y).toBeGreaterThan(0);
    expect(parsed.textByPage[1]).toContain("20 disciplinas para adaptar");
  });
});

describe("redação LGPD", () => {
  it("mascara CPF, RG, telefone, e-mail e CEP", () => {
    const out = redactPersonalData("CPF 123.456.789-09 RG 12.345.678-9 tel (11) 91234-5678 mail a@b.com cep 01234-567");
    expect(out).toContain("[CPF]");
    expect(out).toContain("[RG]");
    expect(out).toContain("[TEL]");
    expect(out).toContain("[EMAIL]");
    expect(out).toContain("[CEP]");
    expect(out).not.toContain("123.456.789-09");
  });
});

/** PDF mínimo de uma página. `rotate`: como a matriz do SIAA (/Rotate 90 e texto girado com Tm 0 1 -1 0). */
function buildPdf(items: Array<{ e: number; f: number; text: string }>, opts: { rotate?: boolean } = {}): Buffer {
  const matrix = opts.rotate ? "0 1 -1 0" : "1 0 0 1";
  const stream = items.map((item) => `BT /F1 8 Tf ${matrix} ${item.e} ${item.f} Tm (${item.text}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 ${opts.rotate ? 745 : 842}] ${opts.rotate ? "/Rotate 90 " : ""}/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = Buffer.byteLength(body, "latin1");
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body, "latin1");
}

describe("parser pdf.js: páginas giradas", () => {
  it("lê páginas em paisagem (/Rotate 90) por linhas, como são exibidas", async () => {
    const parsed = await parsePdf(buildPdf([
      { e: 20, f: 5, text: "Serie: 7" },
      { e: 20, f: 200, text: "Grade:" },
      { e: 65, f: 13, text: "12998" },
      { e: 65, f: 48, text: "ESTAGIO SUPERVISIONADO" },
      { e: 65, f: 615, text: "Estagio" },
    ], { rotate: true }));
    const page = parsed.pages[0];
    expect(page.width).toBe(745);
    expect(page.height).toBe(595);
    expect(page.lines.map((line) => line.text)).toEqual(["Serie: 7\tGrade:", "12998\tESTAGIO SUPERVISIONADO\tEstagio"]);
    expect(page.lines[0].y).toBeGreaterThan(page.lines[1].y);
  });
});

describe("cabeçalho da matrícula unificada", () => {
  const labels = [
    { e: 58, f: 740, text: "CAMPUS / UNIDADE" },
    { e: 224, f: 740, text: "CURSO" },
    { e: 390, f: 740, text: "SEMESTRE DE ENTRADA" },
    { e: 58, f: 707, text: "DATA DA ANÁLISE" },
    { e: 224, f: 707, text: "SITUAÇÃO DE INGRESSO" },
    { e: 58, f: 696, text: "02/10/2026" },
    { e: 224, f: 696, text: "Aprovado" },
  ];

  it("lê campus, curso e semestre sem levar junto os rótulos da linha seguinte", async () => {
    const parsed = await parsePdf(buildPdf([...labels, { e: 58, f: 729, text: "CRUZEIRO - GRADUAÇÃO EAD" }, { e: 224, f: 729, text: "PEDAGOGIA (LICENCIATURA)" }, { e: 390, f: 729, text: "4º Semestre" }]));
    expect(parsed.headerFields).toMatchObject({ campus: "CRUZEIRO - GRADUAÇÃO EAD", curso: "PEDAGOGIA (LICENCIATURA)", "semestre de entrada": "4º Semestre" });
  });

  it("campos em branco no SIAA continuam em branco (não viram 'DATA DA ANÁLISE')", async () => {
    const parsed = await parsePdf(buildPdf([...labels, { e: 390, f: 729, text: "º Semestre" }]));
    expect(parsed.headerFields?.campus).toBeUndefined();
    expect(parsed.headerFields?.curso).toBeUndefined();
    expect(parsed.headerFields?.["semestre de entrada"]).toBe("º Semestre");
  });
});
