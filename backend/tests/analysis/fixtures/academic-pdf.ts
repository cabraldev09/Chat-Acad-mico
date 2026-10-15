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

export function selectablePdf(
  lines: Array<[number, number, string]>,
  metadata = "",
) {
  const stream = lines
    .map(
      ([x, y, text]) =>
        `BT /F1 10 Tf ${x} ${y} Td (${text.replace(/[\\()]/g, "\\$&")}) Tj ET`,
    )
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let document = `%PDF-1.4\n% ${metadata}\n`;
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(document));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(document);
  document += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(document);
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
