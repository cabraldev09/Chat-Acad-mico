const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { publishDecision, publishDecisionFor, labelFreshness, publishedBase, PUBLISH_LABEL } = require('./check-ci');

const sha = 'a'.repeat(40);
const pull = (extra = {}) => ({ number: 7, merged_at: '2026-11-26T00:00:00Z', merge_commit_sha: sha, base: { ref: 'main' }, labels: [], ...extra });
const withLabel = extra => pull({ labels: [{ name: 'bug' }, { name: PUBLISH_LABEL }], ...extra });

test('sem PR: não publica e explica', () => {
  for (const pulls of [[], null, undefined]) {
    const result = publishDecision(pulls, sha);
    assert.equal(result.ok, false);
    assert.match(result.reason, /aguardando o rótulo publicar/);
  }
});

test('PR mesclado sem o rótulo: não publica e cita o PR', () => {
  const result = publishDecision([pull(), pull({ number: 8, labels: [{ name: 'bug' }] })], sha);
  assert.equal(result.ok, false);
  assert.match(result.reason, /PR #7 não tem o rótulo publicar/);
});

test('PR mesclado com o rótulo: publica', () => {
  const result = publishDecision([withLabel()], sha);
  assert.equal(result.ok, true);
  assert.equal(result.number, 7);
});

test('o rótulo só vale no PR cujo commit de mesclagem é este commit, mesclado na main', () => {
  assert.equal(publishDecision([withLabel({ merged_at: null })], sha).ok, false, 'PR aberto');
  assert.equal(publishDecision([withLabel({ merge_commit_sha: 'b'.repeat(40) })], sha).ok, false, 'PR que só contém o commit');
  assert.equal(publishDecision([withLabel({ base: { ref: 'outra' } })], sha).ok, false, 'PR de outra base');
  assert.equal(publishDecision([withLabel({ base: null })], sha).ok, false);
});

test('rótulo com nome parecido ou ausente não vale', () => {
  assert.equal(publishDecision([pull({ labels: [{ name: 'Publicar' }] })], sha).ok, false);
  assert.equal(publishDecision([pull({ labels: [{ name: 'publicar-depois' }] })], sha).ok, false);
  assert.equal(publishDecision([pull({ labels: undefined })], sha).ok, false);
  assert.equal(publishDecision([pull({ labels: [null] })], sha).ok, false);
});

// ---- a fake of the GitHub API: routes by path; the same one serves the in-process tests and the script (over HTTP)
const BASE = 'b'.repeat(40);
const commitSha = n => String(n).padStart(40, '0');
const T0 = '2026-11-26T10:00:00Z'; // the last commit of every pull request
const T1 = '2026-11-26T11:00:00Z'; // the label, after it
const T_EARLY = '2026-11-26T09:00:00Z'; // the label, before it
// pr(n, {labeled, labeledAt, head}) makes the PR whose merge commit is commitSha(n)
const pr = (n, { labeled = true, labeledAt = T1, headAt = T0 } = {}) => ({
  pull: { number: n, merged_at: T1, merge_commit_sha: commitSha(n), base: { ref: 'main' }, head: { sha: `head${n}`.padEnd(40, 'f') }, labels: labeled ? [{ name: PUBLISH_LABEL }] : [] },
  events: labeled ? [{ event: 'labeled', label: { name: PUBLISH_LABEL }, created_at: labeledAt }] : [],
  headAt,
});
const api = ({ prs = {}, range = null, runs = null, status = 200 }) => async url => {
  const path = String(url).replace(/^https?:\/\/[^/]+/, '').replace(/^\/repos\/[^/]+\/[^/]+\//, '');
  const answer = body => ({ ok: status === 200, status, json: async () => body });
  let m;
  if ((m = path.match(/^commits\/(\w{40})\/pulls/))) { const n = Number(m[1]); const p = prs[n]; return answer(p ? [p.pull] : []); }
  if ((m = path.match(/^issues\/(\d+)\/events/))) return answer(prs[Number(m[1])].events);
  if ((m = path.match(/^commits\/head(\d+)f+$/))) return answer({ commit: { committer: { date: prs[Number(m[1])].headAt } } });
  if (path.startsWith('compare/')) return answer(range);
  if (path.startsWith('actions/workflows/')) return answer(runs && { workflow_runs: runs.map(r => ({ id: r.id, head_sha: r.sha })) });
  if ((m = path.match(/^actions\/runs\/(\d+)\/jobs/))) { const r = runs.find(x => x.id === Number(m[1])); return answer({ jobs: [{ steps: [{ name: 'Atualiza a VPS', conclusion: r.deployed ? 'success' : 'skipped' }] }] }); }
  return { ok: false, status: 404, json: async () => ({}) };
};
const tip = commitSha(5);
const rangeOf = (...ns) => ({ status: 'ahead', total_commits: ns.length, commits: ns.map(n => ({ sha: commitSha(n) })) });
const decide = (cfg, env = { PUBLISHED_SHA: BASE }) => publishDecisionFor(tip, 'dono/repo', api(cfg), env);

test('consulta à API simulada: resposta de erro derruba (não publica por engano)', async () => {
  await assert.rejects(decide({ prs: {}, status: 403 }), /HTTP 403/);
  const ok = await decide({ prs: { 5: pr(5) }, range: rangeOf(5) });
  assert.equal(ok.ok, true);
});

// (B) the label only counts when applied after the last commit of the PR
test('B: rótulo aplicado depois do último commit vale; antes, não', () => {
  const labeled = at => [{ event: 'labeled', label: { name: PUBLISH_LABEL }, created_at: at }];
  assert.equal(labelFreshness(labeled(T1), T0).ok, true);
  assert.equal(labelFreshness(labeled(T0), T0).ok, true);
  assert.equal(labelFreshness(labeled(T_EARLY), T0).ok, false);
  assert.match(labelFreshness(labeled(T_EARLY), T0).why, /antes do último commit/);
  // applied twice: the latest counts (removed and applied again after the push)
  assert.equal(labelFreshness([...labeled(T_EARLY), ...labeled(T1)], T0).ok, true);
  // another label, no event, no date: no
  assert.equal(labelFreshness([{ event: 'labeled', label: { name: 'bug' }, created_at: T1 }], T0).ok, false);
  assert.equal(labelFreshness([], T0).ok, false);
  assert.equal(labelFreshness(undefined, T0).ok, false);
  assert.equal(labelFreshness(labeled(T1), undefined).ok, false);
  assert.equal(labelFreshness([{ event: 'unlabeled', label: { name: PUBLISH_LABEL }, created_at: T1 }], T0).ok, false);
});

test('B: commit empurrado no PR depois do rótulo não é publicado', async () => {
  const stale = await decide({ prs: { 5: pr(5, { labeledAt: T_EARLY }) }, range: rangeOf(5) });
  assert.equal(stale.ok, false);
  assert.match(stale.reason, /PR #5: o rótulo foi aplicado antes do último commit/);
  assert.equal((await decide({ prs: { 5: pr(5) }, range: rangeOf(5) })).ok, true);
});

// (A) publishing takes the whole main: every commit since the version in production needs its own labeled PR
test('A: todos os commits desde a última publicação com rótulo: publica', async () => {
  const r = await decide({ prs: { 3: pr(3), 4: pr(4), 5: pr(5) }, range: rangeOf(3, 4, 5) });
  assert.equal(r.ok, true);
  assert.match(r.reason, /2 commits anteriores/);
});

test('A: um commit anterior sem rótulo bloqueia e diz qual PR', async () => {
  const r = await decide({ prs: { 3: pr(3, { labeled: false }), 4: pr(4), 5: pr(5) }, range: rangeOf(3, 4, 5) });
  assert.equal(r.ok, false);
  assert.match(r.reason, /1 commit\(s\) da main desde a última versão publicada \(bbbbbbb\) sem autorização/);
  assert.match(r.reason, new RegExp(`commit ${commitSha(3).slice(0, 7)}: o PR #3 não tem o rótulo publicar`));
  assert.match(r.reason, /Publicar leva a main inteira/);
});

test('A: commit anterior que não veio de PR (push direto) bloqueia; rótulo antigo também', async () => {
  const direct = await decide({ prs: { 4: pr(4), 5: pr(5) }, range: rangeOf(3, 4, 5) });
  assert.equal(direct.ok, false);
  assert.match(direct.reason, /não veio de um PR mesclado na main/);
  const stale = await decide({ prs: { 3: pr(3, { labeledAt: T_EARLY }), 4: pr(4), 5: pr(5) }, range: rangeOf(3, 4, 5) });
  assert.equal(stale.ok, false);
  assert.match(stale.reason, /PR #3: o rótulo foi aplicado antes/);
});

test('A: sem nada novo desde a última publicação, ou main igual: não bloqueia', async () => {
  assert.equal((await decide({ prs: { 5: pr(5) }, range: { status: 'identical', total_commits: 0, commits: [] } })).ok, true);
  assert.equal((await publishDecisionFor(tip, 'dono/repo', api({ prs: { 5: pr(5) } }), { PUBLISHED_SHA: tip.slice(0, 7) })).ok, true);
});

test('A: base fora do histórico da main, ou intervalo grande demais: falha fechada', async () => {
  await assert.rejects(decide({ prs: { 5: pr(5) }, range: { status: 'diverged', total_commits: 2, commits: [] } }), /não é ancestral/);
  await assert.rejects(decide({ prs: { 5: pr(5) }, range: { status: 'ahead', total_commits: 101, commits: [] } }), /publique por partes/);
});

test('A: a versão publicada vem do ambiente do servidor ou do histórico das publicações', async () => {
  assert.equal(await publishedBase('dono/repo', api({}), { GIT_SHA: 'abc1234' }), 'abc1234');
  assert.equal(await publishedBase('dono/repo', api({}), { PUBLISHED_SHA: BASE, GIT_SHA: 'abc1234' }), BASE);
  // on GitHub: the newest run whose step "Atualiza a VPS" succeeded (runs that only waited are skipped)
  const runs = [{ id: 30, sha: 'c'.repeat(40), deployed: false }, { id: 20, sha: 'd'.repeat(40), deployed: true }, { id: 10, sha: 'e'.repeat(40), deployed: true }];
  assert.equal(await publishedBase('dono/repo', api({ runs }), {}), 'd'.repeat(40));
  await assert.rejects(publishedBase('dono/repo', api({ runs: [{ id: 1, sha: 'c'.repeat(40), deployed: false }] }), {}), /última versão publicada/);
  await assert.rejects(publishedBase('dono/repo', api({ runs: [] }), {}), /última versão publicada/);
  // the whole decision over the history of runs
  const r = await decide({ prs: { 5: pr(5) }, range: rangeOf(5), runs }, {});
  assert.equal(r.ok, true);
});

// the script itself, against the same fake served over HTTP: the exit code is what the workflow reads
const run = (cfg, env = {}) => new Promise((resolve, reject) => {
  const fake = api(cfg);
  const server = http.createServer(async (req, res) => {
    const r = await fake(`http://x${req.url}`);
    res.statusCode = r.status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(await r.json()));
  });
  server.listen(0, '127.0.0.1', () => {
    const child = spawn(process.execPath, [path.join(__dirname, 'check-label.js'), tip], {
      env: { PATH: process.env.PATH, GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`, GITHUB_REPOSITORY: 'dono/repo', PUBLISHED_SHA: BASE, ...env },
    });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    child.on('error', reject);
    child.on('close', code => { server.close(); resolve({ code, out }); });
  });
});

test('script: sem PR = 2; PR sem rótulo = 2; rótulo velho = 2; commit anterior sem rótulo = 2; tudo certo = 0; erro da API = 1', async () => {
  assert.equal((await run({ prs: {}, range: rangeOf(5) })).code, 2);
  const noLabel = await run({ prs: { 5: pr(5, { labeled: false }) }, range: rangeOf(5) });
  assert.equal(noLabel.code, 2);
  assert.match(noLabel.out, /aguardando o rótulo publicar/);
  assert.equal((await run({ prs: { 5: pr(5, { labeledAt: T_EARLY }) }, range: rangeOf(5) })).code, 2);
  const older = await run({ prs: { 3: pr(3, { labeled: false }), 5: pr(5) }, range: rangeOf(3, 5) });
  assert.equal(older.code, 2);
  assert.match(older.out, /PR #3 não tem o rótulo publicar/);
  assert.equal((await run({ prs: { 3: pr(3), 5: pr(5) }, range: rangeOf(3, 5) })).code, 0);
  assert.equal((await run({ prs: {}, status: 500 })).code, 1);
});
