/** Small valid selectable PDF, generated locally; no AI and no personal data. */
export function academicPdf(
  rgm: string,
  status = "A CURSAR",
  metadata = "",
  name = "Aluno Teste Portal",
  course = "Administracao",
) {
  const lines: Array<[number, number, string]> = [
    [30, 780, `Aluno: ${name}`],
    [30, 760, `RGM: ${rgm}`],
    [30, 740, `Curso: ${course}`],
    [30, 720, "Periodo atual: 3"],
    [30, 680, "Codigo"],
    [130, 680, "Disciplina"],
    [300, 680, "Periodo"],
    [390, 680, "Status"],
    [510, 680, "CH"],
    [30, 650, "001"],
    [130, 650, "Matematica"],
    [315, 650, "1"],
    [390, 650, status],
    [510, 650, "40"],
    [30, 620, "002"],
    [130, 620, "Gestao"],
    [315, 620, "3"],
    [390, 620, "CURSANDO"],
    [510, 620, "60"],
    [30, 590, "003"],
    [130, 590, "Economia"],
    [315, 590, "2"],
    [390, 590, "AE"],
    [510, 590, "40"],
  ];
  return selectablePdf(lines, metadata);
}

type PdfLine = [number, number, string] | [number, number, string, number];

export function selectablePdf(
  lines: PdfLine[] | PdfLine[][],
  metadata = "",
) {
  const pages = (Array.isArray(lines[0]?.[0]) ? lines : [lines]) as PdfLine[][];
  const streams = pages.map((page) =>
    page
      .map(
        ([x, y, text, size]) =>
          `BT /F1 ${size ?? 10} Tf ${x} ${y} Td (${text.replace(/[\\()]/g, "\\$&")}) Tj ET`,
      )
      .join("\n"),
  );
  const first = 4;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${first + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...streams.flatMap((stream, i) => [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${first + i * 2 + 1} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    ]),
  ];
  let document = `%PDF-1.4\n% ${metadata}\n`;
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(document));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(document);
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(document);
}

/**
 * The digital history (2026): label above the value, code in its own column, the term as a separator line, the teacher
 * in a smaller line under the name, what is still to come under "Periodo letivo ****". Invented data only.
 */
