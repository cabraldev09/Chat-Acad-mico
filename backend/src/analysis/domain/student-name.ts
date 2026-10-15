/** Normaliza o nome do aluno para comparação: espaços colapsados, sem acentos, minúsculas. */
export function normalizeStudentName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Forma canônica para gravar: espaços colapsados, preservando a grafia informada. */
export function cleanStudentName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}
