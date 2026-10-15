/**
 * Minimização de dados pessoais (LGPD): mascara CPF, RG, telefone, e-mail e CEP
 * no texto extraído antes de enviá-lo à IA no modo REDACTED_TEXT.
 */
const PATTERNS: Array<[RegExp, string]> = [
  [/(cpf[a-z]*)=\d+/gi, "$1=[CPF]"],
  [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF]"],
  [/\b\d{1,2}\.?\d{3}\.?\d{3}-?[\dXx]\b/g, "[RG]"],
  [/\(?\b\d{2}\)?\s?9?\d{4}-?\d{4}\b/g, "[TEL]"],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[EMAIL]"],
  [/\b\d{5}-?\d{3}\b/g, "[CEP]"],
];

export function redactPersonalData(text: string): string {
  return PATTERNS.reduce((acc, [re, rep]) => acc.replace(re, rep), text);
}
