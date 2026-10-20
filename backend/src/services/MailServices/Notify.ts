import { isEmail } from "../../helpers/Email";
import { logger } from "../../utils/logger";
import { mailConfigured, sendMail } from "./SendMail";
import type { MailBody } from "./Templates";

// where the links of the e-mails point to: the screen of the system (the first FRONTEND_URL when there are several)
export const frontBase = (): string => String(process.env.FRONTEND_URL || "").split(",")[0].trim().replace(/\/$/, "") || "http://localhost:3000";


// A notice that is a courtesy, never a requirement: it goes out in the background and a failure (or a mail account not
// set up yet) only reaches the log, so the action the person did is never undone by an e-mail problem.
export const notify = (to: string | null | undefined, body: MailBody, what: string): void => {
  const address = String(to || "").trim();
  if (!isEmail(address)) return;
  mailConfigured()
    .then(ok => (ok ? sendMail({ to: address, ...body }) : undefined))
    .catch(err => logger.warn(`${what} mail not sent: ${(err as Error).message}`));
};
