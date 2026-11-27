import { expect, test } from 'bun:test';
import { startTestRules } from '@heynixie/api/test-utils';
import type { MandateInput } from '@heynixie/definitions';
import { readDefinitionsInForce, readSnapshotPolicy } from '@heynixie/definitions';
import type { JSONObject } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { DecisionPoint, EffectDeclaration } from '@heynixie/policy';
import { makeDecisionPoint } from '@heynixie/policy';
import { readStarterDecisionPoint } from '@heynixie/policy/test-utils';
import { readProposal } from '@heynixie/proposals';
import { buildSkillTools } from '@heynixie/skills';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';
import invariant from 'tiny-invariant';

async function setupTest() {
  const rules = await startTestRules();

  const startMandate = async (input: MandateInput) => {
    const proposed = await rules.proposeMandate(input);

    invariant(proposed.status === 'proposed', 'the mandate was proposed');

    const row = await readProposal(rules.log.writer.db, proposed.proposalID);

    invariant(row, 'the proposal opened a row');

    await rules.answer(proposed.proposalID, 'approve');
  };

  const runWrite = async (
    input: JSONObject,
    makeDecide: (findDeclaration: (tool: string) => EffectDeclaration | null) => DecisionPoint,
  ) => {
    const inForce = await readDefinitionsInForce(rules.log.writer.db);

    const registry = buildToolRegistry(
      buildSkillTools({
        log: rules.log,
        clock: rules.clock,
        readInForce: () => inForce,
        runInForceSeed: async () => {
          await rules.runInForceSeed();
        },
        refreshDefinitions: () => readDefinitionsInForce(rules.log.writer.db),
        readSkillList: () => [],
      }),
    );

    const decide = makeDecide((tool) => registry.findTool(tool)?.definition.declaration ?? null);

    return runToolCall(
      { tool: 'skill_write', input, toolUseID: null },
      {
        runID: 'run-1',
        thread: 'conversation',
        logThread: 'conversation',
        tools: ['skill_write'],
        model: { model: 'model-a', profile: 'chat-direct' },
      },
      {
        registry,
        decide,
        log: rules.log,
        definitions: () => ({ snapshotHash: inForce?.snapshotHash ?? '' }),
        queue: {
          enqueue: () => Promise.reject(new Error('skill_write runs direct')),
          readOpenRepeat: () => Promise.resolve(null),
          readOpenAsk: () => Promise.resolve(null),
          waitForOutcome: () => Promise.resolve(null),
        },
        queuedWaitMs: 1000,
      },
    );
  };

  return {
    ...rules,
    startMandate,

    // decides each call from the snapshot in force, which holds the mandates' rules
    writeSkill: (input: JSONObject) =>
      runWrite(input, (findDeclaration) =>
        makeDecisionPoint({
          findDeclaration,
          readInputs: async (snapshot) => {
            const read = await readSnapshotPolicy(rules.log.writer.db, snapshot);

            return { rules: read.rules, places: [], tools: read.tools };
          },
          findTaskDestinations: () => [],
          readConsent: () => Promise.resolve(null),
        }),
      ),
    writeSkillUnderStarterRules: (input: JSONObject) =>
      runWrite(input, (findDeclaration) => readStarterDecisionPoint(findDeclaration)),
    readSkillNamesInForce: async () => {
      const inForce = await readDefinitionsInForce(rules.log.writer.db);

      return inForce?.skills.map((skill) => skill.name) ?? [];
    },
    readRecordKinds: async (
      kinds: readonly ('skills.write_applied' | 'skills.write_proposed')[],
    ) => {
      const entries = await readRecords(rules.log, { afterSequence: 0, kinds: [...kinds] });

      return entries.map((entry) => entry.record.kind);
    },
  };
}

test('it applies a skill write at once under a mandate whose rule names skill_write, and puts the skill in force for the next task', async () => {
  const ctx = await setupTest();

  await ctx.startMandate({
    title: 'Write my kite skills',
    rules: [{ outcome: 'allow', tools: ['skill_write'] }],
  });

  await ctx.writeSkill({
    name: 'kite-forecast',
    files: [
      {
        path: 'SKILL.md',
        text: '---\nname: kite-forecast\ndescription: Reads the wind for kites.\n---\n# Wind\n',
      },
    ],
  });

  const kinds = await ctx.readRecordKinds(['skills.write_applied', 'skills.write_proposed']);
  const names = await ctx.readSkillNamesInForce();

  expect([kinds, names]).toStrictEqual([['skills.write_applied'], ['kite-forecast']]);
});

test('it keeps the proposal for a skill write under a mandate whose rule matches only the note effect', async () => {
  const ctx = await setupTest();

  await ctx.startMandate({
    title: 'Take my notes',
    rules: [{ outcome: 'allow', effects: ['note'] }],
  });

  await ctx.writeSkill({
    name: 'kite-forecast',
    files: [
      {
        path: 'SKILL.md',
        text: '---\nname: kite-forecast\ndescription: Reads the wind for kites.\n---\n# Wind\n',
      },
    ],
  });

  const kinds = await ctx.readRecordKinds(['skills.write_applied', 'skills.write_proposed']);
  const names = await ctx.readSkillNamesInForce();

  expect([kinds, names]).toStrictEqual([['skills.write_proposed'], []]);
});

test('it keeps the proposal for a skill write under the starter rules, whose allow-notes rule matches the note effect', async () => {
  const ctx = await setupTest();

  await ctx.writeSkillUnderStarterRules({
    name: 'kite-forecast',
    files: [
      {
        path: 'SKILL.md',
        text: '---\nname: kite-forecast\ndescription: Reads the wind for kites.\n---\n# Wind\n',
      },
    ],
  });

  const kinds = await ctx.readRecordKinds(['skills.write_applied', 'skills.write_proposed']);
  const names = await ctx.readSkillNamesInForce();

  expect([kinds, names]).toStrictEqual([['skills.write_proposed'], []]);
});
