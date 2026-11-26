const { test } = require('node:test');
const assert = require('node:assert/strict');
const { approved, isCurrentMainSha, mergedPullFor, sameTree } = require('./check-ci');
const required = ['verificar', 'api-ponta-a-ponta (canais e conversas)', 'api-ponta-a-ponta (responsabilidade pela conversa)', 'api-ponta-a-ponta (estatísticas e gestão comercial)', 'api-ponta-a-ponta (fila comum e carteira)', 'telas'];
const good = name => ({ name, status: 'completed', conclusion: 'success' });
test('deploy waits for build/unit and integration jobs', () => {
  assert.equal(approved([]), false);
  assert.equal(approved([good('verificar')]), false);
  assert.equal(approved(required.map(good)), true);
  assert.equal(approved([good('verificar'), { name: required[1], status: 'completed', conclusion: 'failure' }]), false);
  assert.equal(approved([good('verificar'), { name: required[1], status: 'in_progress' }]), false);
});

test('an older successful run does not override a later failure', () => {
  assert.equal(approved([...required.map((name,i) => ({...good(name),id:i+1})), { name: required[1], id: 20, status: 'completed', conclusion: 'failure' }]), false);
});

test('deploy only accepts the current main revision', () => {
  const current = 'a'.repeat(40);
  assert.equal(isCurrentMainSha(current, current), true);
  assert.equal(isCurrentMainSha('b'.repeat(40), current), false);
  assert.equal(isCurrentMainSha(current, 'invalid'), false);
});

test('the green of a pull request counts only for its own squash commit, from this repository, with the same code', () => {
  const sha = 'c'.repeat(40), head = 'd'.repeat(40), repo = 'dono/repo';
  const pull = { number: 7, merged_at: '2026-11-24T00:00:00Z', merge_commit_sha: sha, base: { ref: 'main' }, head: { sha: head, repo: { full_name: repo } } };
  assert.equal(mergedPullFor([pull], sha, repo).number, 7);
  assert.equal(mergedPullFor([{ ...pull, merged_at: null }], sha, repo), null);
  assert.equal(mergedPullFor([{ ...pull, merge_commit_sha: 'e'.repeat(40) }], sha, repo), null);
  assert.equal(mergedPullFor([{ ...pull, base: { ref: 'outra' } }], sha, repo), null);
  assert.equal(mergedPullFor([{ ...pull, head: { sha: head, repo: { full_name: 'fork/repo' } } }], sha, repo), null);
  assert.equal(mergedPullFor([{ ...pull, head: { sha: head, repo: null } }], sha, repo), null);
  assert.equal(mergedPullFor(null, sha, repo), null);
  assert.equal(sameTree('f'.repeat(40), 'f'.repeat(40)), true);
  assert.equal(sameTree('f'.repeat(40), 'a'.repeat(40)), false);
  assert.equal(sameTree(undefined, undefined), false);
});
