import { Request, Response, NextFunction } from "express";

// Minimal hardening headers (the public proposal page and the web chat widget
// are meant to be embedded, so framing is not blocked globally).
const securityHeaders = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // the browser keeps talking to the API over HTTPS only (the proxy tells the original protocol)
  if (req.secure || String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Permissions-Policy", "camera=(), geolocation=(), payment=(), usb=()");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  next();
};

export default securityHeaders;
