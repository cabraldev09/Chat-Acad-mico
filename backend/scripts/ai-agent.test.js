const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const policy = require('../dist/services/AiServices/Policy');

// Load compiled services with in-memory dependencies: no DB, WhatsApp or paid API requests.
function isolated(relative, mocks) {
  const filename = path.resolve(__dirname, '../dist', relative);
  const instance = new Module(filename, module);
  const realRequire = Module.createRequire(filename);
  instance.require = id => Object.hasOwn(mocks, id) ? mocks[id] : realRequire(id);
  instance._compile(fs.readFileSync(filename, 'utf8'), filename);
  return instance.exports;
}
function harness(provider = 'openai') {
  const calls = [], sent = [], handoffs = [], usages = [];
  const agent = { id: 1, name: 'Matrículas', provider, model: 'test-model', apiKey: 'test-key', persona: { rules: 'Nunca solicitar CPF.', forbidden: 'Não prometer desconto.' }, maxHistory: 12, dailyTokenCap: 10000, handoffAfterTurns: 14 };
  const inbound = { id: 'in-1', fromMe: false, body: 'Quero estudar Direito.', createdAt: new Date() };
  const ticket = { id: 10, aiActive: true, status: 'pending', aiTurns: 0, aiSlots: {}, contact: { name: 'Ana', update: async data => Object.assign(ticket.contact, data) }, whatsapp: { channel: 'whatsapp_cloud' }, update: async data => Object.assign(ticket, data) };
  const state = { latest: inbound, history: [inbound], faq: null, used: 0, responses: [], toolRuns: 0, flow: false, emptySlots: false };
  const slots = () => [{ key: 'nome', label: 'Nome', required: true }, { key: 'curso', label: 'Curso', required: true }];
  const missing = (_a, c) => slots().filter(s => !c?.[s.key]);
  const tools = {
    slotsOf: slots, missingSlots: missing,
    toolDefs: () => [{ name: 'salvar_lead', description: 'Salvar', input_schema: { type: 'object', properties: {} } }],
    runTool: async (_name, input, ctx) => { state.toolRuns++; Object.assign(ctx.collected, input); Object.assign(ticket.aiSlots, input); if (state.flow) ctx.flowStarted = true; return { completo: !missing(agent, ctx.collected).length }; }
  };
  const service = isolated('services/AiServices/RunAiAgent.js', {
    axios: { post: async (url, body) => { calls.push({ url, body }); const next = state.responses.shift(); if (next instanceof Error) throw next; if (!next) throw new Error('Unexpected API call'); return { data: next }; } },
    '../../models/AiAgent': { findAll: async () => [agent] },
    '../../models/Message': { findOne: async () => state.latest, findAll: async () => [...state.history].reverse() },
    '../../models/Ticket': { findByPk: async () => ticket },
    '../../helpers/AppSettings': { getSetting: async () => '' },
    '../../utils/logger': { logger: { warn() {}, error() {} } },
    '../TicketServices/ShowTicketService': async () => ticket,
    './Kb': { ensureLegacy: async () => {}, matchFaq: async () => state.faq, searchChunks: async () => [] },
    './Budget': { callWithBudget: async (_agent, kind, ticketId, body, call) => { if (kind !== "test" && _agent.dailyTokenCap > 0 && state.used >= _agent.dailyTokenCap) throw new Error("ERR_AI_TOKEN_CAP"); const data = await call(body); usages.push({ kind, ticketId, usage: data.usage }); state.used += policy.usageCounts(data.usage).input; return data; } },
    './Usage': { logUsage: async u => { usages.push(u); state.used += policy.usageCounts(u.usage).input; }, tokensToday: async () => state.used },
    './Tools': tools,
    './Handoff': { handoffToHuman: async (_id, _agent, reason) => { handoffs.push(reason); ticket.aiActive = false; } },
    './Learning': { captureUnknown: async () => {}, notifyOwner: async () => {} },
    './Training': { trainingBlock: async () => '' },
    './Media': { textOfMessage: m => m.body || '' },
    '../CommercialServices/Academic': { offeredCourses: async () => [] },
    '../CommercialServices/Hours': { todayLine: async () => '' },
    '../CommercialServices/Guards': { unsupportedFact: () => null },
    '../CommercialServices/Blocks': { splitIntoBlocks: text => [text] },
    '../FlowServices/Claim': { claimAi: async () => true, releaseAi: async () => {} },
    '../AutomationServices/AutomationTrace': { noteAutomation: () => {} },
    './Style': { styleRules: () => '', styleOf: () => ({}), signed: t => t }

  });
  const response = text => provider === 'openai' ? { choices: [{ message: { role: 'assistant', content: text } }], usage: { prompt_tokens: 50, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 20 } } } : { content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 30, cache_read_input_tokens: 20, output_tokens: 10 } };
  const toolCall = input => provider === 'openai' ? { choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: 'tool-1', type: 'function', function: { name: 'salvar_lead', arguments: JSON.stringify(input) } }] } }], usage: { prompt_tokens: 50 } } : { content: [{ type: 'tool_use', id: 'tool-1', name: 'salvar_lead', input }], stop_reason: 'tool_use', usage: { input_tokens: 50 } };
  return { agent, ticket, inbound, state, calls, sent, handoffs, usages, service, response, toolCall, say: async (_ticket, body) => { sent.push(body); } };
}

