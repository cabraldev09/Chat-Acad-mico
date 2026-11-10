import { describe, expect, it } from "vitest";
import nodemailer from "nodemailer";

import { MAIL_CATALOG } from "../../../src/services/MailServices/Templates";
import { LOGO_CID, inlineLogoForScreen, logoAttachments } from "../../../src/services/MailServices/Logo";

// Every e-mail the system sends carries the brand logo inside the message (an inline attachment the HTML points to),
// never as a separate file to open.
describe("logo nos e-mails", () => {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });

  it.each(MAIL_CATALOG.map(m => [m.key, m] as const))("%s leva o logo embutido e nenhum PDF", async (_key, m) => {
    const body = m.build();
    expect(body.html).toContain(`cid:${LOGO_CID}`);
    const info: any = await transport.sendMail({ from: "a@b.c", to: "x@y.z", subject: body.subject, text: body.text, html: body.html, attachments: logoAttachments(body.html) });
    const raw = String(info.message).replace(/=\r?\n/g, "");
    expect(raw).toContain(`Content-ID: <${LOGO_CID}>`);
    expect(raw).toMatch(/Content-Disposition: inline/i);
    expect(raw).toMatch(/Content-Type: image\/png/);
    expect(raw).not.toMatch(/application\/pdf/i);
  });

  it("a prévia na tela mostra o logo como imagem embutida", () => {
    const html = inlineLogoForScreen(MAIL_CATALOG[0].build().html);
    expect(html).toContain("data:image/png;base64,");
    expect(html).not.toContain("cid:");
  });
});
