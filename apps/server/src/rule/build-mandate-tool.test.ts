import { expect, test } from 'bun:test';
import type { JSONObject } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { buildMemoryTools } from '@heynixie/memory';
import { startTestMemory } from '@heynixie/memory/test-utils';
import { buildMockToolContext } from '@heynixie/tools/test-utils';
import { z } from 'zod';
import { buildMandateDescription, buildMandateTool } from './build-mandate-tool';
import { memoryRuleArguments } from './memory-rule-arguments';

interface NamedArgument {
  isDeclared: boolean;
  isNamed: boolean;
}

async function setupTest(maxHours = 24) {
  const started = await startTestLog();

  const tool = buildMandateTool({
    context: {
      log: started.log,
      clock: started.clock,
      definitions: () => ({ snapshotHash: 'snapshot-1' }),
    },
    maxHours,
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
    message: `The mandate was refused: expires_past. now: 2026-10-16T20:00:00+11:00. Propose again with expires after now, or leave expires out for the next midnight.`,
  });
});

test('it refuses an expiry beyond the longest mandate and names the latest end', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.call({
    title: 'Too long',
    rules: [{ outcome: 'allow', tools: ['calendar.respond'] }],
    expires: '2100-01-01T00:00:00Z',
  });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: `The mandate was refused: expires_beyond_max. maxHours: 24. latestExpiry: 2026-10-17T20:00:00+11:00. Propose again with expires at or before latestExpiry.`,
  });
});

test('it states the longest mandate that the setting allows in its description', async () => {
  const ctx = await setupTest(6);

  expect(ctx.tool.description).toInclude('A mandate lasts at most 6 hours from the proposal.');

  expect(ctx.tool.description).toInclude(
    "With no expires, it ends at the next midnight in the user's time zone.",
  );
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

  const gap = z.object({ rule: z.number(), uncovered: z.array(z.string()) });
  const result = z.object({ memoryGaps: z.array(gap) });
  const gaps = z.object({ status: z.literal('ok'), result }).parse(outcome).result.memoryGaps;

  expect(gaps).toHaveLength(1);
  expect(gaps[0]?.uncovered).not.toContain('a write from a photo');
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
      isNamed:
        buildMandateDescription(24).includes(`${toolName}: `) &&
        buildMandateDescription(24).includes(name),
    }));
  });

  const entries: NamedArgument[] = named.flat();

  expect(entries).toSatisfyAll((entry: NamedArgument) => entry.isDeclared && entry.isNamed);
});

test('it describes the memory example and says that a rule by tool name and one by effect agree', () => {
  expect(buildMandateDescription(24)).toInclude('memory_write');
  expect(buildMandateDescription(24)).toInclude('subject eq self');
  expect(buildMandateDescription(24)).toInclude('memory tidy-up');
});
