import { Request, Response, NextFunction } from "express";

// Minimal hardening headers (the public proposal page and the web chat widget
// are meant to be embedded, so framing is not blocked globally).
const securityHeaders = (
  _req: Request,
  res: Response,
  next: NextFunction
): void => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  next();
};

export default securityHeaders;
