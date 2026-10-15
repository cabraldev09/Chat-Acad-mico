if (
  process.env.NODE_ENV === "production" &&
  (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET)
) {
  throw new Error("JWT_SECRET and JWT_REFRESH_SECRET must be set in production");
}

export default {
  secret: process.env.JWT_SECRET || "mysecret",
  expiresIn: "15m" as const,
  refreshSecret: process.env.JWT_REFRESH_SECRET || "myanothersecret",
  refreshExpiresIn: "7d" as const
};
