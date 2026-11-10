const { test } = require('node:test');
const assert = require('node:assert/strict');
const { approved } = require('./check-ci');
const good = name => ({ name, status: 'completed', conclusion: 'success' });
test('deploy waits for build/unit and integration jobs', () => {
  assert.equal(approved([]), false);
  assert.equal(approved([good('verificar')]), false);
  assert.equal(approved([good('verificar'), good('integracao')]), true);
  assert.equal(approved([good('verificar'), { name: 'integracao', status: 'completed', conclusion: 'failure' }]), false);
  assert.equal(approved([good('verificar'), { name: 'integracao', status: 'in_progress' }]), false);
});

test('an older successful run does not override a later failure', () => {
  assert.equal(approved([{ ...good('verificar'), id: 1 }, { ...good('integracao'), id: 2 }, { name: 'integracao', id: 3, status: 'completed', conclusion: 'failure' }]), false);
});
