import { Response } from "express";

// Front (Vercel) and API live on different domains in production, so the cookie
// must be SameSite=None; Secure there. Locally (http://localhost) it stays Lax.
export const refreshCookieOptions = () => {
  const crossSite =
    process.env.COOKIE_CROSS_SITE === "true" ||
    (process.env.COOKIE_CROSS_SITE !== "false" &&
      /^https:\/\//.test(process.env.BACKEND_URL || ""));
  return crossSite
    ? { httpOnly: true, secure: true, sameSite: "none" as const }
    : { httpOnly: true, sameSite: "lax" as const };
};

export const SendRefreshToken = (res: Response, token: string): void => {
  res.cookie("jrt", token, refreshCookieOptions());
};
