import { expect, test } from 'bun:test';
import { parseJSONObject } from '@heynixie/log';
import { buildAlwaysAllowRule } from '@heynixie/policy';
import { buildMockToolContext } from '@heynixie/tools/test-utils';
import { readWakeRules } from '@heynixie/triggers';
import { phoneDeclarations } from '../connector/phone-declarations';
import { writeReceivedText } from '../store/write-received-text';
import { startTestPhone } from '../test-utils';
import { buildPhoneTools } from './build-phone-tools';

async function setupTest() {
  const phone = await startTestPhone();

  return {
    ...phone,
    writeText: (from: string, body: string, receivedAt = phone.clock.now()) =>
      writeReceivedText(phone.context, {
        messageID: crypto.randomUUID(),
        from,
        body,
        receivedAt,
        precisionMs: 1,
      }),
    clearSend: (input: object) => {
      const send = buildPhoneTools(phone.context, phone.forgetter).find(
        (tool) => tool.name === 'phone.send',
      );

      return (
        send?.clear?.(
          parseJSONObject(JSON.stringify(input)),
          buildMockToolContext({ run: { tools: ['phone.send'] } }),
        ) ?? Promise.resolve('the send tool has no clear')
      );
    },
    recordInput: (name: string, input: object) =>
      buildPhoneTools(phone.context, phone.forgetter)
        .find((tool) => tool.name === name)
        ?.recordInput?.(parseJSONObject(JSON.stringify(input))),
    readRules: () =>
      readWakeRules(phone.writer.db, {
        mailbox: { kind: 'source', sourceID: 'phone' },
        at: phone.clock.now(),
      }),
  };
}

test('it lists the texts newest first with the number, and seals each sender and body', async () => {
  const ctx = await setupTest();

  await ctx.writeText('Example', 'First', ctx.clock.now() - 2000);
  await ctx.writeText('Example', 'Second', ctx.clock.now() - 1000);

  const outcome = await ctx.callTool('phone.list', {});

  const texts = outcome.status === 'ok' ? JSON.stringify(outcome.result['texts']) : '';

  expect(texts).toContain(String.raw`<tool-result source=\"untrusted\"`);
  expect(texts.indexOf('Second')).toBeLessThan(texts.indexOf('First'));

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { number: '+61411111111', next: null },
  });
});

test('it keeps no sender and no body in the record of a list call', async () => {
  const ctx = await setupTest();

  await ctx.writeText('Example', 'Your code is 5521');

  const outcome = await ctx.callTool('phone.list', {});

  const record = outcome.status === 'ok' ? JSON.stringify(outcome.record) : '';

  expect(record).toContain('"texts"');
  expect(record).not.toContain('5521');
  expect(record).not.toContain('Example');
});

test.each([
  ['a sender name without case', 'EXAMPLE'],
  ['a number', '+61422222222'],
])('it narrows the list to the texts of %s', async (_name, from) => {
  const ctx = await setupTest();

  await ctx.writeText('Example', 'From the name');
  await ctx.writeText('+61422222222', 'From the number');

  const outcome = await ctx.callTool('phone.list', { from });

  const texts = outcome.status === 'ok' ? outcome.result['texts'] : null;

  expect(texts).toHaveLength(1);
});

test('it pages the list with the next value of a result', async () => {
  const ctx = await setupTest();

  await ctx.writeText('Example', 'First', ctx.clock.now() - 2000);
  await ctx.writeText('Example', 'Second', ctx.clock.now() - 1000);

  const first = await ctx.callTool('phone.list', { limit: 1 });

  const next = first.status === 'ok' ? first.result['next'] : null;

  const second = await ctx.callTool('phone.list', { limit: 1, before: next });

  expect(second).toMatchObject({
    status: 'ok',
    result: { texts: [{ body: expect.stringContaining('"First"') }], next: null },
  });
});

test('it reads one text, and keeps the time alone in the record of the call', async () => {
  const ctx = await setupTest();
  const shortID = await ctx.writeText('Example', 'Your code is 5521');
  const outcome = await ctx.callTool('phone.read', { text: shortID });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { from: 'Example', body: 'Your code is 5521', at: expect.any(String) },
    record: { at: expect.any(String) },
  });
});

test('it refuses to read a text that no stored text has the ID of, with UNKNOWN_TEXT', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.callTool('phone.read', { text: 'txzzzzzzzz' });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'UNKNOWN_TEXT: no text has the ID txzzzzzzzz',
  });
});

test('it sets a wake rule on the phone, and lists the recent texts it takes without their text in the record', async () => {
  const ctx = await setupTest();

  await ctx.writeText('Example', 'Your code is 5521');
  await ctx.writeText('Other', 'Hello');

  const outcome = await ctx.callTool('phone.wake_set', {
    from: ['Example'],
    body: 'code',
    expires: '30m',
    window: '1m',
  });

  const rules = await ctx.readRules();

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { replaced: false, window: '1m', recent: [{ body: expect.stringContaining('5521') }] },
  });

  const record = outcome.status === 'ok' ? JSON.stringify(outcome.record) : '';

  expect(record).not.toContain('5521');
  expect(rules.map((rule) => rule.match)).toStrictEqual([{ from: ['Example'], body: 'code' }]);
});

