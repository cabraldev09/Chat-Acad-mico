// Keeps the log of the API of an end-to-end run when the environment asks (E2E_LOG_DIR): the CI uploads it as a file when a run fails, so a
// failure that does not repeat leaves its evidence. The repository is public and an artifact can be downloaded by anyone with a GitHub account:
// NOTHING that looks like a login is written. Before saving, redact() removes authorization headers, bearer and API tokens, signed (JWT)
// tokens, cookies (jrt= and any Cookie / Set-Cookie), and the values of fields and parameters named token, secret, password, key or authorization.
// The data of the tests are made up. Without E2E_LOG_DIR nothing is written.
const fs = require("fs");
const path = require("path");

const MASK = "[removido]";
const RULES = [
  // whole header lines: Authorization, Cookie, Set-Cookie, X-Api-Key...
  [/^(\s*["']?(?:authorization|cookie|set-cookie|x-api-key|x-hub-signature(?:-256)?)["']?\s*[:=]\s*).*$/gim, `$1${MASK}`],
  // "Bearer <token>" anywhere
  [/\bBearer\s+[A-Za-z0-9._~+\/=-]+/gi, `Bearer ${MASK}`],
  // the refresh cookie, wherever it appears
  [/\bjrt=[^;\s"']+/gi, `jrt=${MASK}`],
  // signed tokens (header.payload.signature) and the API tokens of the system (wt_ + hex)
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, MASK],
  [/\bwt_[0-9a-f]{16,}\b/gi, MASK],
  // "token": "value" / token: value / token=value (and the same for secret, password, key, apikey, authorization, refresh)
  [/(["']?(?:[A-Za-z_-]*(?:token|secret|password|passwd|apikey|api_key|api-key|authorization|refresh)[A-Za-z_-]*)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&}\]]+)/gi, `$1"${MASK}"`],
  // key=value inside addresses (?token=..., &key=...)
  [/([?&](?:token|access_token|key|secret|password|signature|sig)=)[^&\s"']+/gi, `$1${MASK}`],
];

const redact = (text) => RULES.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), String(text || ""));

const save = (script, text) => {
  const dir = process.env.E2E_LOG_DIR;
  if (!dir || !text) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${path.basename(script, ".js")}.backend.log`), redact(text));
  } catch (error) { /* the evidence is a bonus: never fails the run */ }
};

module.exports = { save, redact, MASK };