export function digitalHistoryPdf(rgm: string, official = true) {
  const head = (y: number): PdfLine[] => [
    [60, y, "Codigo", 7.8],
    [100, y, "Disciplina", 7.8],
    [381, y, "Carga horaria", 7.8],
    [447, y, "Media", 7.8],
    [491, y, "Situacao", 7.8],
    [100, y - 11, "Docente - Titulacao", 7.5],
  ];
  const row = (y: number, code: string, name: string, hours: string, grade: string, status: string, teacher = "Professor Teste - Mestrado", second?: string): PdfLine[] => [
    [60, y, code, 8.6],
    [100, y, name, 8.6],
    [401, y, hours, 8.6],
    [454, y, grade, 8.6],
    [488, y, status, 8.6],
    ...(second ? ([[100, y - 10, second, 8.6]] as PdfLine[]) : []),
    [100, y - (second ? 21 : 11), teacher, 7.5],
  ];
  const term = (y: number, value: string): PdfLine[] => [[255, y, `Periodo letivo ${value}`, 8.6]];
  const foot = (page: number): PdfLine[] => [
    [51, 26, `Historico Escolar - Aluno Teste Digital - RGM ${rgm}`, 7],
    [356, 26, `${official ? "Codigo de validacao 221.abc123 - " : ""}Pagina ${page} de 2`, 7],
  ];
  const one: PdfLine[] = [
    ...(official ? ([[203, 739, "Validacao: https://historicodigital.exemplo.edu.br/221.abc123", 7]] as PdfLine[]) : []),
    [206, 692, "Historico Escolar", 22],
    [51, 627, "Nome", 7.5],
    [215, 627, "RGM", 7.5],
    [51, 616, "Aluno Teste Digital", 9.5],
    [215, 616, rgm, 9.5],
    [51, 481, "Curso", 7.5],
    [276, 481, "Codigo e-MEC", 7.5],
    [51, 469, "Servico Social (Bacharelado)", 9.5],
    [276, 469, "1234567", 9.5],
    [51, 386, "Situacao atual", 7.5],
    [51, 374, "Matriculado em disciplina", 9.5],
    [51, 325, "Disciplinas", 12.5],
    ...head(299),
    ...term(263, "2025/2"),
    ...row(244, "101", "Ambientacao Digital", "10", "S", "Aprovado"),
    ...row(212, "102", "Fundamentos do Servico Social: Aspectos Historicos da", "60", "6.5", "Aprovado", "Professor Teste - Mestrado", "Profissao"),
    ...row(170, "103", "Plano de Acompanhamento de Carreira em Servico Social", "10", "S", "Aprovado"),
    ...term(140, "2026/1"),
    ...row(121, "201", "Plano de Acompanhamento de Carreira em Servico Social I", "10", "S", "Aprovado"),
    ...row(89, "202", "Teoria do Estado", "40", "8.0", "Aprovado"),
    ...foot(1),
  ];
  const two: PdfLine[] = [
    ...head(787),
    ...row(754, "203", "Teoria Sociologica", "40", "5.0", "Reprovado"),
    ...term(725, "2026/2"),
    ...row(706, "301", "Lingua Brasileira de Sinais", "40", "-", "Pendente"),
    ...row(674, "301", "Lingua Brasileira de Sinais", "40", "-", "Pendente"),
    ...row(642, "302", "Plano de Acompanhamento de Carreira em Servico Social II", "10", "-", "Pendente"),
    ...term(612, "****"),
    ...row(593, "401", "Legislacao Social", "60", "-", "Pendente", "Nao Informado"),
    ...row(561, "402", "Plano de Acompanhamento de Carreira em Servico Social III", "10", "-", "Pendente", "Nao Informado"),
    ...row(529, "403", "Plano de Acompanhamento de Carreira em Servico Social IV", "10", "-", "Pendente", "Nao Informado"),
    [51, 436, "Atividades complementares", 12.5],
    [60, 409, "Tipo de atividade", 7.8],
    [313, 409, "Carga horaria", 7.8],
    [60, 388, "Ensino, Pesquisa e Extensao", 8.6],
    [336, 388, "3", 8.6],
    [51, 274, "Dados complementares", 12.5],
    [51, 251, "Carga horaria prevista", 7.5],
    [298, 251, "Carga horaria integralizada", 7.5],
    [51, 240, "300 horas", 9.5],
    [298, 240, "120 horas", 9.5],
    [51, 102, "Temas Transversais:", 9.5],
    [51, 90, "Carga Horaria prevista, 40", 9.5],
    [51, 78, "Carga Horaria integralizada, 40", 9.5],
    ...(official
      ? ([
          [65, 60, "A assinatura digital oficial esta aplicada ao arquivo XML, acessado pelo QR Code.", 7],
        ] as PdfLine[])
      : []),
    ...foot(2),
  ];
  return selectablePdf([one, two]);
}

export function academicHistoryPdf(
  rgm: string,
  official = false,
  approved = false,
  metadata = "",
) {
  return selectablePdf(
    [
      [40, 800, "HISTORICO ESCOLAR"],
      [40, 780, `RGM: ${rgm}`],
      [40, 760, "Nome: Aluno Teste Portal"],
      [40, 740, "Curso: Administracao"],
      [40, 700, "Disciplina"],
      [195, 700, "Periodo"],
      [250, 700, "C/Horaria"],
      [306, 700, "Media"],
      [353, 700, "Situacao"],
      [420, 700, "Docente / Titulacao"],
      [40, 670, "001 - Matematica"],
      [205, 670, "2026/2"],
      [264, 670, "40"],
      [310, 670, approved ? "8.5" : "******"],
      [353, 670, approved ? "Aprovado" : "Pendente"],
      [420, 670, "Professor Teste"],
      [40, 640, "002 - Gestao"],
      [205, 640, "2026/2"],
      [264, 640, "60"],
      [310, 640, "******"],
      [353, 640, "Pendente"],
      [420, 640, "Professor Teste"],
      [40, 610, "003 - Economia"],
      [205, 610, "2026/2"],
      [264, 610, "40"],
      [310, 610, "AE"],
      [353, 610, "Aprovado"],
      [420, 610, "Professor Teste"],
      [40, 560, "Dados Complementares"],
      [40, 540, "Carga Horaria Prevista: 140 horas"],
      [40, 520, `Carga Horaria Integralizada: ${approved ? 80 : 40} horas`],
      [
        40,
        490,
        official
          ? "Assinatura eletronica via Certificado Digital"
          : "SIMPLES CONFERENCIA",
      ],
      [
        40,
        470,
        official ? "https://validar.iti.gov.br" : "Somente para conferencia",
      ],
    ],
    metadata,
  );
}
