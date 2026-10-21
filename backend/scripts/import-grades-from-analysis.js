#!/usr/bin/env node
/* eslint-disable no-console */
// Brings the commercial grades (matrices) of the "Sistema de previsão de análise curricular" into this system.
//
// The PDFs of that system are in a private bucket of its Supabase project, so this script runs with ITS service key, on your computer (or any server
// that can reach Supabase). It writes the PDFs into backend/data/grades, where this system already reads its default matrices: at the next start the
// PDFs that are new or changed are published (a new version of a course updates the matrix on file, unless the team put a newer term there).
//
//   ANALYSIS_SUPABASE_URL=https://xxxx.supabase.co ANALYSIS_SUPABASE_SERVICE_KEY=... node scripts/import-grades-from-analysis.js [--dry-run] [--only-new]
//
// Never commit the key. Nothing here writes to the Supabase of the other system: it only reads.
const fs = require("fs");
const path = require("path");
const { createHash } = require("crypto");

const url = String(process.env.ANALYSIS_SUPABASE_URL || "").replace(/\/+$/, "");
const key = process.env.ANALYSIS_SUPABASE_SERVICE_KEY || "";
const bucket = process.env.ANALYSIS_SUPABASE_BUCKET || "documents";
const dry = process.argv.includes("--dry-run");
const onlyNew = process.argv.includes("--only-new");
const target = process.env.GRADES_TARGET_DIR || path.join(__dirname, "..", "data", "grades");

if (!url || !key) {
  console.error("Defina ANALYSIS_SUPABASE_URL e ANALYSIS_SUPABASE_SERVICE_KEY (a chave de serviço do projeto do sistema de análise).");
  process.exit(1);
}

const headers = { apikey: key, Authorization: `Bearer ${key}` };
const sha = buf => createHash("sha256").update(buf).digest("hex");
// the name that matches "ADMINISTRAÇÃO (BACH P/ EGRESSO)" with "ADMINISTRAÇÃO (BACH P EGRESSO)": no accents, no punctuation
const keyOf = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
const safeName = s => String(s || "grade").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 150);

(async () => {
  const res = await fetch(`${url}/rest/v1/CommercialGrade?select=courseName,modality,curriculumTerm,storageKey,originalName,updatedAt&order=courseName.asc`, { headers });
  if (!res.ok) throw new Error(`Lista das grades: ${res.status} ${await res.text()}`);
  const all = await res.json();
  console.log(`${all.length} grades no sistema de análise.`);

  // A matrix is the file named as the SIAA names it ("CURSO (GRAU).PDF"). Anything else that was uploaded there by mistake (a student's transcript, an ID) is
  // personal data and never comes here. Two rows with the same file name are two versions of one matrix: the most recently updated one wins.
  const PERSONAL = /hist[oó]rico escolar|historico_escolar|boletim|diploma|certid[aã]o|\brg\b|\bcpf\b|identidade|comprovante/i;
  const latest = new Map();
  for (const r of all.sort((a, b) => String(a.updatedAt || "").localeCompare(String(b.updatedAt || "")))) {
    if (PERSONAL.test(r.originalName || "")) { console.log(`ignorada (documento pessoal, não é matriz): ${r.originalName}`); continue; }
    latest.set(keyOf(String(r.originalName || r.courseName).replace(/\.pdf$/i, "")), r);
  }
  const rows = [...latest.values()];
  console.log(`${rows.length} matrizes depois de tirar documentos pessoais e versões repetidas.`);

  fs.mkdirSync(target, { recursive: true });
  // the files already here, by name and by content
  const have = new Map();
  const hashes = new Map();
  for (const f of fs.readdirSync(target)) {
    if (!/\.pdf$/i.test(f)) continue;
    have.set(keyOf(f.replace(/\.pdf$/i, "")), f);
    hashes.set(sha(fs.readFileSync(path.join(target, f))), f);
  }

  const out = { novas: 0, atualizadas: 0, iguais: 0, falhas: [] };
  for (const r of rows) {
    try {
      const file = await fetch(`${url}/storage/v1/object/${bucket}/${r.storageKey}`, { headers });
      if (!file.ok) throw new Error(`download ${file.status}`);
      const bytes = Buffer.from(await file.arrayBuffer());
      if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("não é um PDF");
      const hash = sha(bytes);
      if (hashes.has(hash)) { out.iguais += 1; continue; }
      const existing = have.get(keyOf(String(r.originalName || r.courseName).replace(/\.pdf$/i, "")));
      if (existing && onlyNew) { out.iguais += 1; continue; }
      const name = existing || `${safeName(String(r.originalName || r.courseName).replace(/\.pdf$/i, ""))}.pdf`;
      console.log(`${existing ? "atualiza" : "nova    "}  ${r.courseName}  (vigência ${r.curriculumTerm || "?"})`);
      if (!dry) fs.writeFileSync(path.join(target, name), bytes);
      if (existing) out.atualizadas += 1; else out.novas += 1;
    } catch (err) {
      out.falhas.push(`${r.courseName}: ${err.message}`);
    }
  }
  console.log(`\n${dry ? "(simulação) " : ""}Novas: ${out.novas} · Atualizadas: ${out.atualizadas} · Já iguais: ${out.iguais} · Falhas: ${out.falhas.length}`);
  out.falhas.forEach(f => console.log(`  ! ${f}`));
  if (!dry && (out.novas || out.atualizadas)) console.log("\nFaça o commit dos PDFs de backend/data/grades e suba: na próxima inicialização as grades são publicadas.");
  if (out.falhas.length) process.exit(2);
})().catch(err => { console.error(err.message || err); process.exit(1); });
