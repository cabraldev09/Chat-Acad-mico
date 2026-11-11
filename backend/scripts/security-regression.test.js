const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { signedFileUrl, verifyFileToken } = require('../dist/helpers/SignedFile');
const auth = require('../dist/config/auth').default;
const { inMessagingWindow, validateTemplate } = require('../dist/services/OutboundServices/Policy');
const { eligibleForAssignment } = require('../dist/services/AutomationServices/AssignmentPolicy');
const { validateOperationSetting } = require('../dist/helpers/OperationSettings');

test('file capability is limited to one file and expires', () => {
  const url = new URL(signedFileUrl('contract.pdf', 'message-1'), 'http://localhost');
  const token = url.searchParams.get('access');
  assert.equal(verifyFileToken(token, 'contract.pdf').messageId, 'message-1');
  assert.throws(() => verifyFileToken(token, 'another.pdf'));
  assert.throws(() => verifyFileToken(token, '../contract.pdf'));
  const expired = jwt.sign({ purpose: 'file', file: 'contract.pdf' }, auth.secret, { expiresIn: -1 });
  assert.throws(() => verifyFileToken(expired, 'contract.pdf'));
});
test('access JWT cannot be reused as a file capability', () => {
  const token = jwt.sign({ id: 1 }, auth.secret);
  assert.throws(() => verifyFileToken(token, 'contract.pdf'));
});
test('Meta window checks all channels and the exact boundary', () => {
  const now = Date.now();
  for (const channel of ['whatsapp_cloud', 'instagram', 'messenger']) {
    assert.equal(inMessagingWindow(channel, null, now), false);
    assert.equal(inMessagingWindow(channel, new Date(now - 86400000), now), false);
    assert.equal(inMessagingWindow(channel, new Date(now - 86399000), now), true);
    assert.equal(inMessagingWindow(channel, new Date(now + 1000), now), false);
  }
  assert.equal(inMessagingWindow('telegram', null, now), true);
});
test('template parameters and identifiers must match provider format', () => {
  assert.equal(validateTemplate({ name: 'matricula_2027', language: 'pt_BR', params: ['Ana'] }), true);
  assert.equal(validateTemplate({ name: '../x', language: 'pt_BR', params: [] }), false);
  assert.equal(validateTemplate({ name: 'teste', language: 'pt_BR', params: [123] }), false);
});
test('paused or overloaded consultants do not receive assignments', () => {
  assert.equal(eligibleForAssignment({ acceptsNewTickets: false }, 0), false);
  assert.equal(eligibleForAssignment({ maxOpenTickets: 3 }, 3), false);
  assert.equal(eligibleForAssignment({ maxOpenTickets: 3 }, 2), true);
  assert.equal(eligibleForAssignment({ maxOpenTickets: 0 }, 200), true);
});
test('operation settings reject invalid costs, arbitrary keys and non-booleans', () => {
  for (const value of ['NaN', 'Infinity', '-10', {}, null]) assert.throws(() => validateOperationSetting('ai_daily_usd_cap', value));
  assert.throws(() => validateOperationSetting('ai_openai_key', 'exfiltrate'));
  assert.throws(() => validateOperationSetting('outbound_allow_templates', 'yes'));
  assert.equal(validateOperationSetting('outbound_allow_templates', true), 'true');
  assert.equal(validateOperationSetting('outbound_meta_template_usd', '0.02'), '0.02');
});

test('reactive attendance is scoped to the inbound reply and does not leak to workers', async () => {
  const { withReactiveReply, isReactiveReply } = require('../dist/helpers/ReactiveReply');
  assert.equal(isReactiveReply(), false);
  await withReactiveReply(async () => { await Promise.resolve(); assert.equal(isReactiveReply(), true); });
  assert.equal(isReactiveReply(), false);
});
