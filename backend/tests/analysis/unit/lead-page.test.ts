import { describe, expect, it } from "vitest";
import { renderLeadPage, renderUnavailable } from "../../../src/helpers/LeadPage";

const course = (id: number, name: string, modality = "EAD") => ({ id, name, modality } as any);
const page = (extra: Record<string, any> = {}) =>
  renderLeadPage({ title: "Quero conhecer a instituição", color: "#0B4279", courses: [course(1, "Pedagogia"), course(2, "Enfermagem", "Semipresencial")], nonce: "abc123", baseUrl: "https://api.exemplo.com", ...extra });

describe("the public page of capture", () => {
  it("keeps the contract of the form: the fields the endpoint reads, the honeypot and the consent", () => {
    const html = page();
    ["name", "phone", "courseId", "email", "city", "modality", "admissionType", "website", "consent"].forEach(f => expect(html).toContain(`name="${f}"`));
    expect(html).toContain("/submit");
    expect(html).toContain("utm_source");
    expect(html).toContain('data-course="1"');
  });

  it("runs only its own style and script (nonce) and has no inline style or event attributes", () => {
    const html = page();
    expect(html).toContain('<style nonce="abc123">');
    expect(html).toContain('<script nonce="abc123">');
    expect(html).not.toMatch(/\sstyle="/);
    expect(html).not.toMatch(/\son[a-z]+="/);
  });

  it("escapes what comes from the database and from the affiliate", () => {
    const html = page({ referrer: `<img src=x onerror=alert(1)>`, courses: [course(1, `<script>alert(1)</script>`)] });
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;img src=x");
  });

  it("accepts only a real color, an https privacy link and an absolute preview image", () => {
    const html = page({ color: "red;}</style><script>x</script>", privacyUrl: "javascript:alert(1)" });
    expect(html).toContain("--tint:#0B4279");
    expect(html).not.toContain("javascript:");
    expect(page({ privacyUrl: "https://exemplo.com/privacidade" })).toContain('href="https://exemplo.com/privacidade"');
    expect(html).toContain('content="https://api.exemplo.com/leadform/_og.jpg"');
  });

  it("is a complete document for people and for the preview of a shared link", () => {
    const html = page({ referrer: "Maria" });
    expect(html).toMatch(/<html lang="pt-BR">/);
    expect(html).toContain("<h1");
    expect(html).toContain("Indicação de Maria");
    expect(html).toContain('property="og:title"');
    expect(html).toContain('name="robots" content="noindex,nofollow"');
    expect(html).toContain("prefers-color-scheme: dark");
    expect(html).toContain("prefers-reduced-motion");
    expect(html).not.toMatch(/R\$|\d+ ?% de (bolsa|desconto)/);
  });

  it("answers a link that is not available with the brand, without telling why", () => {
    const html = renderUnavailable("n1", "#0B4279", "Este link não está mais disponível.");
    expect(html).toContain("Link indisponível");
    expect(html).toContain('<style nonce="n1">');
  });
});