test('it replaces a rule with the same match and target, and lists and cancels it', async () => {
  const ctx = await setupTest();

  await ctx.callTool('phone.wake_set', { body: 'code' });

  const again = await ctx.callTool('phone.wake_set', { body: 'code', window: '2m' });
  const listed = await ctx.callTool('phone.wake_list', {});

  const rule = again.status === 'ok' ? (again.result['rule'] ?? null) : null;

  expect(again).toMatchObject({ status: 'ok', result: { replaced: true } });

  expect(listed).toMatchObject({
    status: 'ok',
    result: { rules: [{ rule, match: { body: 'code' }, wake: 'conversation', window: '2m' }] },
  });

  const cancelled = await ctx.callTool('phone.wake_cancel', { rule });
  const after = await ctx.readRules();

  expect(cancelled).toStrictEqual({ status: 'ok', result: { rule, ended: true } });
  expect(after).toStrictEqual([]);
});

test('it refuses to cancel a rule that is not live, with UNKNOWN_RULE', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.callTool('phone.wake_cancel', { rule: 'wqzzzzzzzz' });

  expect(outcome).toMatchObject({
    status: 'error',
    message: expect.stringContaining('UNKNOWN_RULE'),
  });
});

test.each([
  ['a number with no plus sign', { to: '61400000000', body: 'Hi' }, 'BAD_NUMBER'],
  ['a number with letters', { to: '+6140abc', body: 'Hi' }, 'BAD_NUMBER'],
  ['a body of 641 characters', { to: '+61400000000', body: 'a'.repeat(641) }, 'TOO_LONG'],
])('it refuses a send with %s before any approval', async (_name, input, code) => {
  const ctx = await setupTest();
  const sentence = await ctx.clearSend(input);

  expect(sentence).toStartWith(code);
});

test('it lets a send of 640 characters to an E.164 number go', async () => {
  const ctx = await setupTest();
  const sentence = await ctx.clearSend({ to: '+61400000000', body: 'a'.repeat(640) });

  expect(sentence).toBeNull();
});

test('it declares every field of a received text as outside content', () => {
  expect(phoneDeclarations.list.results).toStrictEqual({
    number: 'owner_data',
    texts: 'untrusted',
    next: 'owner_data',
  });

  expect(phoneDeclarations.read.results).toStrictEqual({
    from: 'untrusted',
    body: 'untrusted',
    at: 'untrusted',
  });

  expect(phoneDeclarations.wakeSet.results.recent).toBe('untrusted');
});

test('it offers an always-allow rule for a send that pins the number and leaves the body free', () => {
  const rule = buildAlwaysAllowRule({
    shortID: 'ab12cd34ef',
    tool: 'phone.send',
    input: { to: '+61400000000', body: 'Running 10 minutes late.' },
    destinations: ['+61400000000'],
    content: [...phoneDeclarations.send.content],
  });

  expect(rule?.form).toMatchObject({
    tools: ['phone.send'],
    checks: [{ arg: 'to', op: 'eq', value: '+61400000000' }],
    destinations: ['+61400000000'],
  });
});

test.each([
  ['phone.list', { from: 'Example', limit: 5 }, { limit: 5 }],
  [
    'phone.wake_set',
    { from: ['Example'], body: 'code', expires: '30m', window: '1m' },
    { expires: '30m', window: '1m' },
  ],
])(
  'it keeps no sender and no body in the record of the arguments of %s',
  async (name, input, expected) => {
    const ctx = await setupTest();

    expect(ctx.recordInput(name, input)).toStrictEqual(expected);
  },
);

test('it forgets a text for the assistant, so no tool reads it afterwards', async () => {
  const ctx = await setupTest();
  const shortID = await ctx.writeText('Example', 'Your code is 5521');
  const forgotten = await ctx.callTool('phone.forget', { text: shortID });

  await ctx.forgetter.waitForForgets();

  const read = await ctx.callTool('phone.read', { text: shortID });
  const listed = await ctx.callTool('phone.list', {});

  expect(forgotten).toStrictEqual({
    status: 'ok',
    result: { text: shortID, status: 'forgetting' },
    record: { text: shortID },
  });

  expect(read).toMatchObject({ status: 'error', message: expect.stringContaining('UNKNOWN_TEXT') });
  expect(JSON.stringify(listed)).not.toContain('5521');
});

test('it refuses to forget a text that no stored text has the ID of, with UNKNOWN_TEXT', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.callTool('phone.forget', { text: 'txzzzzzzzz' });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'UNKNOWN_TEXT: no text has the ID txzzzzzzzz',
  });
});

test('it tells the model that its own number goes to a sign-up, and how the code reaches it', async () => {
  const ctx = await setupTest();

  const list = buildPhoneTools(ctx.context, ctx.forgetter).find(
    (tool) => tool.name === 'phone.list',
  );

  expect(list?.description).toContain(
    'when a sign-up asks for a phone number, give it that number',
  );

  expect(list?.description).toContain('type its code into the page');
});
