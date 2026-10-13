import puppeteer from "puppeteer";
import AppError from "../../errors/AppError";

let browserPromise: Promise<any> | null = null;
let idleTimer: NodeJS.Timeout | null = null;

const getBrowser = () => {
  if (!browserPromise) {
    const executablePath = process.env.CHROME_BIN;
    if (!executablePath) throw new AppError("ERR_PDF_UNAVAILABLE");
    browserPromise = puppeteer
      .launch({
        executablePath,
        headless: true,
        args: (process.env.CHROME_ARGS || "--no-sandbox --disable-setuid-sandbox").split(" ")
      } as any)
      .catch((err: Error) => {
        browserPromise = null;
        throw err;
      });
  }
  return browserPromise;
};

export const renderPdf = async (html: string): Promise<Buffer> => {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", bottom: "10mm", left: "12mm", right: "12mm" }
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
    // keep Chrome warm for bursts of proposals, release it when idle
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(async () => {
      const b = browserPromise;
      browserPromise = null;
      try { (await b)?.close(); } catch (e) { /* already closed */ }
    }, 120000);
  }
};
