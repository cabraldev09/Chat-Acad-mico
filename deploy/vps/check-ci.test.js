const { test } = require('node:test');
const assert = require('node:assert/strict');
const { approved } = require('./check-ci');
const required = ['verificar', 'api-ponta-a-ponta (canais e conversas)', 'api-ponta-a-ponta (responsabilidade pela conversa)', 'api-ponta-a-ponta (estatísticas e gestão comercial)', 'telas'];
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