test('economical defaults require explicit admin activation of follow-up, FAQ and scholarships', () => {
  const p = policy.policyOf(null);
  assert.equal(p.followUp.enabled, false);
  assert.equal(p.readyAnswers, false);
  assert.equal(p.simulateScholarship, false);
  assert.equal(p.guideSale, true);
  assert.equal(policy.policyOf({ followUp: { enabled: true, minutes: -10 } }).followUp.minutes, 5);
  assert.equal(policy.policyOf({ followUp: { minutes: Infinity } }).followUp.minutes, 30);
});
test('missing next step is specific; existing questions and handoff markers are preserved', () => {
  assert.equal(policy.withNextStep('Certo.', [{ key: 'cidade', label: 'Cidade' }], true), 'Certo.\n\nEm qual cidade você quer estudar?');
  assert.equal(policy.withNextStep('Qual curso?', [], true), 'Qual curso?');
  assert.equal(policy.withNextStep('[HANDOFF]', [], true), '[HANDOFF]');
  assert.equal(policy.withNextStep('Certo.', [], false), 'Certo.');
});
test('opt-out recognizes refusal without treating matrícula cancellation queries as opt-out', () => {
  for (const text of ['SAIR', 'Não tenho interesse.', 'Não quero receber mais mensagens', 'pare de me enviar mensagens']) assert.ok(policy.wantsToStop(text), text);
  assert.equal(policy.wantsToStop('Como cancelar minha matrícula?'), false);
});
test('provider usage includes all Anthropic cache tokens and avoids counting OpenAI cache twice', () => {
  assert.deepEqual(policy.usageCounts({ input_tokens: 10, cache_read_input_tokens: 80, cache_creation_input_tokens: 20, output_tokens: 5 }), { input: 110, output: 5, cacheRead: 80, cacheWrite: 20 });
  assert.deepEqual(policy.usageCounts({ prompt_tokens: 100, prompt_tokens_details: { cached_tokens: 80 }, completion_tokens: 5 }), { input: 100, output: 5, cacheRead: 80, cacheWrite: 0 });
});
const now = Date.now();
const due = { enabled: true, minutes: 30, now, lastInbound: now - 3600000, lastOutbound: now - 1800001, reminded: false, active: true, assigned: false, closed: false, optedOut: false };
test('reminder is due after configured silence', () => assert.equal(policy.reminderIsDue(due), true));
for (const [name, patch] of Object.entries({ disabled: { enabled: false }, assigned: { assigned: true }, closed: { closed: true }, optOut: { optedOut: true }, alreadyReminded: { reminded: true }, inactive: { active: false }, recentReply: { lastOutbound: now - 1000 }, inboundLast: { lastInbound: now - 1000 }, expiredWindow: { lastInbound: now - 24 * 3600000 }, unknownInbound: { lastInbound: 0 } })) {
  test(`reminder blocked: ${name}`, () => assert.equal(policy.reminderIsDue({ ...due, ...patch }), false));
}
for (const provider of ['openai', 'anthropic']) {
  test(`${provider}: admin instructions, known context and approved FAQ reach the model`, async () => {
    const h = harness(provider);
    h.state.faq = { title: 'Direito', content: 'O curso tem dez semestres.' };
    h.state.responses.push(h.response('O curso tem dez semestres.'));
    const r = await h.service.respond(h.agent, { ticket: h.ticket, history: [{ role: 'user', content: 'Direito' }], collected: { nome: 'Ana' }, summary: 'Interesse em Direito EAD.' });
    const prompt = JSON.stringify(h.calls[0].body);
    assert.match(prompt, /Nunca solicitar CPF/);
    assert.match(prompt, /Não prometer desconto/);
    assert.match(prompt, /Interesse em Direito EAD/);
    assert.match(prompt, /dez semestres/);
    assert.match(r.text, /Qual curso/);
    assert.equal(r.tokens.cacheRead, 20);
    assert.equal(r.tokens.input, 50);
  });
  test(`${provider}: tool flow takeover immediately stops further generation`, async () => {
    const h = harness(provider); h.state.flow = true;
    h.state.responses.push(h.toolCall({ nome: 'Ana' }));
    const r = await h.service.respond(h.agent, { ticket: h.ticket, history: [{ role: 'user', content: 'Ana' }] });
    assert.equal(r.flowStarted, true); assert.equal(r.text, ''); assert.equal(h.calls.length, 1);
  });
  test(`${provider}: qualification preserves answer and includes actual handoff notice`, async () => {
    const h = harness(provider);
    h.state.responses.push(h.toolCall({ nome: 'Ana', curso: 'Direito' }), h.response('Os dados estão registrados.'));
    const r = await h.service.respond(h.agent, { ticket: h.ticket, history: [{ role: 'user', content: 'Ana, quero Direito' }] });
    assert.equal(r.qualified, true); assert.match(r.text, /dados estão registrados/); assert.match(r.text, /consultor/); assert.equal(r.text.includes('?'), false);
    assert.equal(h.calls.length, 2);
  });
  test(`${provider}: budget is checked before each tool round`, async () => {
    const h = harness(provider); h.agent.dailyTokenCap = 40;
    h.state.responses.push(h.toolCall({ nome: 'Ana' }));
    await assert.rejects(h.service.respond(h.agent, { ticket: h.ticket, history: [{ role: 'user', content: 'Ana' }] }), /ERR_AI_TOKEN_CAP/);
    assert.equal(h.calls.length, 1);
  });
}
test('ready FAQ uses no API key or paid request only when explicitly enabled', async () => {
  const h = harness(); h.agent.apiKey = ''; h.agent.persona.readyAnswers = true; h.state.faq = { title: 'Curso', content: 'Informação aprovada.' };
  const r = await h.service.respond(h.agent, { ticket: null, sandbox: true, history: [{ role: 'user', content: 'Curso' }] });
  assert.equal(h.calls.length, 0); assert.equal(r.tokens.input, 0); assert.match(r.text, /Informação aprovada/);
});
test('blank model output informs lead and hands off instead of silently ending', async () => {
  const h = harness(); h.state.responses.push(h.response(''));
  await h.service.runAiForTicket(h.ticket.id, h.say);
  assert.equal(h.sent.length, 1); assert.match(h.sent[0], /atendentes/); assert.deepEqual(h.handoffs, ['sem_resposta']);
});
test('API error informs lead and assigns human follow-up', async () => {
  const h = harness(); h.state.responses.push(new Error('API unavailable'));
  await h.service.runAiForTicket(h.ticket.id, h.say);
  assert.equal(h.sent.length, 1); assert.deepEqual(h.handoffs, ['sem_resposta']);
});
test('human request bypasses model and FAQ', async () => {
  const h = harness(); h.inbound.body = 'Quero falar com um consultor';
  await h.service.runAiForTicket(h.ticket.id, h.say);
  assert.equal(h.calls.length, 0); assert.deepEqual(h.handoffs, ['pedido']);
});
test('refusal persists opt-out and disables automation without using tokens', async () => {
  const h = harness(); h.inbound.body = 'Não tenho interesse.';
  await h.service.runAiForTicket(h.ticket.id, h.say);
  assert.equal(h.calls.length, 0); assert.equal(h.ticket.contact.optOut, true); assert.equal(h.ticket.aiActive, false);
});
test('OpenAI refreshes rolling memory after four replies and carries previous summary', async () => {
  const h = harness(); h.ticket.aiTurns = 3; h.ticket.aiSummary = 'Busca EAD';
  h.state.history = [h.inbound, { fromMe: true, body: 'Qual cidade?' }, { fromMe: false, body: 'Porto Velho' }, { fromMe: true, body: 'Qual curso?' }, h.inbound];
  h.state.responses.push(h.response('Vamos continuar?'), h.response('Busca Direito EAD em Porto Velho.'));
  await h.service.runAiForTicket(h.ticket.id, h.say);
  assert.equal(h.calls.length, 2); assert.match(JSON.stringify(h.calls[1].body), /Busca EAD/);
  assert.equal(h.ticket.aiSummary, 'Busca Direito EAD em Porto Velho.'); assert.equal(h.usages[1].kind, 'summary');
});

