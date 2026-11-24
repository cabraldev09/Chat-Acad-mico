import puppeteer from "puppeteer";
import AppError from "../../errors/AppError";

let browserPromise: Promise<any> | null = null;
let idleTimer: NodeJS.Timeout | null = null;

const getBrowser = () => {
  if (!browserPromise) {
    const executablePath = process.env.CHROME_BIN;
    if (!executablePath) throw new AppError("ERR_PDF_UNAVAILABLE");
    // The first start of Chrome reads it from a cold disk: on a busy server it can pass puppeteer's 30 s default (the proposal PDF
    // then failed with "Timed out ... waiting for the WS endpoint"). It gets 90 s, and a start that timed out is tried once more.
    const launch = () => puppeteer.launch({
      executablePath,
      headless: true,
      timeout: Number(process.env.CHROME_LAUNCH_TIMEOUT_MS) || 90000,
      args: (process.env.CHROME_ARGS || "--no-sandbox --disable-setuid-sandbox").split(" ")
    } as any);
    browserPromise = launch()
      .catch((err: Error) => (err && err.name === "TimeoutError" ? launch() : Promise.reject(err)))
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
