import { expect, test } from 'bun:test';
import type { JSONObject } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { buildMemoryTools } from '@heynixie/memory';
import { startTestMemory } from '@heynixie/memory/test-utils';
import { buildMockToolContext } from '@heynixie/tools/test-utils';
import { z } from 'zod';
import { buildMandateTool, mandateDescription } from './build-mandate-tool';
import { memoryRuleArguments } from './memory-rule-arguments';

async function setupTest() {
  const started = await startTestLog();

  const tool = buildMandateTool({
    context: {
      log: started.log,
      clock: started.clock,
      definitions: () => ({ snapshotHash: 'snapshot-1' }),
    },
    maxHours: 24,
    defaultZone: 'Australia/Sydney',
  });

  const call = (input: JSONObject) =>
    tool.run(
      { callID: 'call-1', tool: 'rules.propose_mandate', input, toolUseID: null },
      buildMockToolContext(),
    );

  return { ...started, tool, call };
}

test('it declares the note effect, which only writes a proposal', async () => {
  const ctx = await setupTest();

  expect(ctx.tool.declaration.effects).toStrictEqual(['note']);
});

test('it writes a pending proposal and returns what the owner will see on the card', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.call({
    title: 'Full authority over my calendar invites',
    rules: [{ outcome: 'allow', tools: ['calendar.respond', 'calendar.invite'] }],
  });

  expect(outcome).toMatchObject({
    status: 'ok',
    result: {
      status: 'pending',
      proposalID: expect.any(String),
      mandateID: expect.any(String),
      expires: expect.stringMatching(/Z$/u),
      sentences: [
        '**Allow** `calendar.invite` or `calendar.respond`, until 2026-10-16T13:00:00.000Z.',
      ],
    },
  });
});

test('it refuses a mandate with a rule that is not an allow rule', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.call({ title: 'Never mind', rules: [{ outcome: 'deny' }] });

  expect(outcome.status).toBe('error');
});

test('it refuses an expiry in the past', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.call({
    title: 'Too late',
    rules: [{ outcome: 'allow', tools: ['calendar.respond'] }],
    expires: '2000-01-01T00:00:00Z',
  });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'The mandate was refused: expires_past.',
  });
});

test('it lists in memoryGaps the memory writes that a rule will not cover', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.call({
    title: 'Tidy my memory',
    rules: [
      { outcome: 'allow', tools: ['memory.edit', 'memory.retire'] },
      { outcome: 'allow', tools: ['calendar.respond'] },
    ],
  });

  expect(outcome).toMatchObject({
    status: 'ok',
    result: {
      memoryGaps: [
        {
          rule: 1,
          uncovered: expect.arrayContaining([
            'a new fact',
            'a new self-note',
            'a self-note text edit',
            'a pin',
          ]),
        },
      ],
    },
  });
});

test('it leaves memoryGaps empty for a rule that reaches no memory tool', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.call({
    title: 'Calendar only',
    rules: [{ outcome: 'allow', tools: ['calendar.respond'] }],
  });

  expect(outcome).toMatchObject({ status: 'ok', result: { memoryGaps: [] } });
});

test('it leaves a photo write out of memoryGaps for a rule that checks an image argument', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.call({
    title: 'Memory from photos',
    rules: [
      {
        outcome: 'allow',
        effects: ['memory_write'],
        checks: [{ arg: 'image.eventID', op: 'matches', value: '*' }],
      },
    ],
  });

  expect(outcome).toMatchObject({
    status: 'ok',
    result: {
      memoryGaps: [{ rule: 1, uncovered: expect.not.arrayContaining(['a write from a photo']) }],
    },
  });
});

test('it names in its description each argument of a memory tool that a rule can check', async () => {
  const memory = await startTestMemory();

  const tools = buildMemoryTools(memory.store, {
    clock: { now: () => Date.now() },
    ownerName: null,
    defaultZone: 'UTC',
  });

  const named = Object.entries(memoryRuleArguments).map(([toolName, names]) => {
    const input = tools.find((tool) => tool.name === toolName)?.input;
    const properties = z.object({ properties: z.record(z.string(), z.unknown()) }).parse(input);

    return names.map((name) => ({
      toolName,
      name,
      isDeclared:
        name === 'subject' || Object.hasOwn(properties.properties, name.split('.')[0] ?? ''),
      isNamed: mandateDescription.includes(`${toolName}: `) && mandateDescription.includes(name),
    }));
  });

  expect(named.flat()).toSatisfyAll((entry) => entry.isDeclared && entry.isNamed);
});

test('it describes the memory example and says that a rule by tool name and one by effect agree', () => {
  expect(mandateDescription).toInclude('memory_write');
  expect(mandateDescription).toInclude('subject eq self');
  expect(mandateDescription).toInclude('memory tidy-up');
});
