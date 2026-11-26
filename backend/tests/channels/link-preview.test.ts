import { describe, expect, it } from "vitest";

import { linkPreview, parseCard } from "../../src/services/MessageServices/LinkPreview";

describe("prévia de link na conversa", () => {
  it("lê o título, a linha e a imagem da página (og:), com a imagem em endereço completo", () => {
    const html = `<html><head><title>Antigo</title>
      <meta property="og:title" content="Consulta Cadastro &amp; Cursos">
      <meta property="og:description" content="Instituição credenciada no MEC">
      <meta property="og:image" content="/img/capa.png"></head></html>`;
    const card = parseCard(html, "https://emec.mec.gov.br/emec/consulta");
    expect(card).toEqual({ url: "https://emec.mec.gov.br/emec/consulta", title: "Consulta Cadastro & Cursos", description: "Instituição credenciada no MEC", image: "https://emec.mec.gov.br/img/capa.png", site: "emec.mec.gov.br" });
  });
  it("sem og:, usa o <title>; sem título nem imagem, não há cartão", () => {
    expect(parseCard("<title>Página</title>", "https://exemplo.com.br/a")?.title).toBe("Página");
    expect(parseCard("<p>nada</p>", "https://exemplo.com.br/a")).toBe(null);
    expect(parseCard('<meta property="og:title" content="X"><meta property="og:image" content="javascript:alert(1)">', "https://a.com")?.image).toBe(null);
  });
  it("endereço da rede interna ou que não é http não é buscado", async () => {
    expect(await linkPreview("http://127.0.0.1:8080/admin")).toBe(null);
    expect(await linkPreview("http://169.254.169.254/latest/meta-data")).toBe(null);
    expect(await linkPreview("file:///etc/passwd")).toBe(null);
  });
});
