const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { publishDecision, publishDecisionFor, PUBLISH_LABEL } = require('./check-ci');

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

test('consulta à API simulada: resposta de erro derruba (não publica por engano)', async () => {
  await assert.rejects(publishDecisionFor(sha, 'dono/repo', async () => ({ ok: false, status: 403 })), /HTTP 403/);
  const ok = await publishDecisionFor(sha, 'dono/repo', async url => {
    assert.match(url, /\/repos\/dono\/repo\/commits\/a{40}\/pulls/);
    return { ok: true, json: async () => [withLabel()] };
  });
  assert.equal(ok.ok, true);
});

// the script itself, against a local fake of the GitHub API: the exit code is what the workflow reads
const run = (body, status = 200) => new Promise((resolve, reject) => {
  const server = http.createServer((req, res) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); });
  server.listen(0, '127.0.0.1', () => {
    const child = spawn(process.execPath, [path.join(__dirname, 'check-label.js'), sha], {
      env: { PATH: process.env.PATH, GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`, GITHUB_REPOSITORY: 'dono/repo' },
    });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    child.on('error', reject);
    child.on('close', code => { server.close(); resolve({ code, out }); });
  });
});

test('script: sem PR = código 2; PR sem rótulo = 2; PR com rótulo = 0; erro da API = 1', async () => {
  assert.equal((await run([])).code, 2);
  const noLabel = await run([pull()]);
  assert.equal(noLabel.code, 2);
  assert.match(noLabel.out, /aguardando o rótulo publicar/);
  assert.equal((await run([withLabel()])).code, 0);
  assert.equal((await run({ message: 'erro' }, 500)).code, 1);
});