function followUpHarness() {
  const sent = [], handoffs = [];
  const state = { flow: false, lead: null, open: true, claims: 0, claimed: false, afterClaim: null };
  const ticket = { id: 10, contactId: 20, aiActive: true, status: 'pending', chatbotNodeId: -1, updatedAt: new Date(), contact: {}, whatsapp: { businessHours: 'configured' } };
  const inbound = { id: 'in', body: 'Quero Direito', fromMe: false, createdAt: new Date(Date.now() - 3600000) };
  const outbound = { id: 'out', fromMe: true, createdAt: new Date(Date.now() - 2400000) };
  state.latest = outbound;
  const agent = { persona: { followUp: { enabled: true, minutes: 30, message: 'Quer continuar sua matrícula?' } } };
  const service = isolated('services/AiServices/FollowUp.js', {
    '../../models/Ticket': { update: async (_patch, opts) => {
      state.claims++;
      assert.equal(opts.where.lastMessageId, outbound.id);
      if (state.claimed) return [0];
      state.claimed = true;
      if (state.afterClaim) state.afterClaim();
      return [1];
    } },
    '../../models/Lead': { findOne: async () => state.lead },
    '../../models/ChatFlowRun': { count: async () => state.flow ? 1 : 0 },
    '../../models/Message': { findOne: async opts => opts.where.fromMe === false ? inbound : state.latest },
    '../TicketServices/ShowTicketService': async () => ticket,
    '../AutomationServices/BusinessHours': { isWithinBusinessHours: () => state.open },
    './RunAiAgent': { findAgentForTicket: async () => agent },
    './Handoff': { handoffToHuman: async (_id, _agent, reason) => handoffs.push(reason) }
  });
  return { state, ticket, inbound, agent, sent, handoffs, run: (say = async (_t, text) => sent.push(text)) => service.remindAiTicket(10, say) };
}
test('concurrent reminder workers claim once and send once', async () => {
  const h = followUpHarness(); await Promise.all([h.run(), h.run()]);
  assert.equal(h.sent.length, 1); assert.equal(h.sent[0], 'Quer continuar sua matrícula?');
});
for (const mode of ['outsideHours', 'activeFlow', 'won', 'lost', 'optOut', 'alreadyReminded', 'classicMenu']) {
  test(`actual reminder respects ${mode}`, async () => {
    const h = followUpHarness();
    if (mode === 'outsideHours') h.state.open = false;
    if (mode === 'activeFlow') h.state.flow = true;
    if (mode === 'won') h.state.lead = { wonAt: new Date() };
    if (mode === 'lost') h.state.lead = { lostAt: new Date() };
    if (mode === 'optOut') h.ticket.contact.optOut = true;
    if (mode === 'alreadyReminded') h.ticket.botReminderAt = new Date();
    if (mode === 'classicMenu') h.ticket.chatbotNodeId = 3;
    await h.run(); assert.equal(h.sent.length, 0); assert.equal(h.state.claims, 0);
  });
}
test('inbound arriving during reminder claim cancels delivery', async () => {
  const h = followUpHarness(); h.state.afterClaim = () => { h.state.latest = h.inbound; };
  await h.run(); assert.equal(h.sent.length, 0);
});
test('human assignment during reminder claim cancels delivery', async () => {
  const h = followUpHarness(); h.state.afterClaim = () => { h.ticket.userId = 7; };
  await h.run(); assert.equal(h.sent.length, 0);
});
test('ambiguous reminder delivery hands off without retrying and duplicating charges', async () => {
  const h = followUpHarness();
  await assert.rejects(h.run(async () => { throw new Error('delivery timeout'); }), /delivery timeout/);
  await h.run(); assert.equal(h.sent.length, 0); assert.deepEqual(h.handoffs, ['sem_resposta']);
});
test('ticket query includes opt-out and business hours needed by automation guards', async () => {
  let query;
  const mocks = { '../../models/Ticket': { findByPk: async (_id, opts) => { query = opts; return {}; } } };
  for (const model of ['Contact', 'User', 'Queue', 'Whatsapp', 'Tag']) mocks[`../../models/${model}`] = class {};
  const service = isolated('services/TicketServices/ShowTicketService.js', mocks).default;
  await service(10);
  assert.ok(query.include.find(i => i.as === 'contact').attributes.includes('optOut'));
  assert.ok(query.include.find(i => i.as === 'whatsapp').attributes.includes('businessHours'));
});
test('scholarship tool is disabled by default and cannot use an invented percentage', async () => {
  let catalogReads = 0;
  const mocks = {
    '../../models/Course': { findAll: async () => { catalogReads++; return [{ name: 'Direito', monthlyFee: 1000 }]; } },
    '../../helpers/sqlDialect': { isPg: () => true },
    '../CrmServices/LeadCore': { addActivity: async () => {} },
    './Kb': { norm: text => text.toLowerCase() }
  };
  for (const model of ['Polo', 'Lead', 'Ticket', 'AiAgent']) mocks[`../../models/${model}`] = {};
  const tools = isolated('services/AiServices/Tools.js', mocks);
  const agent = { persona: {} };
  const ctx = { agent, ticket: null, dryRun: true, collected: {}, userText: 'Tenho interesse.' };
  assert.equal(tools.toolDefs(agent).some(t => t.name === 'simular_bolsa'), false);
  assert.ok((await tools.runTool('simular_bolsa', { curso: 'Direito', percentual_bolsa: 90 }, ctx)).erro);
  agent.persona.simulateScholarship = true;
  assert.ok((await tools.runTool('simular_bolsa', { curso: 'Direito', percentual_bolsa: 90 }, ctx)).erro);
  assert.equal(catalogReads, 0);
  ctx.userText = 'Como fica com 20%?';
  const result = await tools.runTool('simular_bolsa', { curso: 'Direito', percentual_bolsa: 20 }, ctx);
  assert.equal(result.mensalidade_estimada, 800); assert.match(result.aviso, /Estimativa/);
});
test('reply from model is discarded if a human assumes the conversation', async () => {
  const h = harness();
  const answer = h.response('Você pode se matricular.');
  Object.defineProperty(answer, 'usage', { get() { h.ticket.userId = 7; return { prompt_tokens: 50 }; } });
  h.state.responses.push(answer);
  await h.service.runAiForTicket(h.ticket.id, h.say);
  assert.equal(h.sent.length, 0); assert.equal(h.handoffs.length, 0);
});
