import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runOracle, startE2ENixie } from '@heynixie/server/test-utils';
import type { ScriptedModelRequest } from '@heynixie/testing';
import { waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { readModelRequest } from '../src/test-utils/read-model-request';

type RequestBody = NonNullable<ScriptedModelRequest['body']>;

async function setupTest() {
  const exampleDir = join(import.meta.dir, '../../../docs/guides/examples/note-taking');

  const nixie = await startE2ENixie({
    isCheckerScripted: true,
    taskDefinitions: [
      {
        id: 'note-taking',
        yaml: readFileSync(join(exampleDir, 'task.yaml'), 'utf8'),
        instructions: readFileSync(join(exampleDir, 'instructions.md'), 'utf8'),
      },
    ],
  });

  return { nixie };
}

test('it fires the daily note-taking example and saves a memory that cites the message it quotes', async () => {
  const ctx = await setupTest();

  const process = ctx.nixie.harness.start();

  await process.ready;

  await ctx.nixie.waitForQueueCheck();

  const text = 'The plumber comes on Thursday at ten.';

  ctx.nixie.model.addReplies({
    text: 'Noted.',
    when: (body) => body.tools?.some((tool) => tool.name === 'mcp__nixie__task_start') === true,
  });

  ctx.nixie.checkerModel.addReplies({
    toolUse: { name: 'StructuredOutput', input: { verdict: 'asserted', reason: 'Stated.' } },
  });

  void process.request('sendMessage', { thread: 'conversation', text });

  const message = await ctx.nixie.waitForRecord((record) => record.kind === 'owner_message');

  await waitForCondition(() => ctx.nixie.model.requests.length > 0);

  // The first slot is 21:00 in Sydney, which is clock 39_600_000 ms, and the clock starts at
  // 1_000_000 ms. Moving to within 3 minutes of it first keeps the conversation's own timers out of
  // the advance that follows the seeding.
  await ctx.nixie.harness.advance(38_420_000, { settle: true });

  // The conversation holds task_start and a task does not, so the filter tells their turns apart.
  const taskReplies = [
    {
      toolUse: {
        name: 'mcp__nixie__log_read',
        input: (body: RequestBody) => readModelRequest(body).sinceTimes ?? {},
      },
    },
    {
      toolUse: {
        name: 'mcp__nixie__memory_remember',
        input: (body: RequestBody) => ({
          subject: 'owner',
          gist: 'plumber visit',
          topic: 'home',
          text: 'The plumber comes on Thursday at ten.',
          quote: text,
          eventID: readModelRequest(body).ownerEventID,
        }),
      },
    },
    { toolUse: { name: 'mcp__nixie__task_report', input: { summary: 'Saved 1 memory.' } } },
    { text: 'Done.' },
  ].map((reply) =>
    Object.assign(reply, {
      when: (body: RequestBody) =>
        body.tools?.some((tool) => tool.name === 'mcp__nixie__task_start') !== true,
    }),
  );

  ctx.nixie.model.addReplies(...taskReplies);

  await ctx.nixie.harness.advance(180_000, { settle: true });

  const fired = await ctx.nixie.waitForRecord((record) => record.kind === 'trigger.fired');

  await waitForCondition(async () => {
    const records = await ctx.nixie.readRecords();

    return records.some(
      (record) => record.kind === 'memory.version_added' || record.kind === 'memory.proposed',
    );
  });

  // The conversation can recall memory, so a second message has it read the saved item back.
  const requestsBefore = ctx.nixie.model.requests.length;

  ctx.nixie.model.addReplies(
    {
      toolUse: { name: 'mcp__nixie__memory_recall', input: {} },
      when: (body) => body.tools?.some((tool) => tool.name === 'mcp__nixie__task_start') === true,
    },
    {
      text: 'Read it.',
      when: (body) => body.tools?.some((tool) => tool.name === 'mcp__nixie__task_start') === true,
    },
  );

  const recordsBefore = await ctx.nixie.readRecords();

  const sequenceBefore = recordsBefore.at(-1)?.sequence ?? 0;

  void process.request('sendMessage', { thread: 'conversation', text: 'What do you hold?' });

  // The recall result sits before the system message that carries the report, so it is not the
  // last message of the request.
  const findRecalled = () =>
    ctx.nixie.model.requests
      .slice(requestsBefore)
      .flatMap((request) => request.body?.messages ?? [])
      .find((entry) => JSON.stringify(entry).includes('tool_result'));

  await waitForCondition(() => findRecalled() !== undefined);

  const recalled = findRecalled();

  // A reply that the turn wrote stands unvoided until its step commits, so the kill waits for it.
  await ctx.nixie.waitForRecord(
    (record) =>
      record.kind === 'task.step_committed' &&
      record.thread === 'conversation' &&
      record.sequence > sequenceBefore,
  );

  await process.kill();

  const records = await ctx.nixie.readRecords();
  const oracle = await runOracle(ctx.nixie);

  const taskRequests = ctx.nixie.model.requests.filter(
    (request) =>
      request.body?.tools?.some((tool) => tool.name === 'mcp__nixie__task_start') === false,
  );

  const writes = records.filter(
    (record) => record.kind === 'memory.version_added' || record.kind === 'memory.proposed',
  );

  const [write] = writes;

  invariant(write !== undefined);

  const logRead = readModelRequest(taskRequests[1]?.body).readToolUseInput('mcp__nixie__log_read');
  const since = readModelRequest(taskRequests[0]?.body).sinceTimes;

  expect(fired.payload).toMatchObject({
    definitionID: 'note-taking',
    scheduledFor: '1970-01-01T11:00:00.000Z',
  });

  expect(JSON.stringify(taskRequests[0]?.body)).toContain(String.raw`<input name=\"since\">`);
  expect(logRead).toStrictEqual(since);
  expect(writes).toHaveLength(1);
  expect(write.payload).toMatchObject({ origin: 'task' });

  // The gate decides whether the write applies or waits as a proposal. Either way the cited message
  // backs it: an applied version names the message in its evidence, and a proposal is not filed as
  // unbacked.
  const evidence = write.payload['evidence'];

  const isBacked =
    write.kind === 'memory.version_added'
      ? typeof evidence === 'object' &&
        evidence !== null &&
        'recordSequence' in evidence &&
        evidence.recordSequence === message.sequence
      : write.payload['reviewReason'] !== 'no_quote';

  expect(isBacked).toBe(true);
  expect(records.some((record) => record.kind === 'memory.batch_planned')).toBe(false);

  const resultBlock = z.object({ content: z.string() });
  const recalledMessage = z.object({ content: z.tuple([resultBlock]) });
  const recalledItem = z.object({ quote: z.string() });
  const recallResult = z.object({ items: z.array(recalledItem) });
  const recalledContent = recalledMessage.parse(recalled).content[0].content;
  const recalledItems = recallResult.parse(JSON.parse(recalledContent));

  expect(recalledItems.items.map((item) => item.quote)).toStrictEqual([text]);

  expect(oracle).toStrictEqual({
    repeatedStepKeys: [],
    repeatedActions: [],
    strayCalls: [],
    strayReplies: [],
    heldLeases: [],
    unreadyTasks: [],
    changedEndStates: [],
    projectionDrift: [],
  });
});
