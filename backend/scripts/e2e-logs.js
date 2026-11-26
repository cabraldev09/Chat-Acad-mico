// Keeps the full log of the API of an end-to-end run when the environment asks (E2E_LOG_DIR): the CI uploads it as a file when a run fails,
// so a failure that does not repeat leaves its evidence. The data of the tests are made up. Without E2E_LOG_DIR nothing is written.
const fs = require("fs");
const path = require("path");
module.exports.save = (script, text) => {
  const dir = process.env.E2E_LOG_DIR;
  if (!dir || !text) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${path.basename(script, ".js")}.backend.log`), String(text));
  } catch (error) { /* the evidence is a bonus: never fails the run */ }
};
