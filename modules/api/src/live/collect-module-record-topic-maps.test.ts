import { expect, onTestFinished, test } from 'bun:test';
import { makeHandoverRecords } from '@heynixie/connectors';
import { buildStubImageProvider, startTestImages } from '@heynixie/connectors/test-utils';
import { buildTaskChangeKind } from '@heynixie/definitions';
import { buildTestTaskSeed } from '@heynixie/definitions/test-utils';
import { readRecords, withWriteTransaction } from '@heynixie/log';
import { defaultGateLimits, defaultOwnerPronouns, startMemoryStore } from '@heynixie/memory';
import { buildAllowVerdict, buildMockWriteCaller } from '@heynixie/memory/test-utils';
import { buildNotebookMemory, defaultNotebookSettings, startNotebook } from '@heynixie/notebook';
import { buildNotebookToolCaller } from '@heynixie/notebook/test-utils';
import { buildPromptWriteTool } from '@heynixie/prompts';
import { startSpendWatcher } from '@heynixie/spend';
import { buildMockGatewayStatus } from '@heynixie/spend/test-utils';
import { createConversationTask, createTask } from '@heynixie/tasks';
import { waitForCondition } from '@heynixie/testing';
import { buildMockToolCall, buildMockToolContext } from '@heynixie/tools/test-utils';
import {
  deliverTriggerBatch,
  writeArmedDefinitions,
  writeTriggerDeferral,
} from '@heynixie/triggers';
import {
  buildTestArmedDefinition,
  buildTestTriggerCore,
  buildTestTriggerEvent,
} from '@heynixie/triggers/test-utils';
import invariant from 'tiny-invariant';
import { buildSeeder } from '../test-utils/build-seeder';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';
import { startTestAPIDefinitions } from '../test-utils/start-test-api-definitions';
import { defaultAPISettings } from '../utils/default-api-settings';
import { readHeadSequence } from '../utils/read-head-sequence';
import { collectModuleRecordTopicMaps } from './collect-module-record-topic-maps';

// The tests below make each change that a topic names, through the code that makes it in nixie,
// and read the changed event of a stream that opened after the test's own setup.
async function setupTest() {
  const api = await startTestAPI(defaultAPISettings, { isSpendOn: true });

  await createConversationTask(api.context);

  const definitions = api.context.definitions;

  const memory = await startMemoryStore({
    log: api.context.log,
    definitions,
    cleanupSessions: () => Promise.resolve(),
    gate: {
      check: () =>
        Promise.resolve({
          verdict: 'unsure',
          reason: 'no checker is wired',
          model: 'no-checker',
          failure: 'error',
        }),
      clock: api.clock,
      defaultZone: 'UTC',
      limits: defaultGateLimits,
      ownerName: null,
      ownerPronouns: defaultOwnerPronouns,
      getPromptsInForce: () => ({ snapshotHash: 'sha256:test', prompts: {} }),
    },
  });

  onTestFinished(() => memory.stop());

  const notebook = await startNotebook({
    log: api.context.log,
    definitions,
    clock: api.clock,
    settings: defaultNotebookSettings,
    memory: buildNotebookMemory(() => memory),
    cleanupSessions: () => Promise.resolve(),
    readRunningStep: () => Promise.resolve(null),
  });

  onTestFinished(() => notebook.stop());

  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  const topicsByKind = new Map<string, readonly string[]>(
    collectModuleRecordTopicMaps().flatMap((topics) => Object.entries(topics)),
  );

  return {
    ...api,
    memory,
    notebook,
    seed: buildSeeder(api),
    client,
    callNotebookTool: buildNotebookToolCaller(() => notebook),
    startImages: () =>
      startTestImages({
        providers: { main: buildStubImageProvider(), second: buildStubImageProvider() },
        log: api.context.log,
      }),
    readHeadSequence: () => readHeadSequence(api.context),

    // the topics the registered maps give each record written after the sequence
    readWrittenTopics: async (afterSequence: number) => {
      const written = await readRecords(api.context.log, { afterSequence });

      return written.map((entry) => ({
        kind: entry.record.kind,
        topics: topicsByKind.get(entry.record.kind),
      }));
    },
    promptWriteTool: buildPromptWriteTool({
      log: api.context.log,
      readInForce: () => ({
        snapshotHash: 'sha256:test',
        personaVersion: 'persona-a',
        prompts: {},
      }),
      checkProposal: () => [],
    }),
    writeHandoverClosed: () =>
      makeHandoverRecords({ log: api.context.log, definitions }).writeClosed({
        by: 'assistant',
        waitedSeconds: 3,
      }),
    writeExportMoved: () =>
      withWriteTransaction(api.writer, (tx) =>
        buildTaskChangeKind({
          log: api.context.log,
          tasks: buildTestTaskSeed(),
          onHeld: () => {},
        }).writeState(tx, {
          approvalID: 'export-1',
          to: 'exporting',
          at: api.clock.now(),
        }),
      ),
    armConversationDefinition: () =>
      withWriteTransaction(api.writer, (tx) =>
        writeArmedDefinitions(tx, { log: api.context.log, definitions }, [
          buildTestArmedDefinition({ target: 'conversation' }),
        ]),
      ),
    deliverTrigger: (event: Parameters<typeof buildTestTriggerEvent>[0]) =>
      deliverTriggerBatch(buildTestTriggerCore(api.context), 'schedule', {
        cursor: null,
        events: [buildTestTriggerEvent(event)],
      }),
    deferTrigger: () =>
      withWriteTransaction(api.writer, (tx) =>
        writeTriggerDeferral(
          tx,
          { log: api.context.log, definitions },
          { definitionID: 'water-the-tomatoes', slotMs: 1_000_000, untilMs: null },
        ),
      ),

    // opens a page stream, and reads the changed event that the next write sends it
    follow: async () => {
      const stream = await client.live.follow({});

      await stream.next();

      return {
        readChanged: async () => {
          const next = await stream.next();

          await stream.return(undefined);

          return next.value;
        },
      };
    },
  };
}

test('it sends a changed event with the computer and tasks topics when a handover closes', async () => {
  const ctx = await setupTest();
  const changes = await ctx.follow();

  await ctx.writeHandoverClosed();

  const changed = await changes.readChanged();

  expect(changed).toStrictEqual({
    kind: 'changed',
    topics: ['computer', 'tasks'],
  });
});

test('it sends a changed event with the definitions topic when a task export moves', async () => {
  const ctx = await setupTest();

  await startTestAPIDefinitions(ctx);

  const changes = await ctx.follow();

  await ctx.writeExportMoved();

  const changed = await changes.readChanged();

  expect(changed).toStrictEqual({ kind: 'changed', topics: ['definitions'] });
});

test('it sends a changed event with the images topic when an image is pinned', async () => {
  const ctx = await setupTest();
  const images = await ctx.startImages();
  const drawn = await images.read('image.draw', { prompt: 'a cove' });
  const changes = await ctx.follow();

  const imageID = drawn['image'];

  invariant(typeof imageID === 'string');

  await images.call('image.pin', { image: imageID });

  const changed = await changes.readChanged();

  expect(changed).toStrictEqual({ kind: 'changed', topics: ['images'] });
});

test('it sends a changed event with the memory topic when a covered pin leaves its notice', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.remember({
    text: 'Takes the early ferry on Mondays',
    provenance: {
      origin: 'conversation',
      source: 'owner',
      taskID: 'conversation',
      proposalID: null,
      checks: null,
    },
  });

  const changes = await ctx.follow();
  const headSequence = await ctx.readHeadSequence();

  await ctx.memory.writes.pin({
    target: item,
    caller: buildMockWriteCaller(),
    verdict: buildAllowVerdict(),
  });

  const changed = await changes.readChanged();
  const written = await ctx.readWrittenTopics(headSequence);

  expect(changed).toStrictEqual({ kind: 'changed', topics: ['memory'] });

  expect(written).toStrictEqual([
    { kind: 'memory.pinned', topics: ['memory'] },
    { kind: 'memory.pin_noticed', topics: ['memory'] },
  ]);
});

test('it sends a changed event with the notebook topic when a note is read', async () => {
  const ctx = await setupTest();

  const written = await ctx.notebook.write(
    { writer: 'conversation', model: 'model-a' },
    { title: 'Why the boiler trips', body: 'After cold nights.' },
  );

  invariant(written.status === 'written');

  const changes = await ctx.follow();

  await ctx.callNotebookTool('notebook.read', { note: written.shortID });

  const changed = await changes.readChanged();

  expect(changed).toStrictEqual({ kind: 'changed', topics: ['notebook'] });
});

test('it sends a changed event with the tasks, triggers and definitions topics when a trigger fires', async () => {
  const ctx = await setupTest();

  await ctx.armConversationDefinition();

  const changes = await ctx.follow();

  await ctx.deliverTrigger({});

  const changed = await changes.readChanged();

  expect(changed).toStrictEqual({
    kind: 'changed',
    topics: ['tasks', 'triggers', 'definitions'],
  });
});

test('it sends a changed event with the tasks, triggers and definitions topics when a trigger skips', async () => {
  const ctx = await setupTest();

  await ctx.armConversationDefinition();

  const changes = await ctx.follow();

  await ctx.deliverTrigger({ skip: 'catch_up_off' });

  const changed = await changes.readChanged();

  expect(changed).toStrictEqual({
    kind: 'changed',
    topics: ['tasks', 'triggers', 'definitions'],
  });
});

test('it sends a changed event with the triggers and definitions topics when a trigger defers', async () => {
  const ctx = await setupTest();
  const changes = await ctx.follow();

  await ctx.deferTrigger();

  const changed = await changes.readChanged();

  expect(changed).toStrictEqual({
    kind: 'changed',
    topics: ['triggers', 'definitions'],
  });
});

test('it sends a changed event with the nixie and tasks topics when the owner pauses nixie', async () => {
  const ctx = await setupTest();
  const changes = await ctx.follow();

  await ctx.client.nixie.pause({ clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60' });

  const changed = await changes.readChanged();

  expect(changed).toStrictEqual({
    kind: 'changed',
    topics: ['nixie', 'tasks'],
  });
});

test('it sends a changed event with the tasks topic when the owner sends a message', async () => {
  const ctx = await setupTest();
  const changes = await ctx.follow();

  await ctx.client.conversation.send({
    clientMessageId: '00000000-0000-4000-8000-000000000001',
    thread: 'conversation',
    text: 'one',
    spans: [{ start: 0, end: 3, source: 'typed' }],
  });

  const changed = await changes.readChanged();

  expect(changed).toStrictEqual({ kind: 'changed', topics: ['tasks'] });
});

test('it sends a changed event with the approvals topic when a prompt override is proposed', async () => {
  const ctx = await setupTest();
  const changes = await ctx.follow();

  await ctx.promptWriteTool.run(
    buildMockToolCall({
      callID: 'call-1',
      tool: 'prompt_write',
      input: {
        id: 'compaction',
        entry: { safety: 'prompts/compaction-safety.md' },
        files: [{ path: 'prompts/compaction-safety.md', text: 'Answer with the summary alone.\n' }],
        reason: 'The summaries ramble past the word target.',
      },
    }),
    buildMockToolContext({ run: { runID: 'run-1' } }),
  );

  const changed = await changes.readChanged();

  expect(changed).toStrictEqual({ kind: 'changed', topics: ['approvals'] });
});

test('it sends a changed event with the triggers and definitions topics when a definition is armed', async () => {
  const ctx = await setupTest();
  const changes = await ctx.follow();

  await ctx.armConversationDefinition();

  const changed = await changes.readChanged();

  expect(changed).toStrictEqual({
    kind: 'changed',
    topics: ['triggers', 'definitions'],
  });
});

test('it sends a changed event with the backups topic when a backup fails', async () => {
  const ctx = await setupTest();
  const changes = await ctx.follow();

  await ctx.seed.failedBackupNotice({ failure: 'data: backup exited 1' });

  const changed = await changes.readChanged();

  expect(changed).toStrictEqual({ kind: 'changed', topics: ['backups'] });
});

test('it sends a changed event with the spend topic when the gateway stops answering', async () => {
  const ctx = await setupTest();
  const changes = await ctx.follow();

  const stopping = new AbortController();

  const spend = ctx.context.spend;

  invariant(spend !== undefined, 'the test API holds a spend context when spend is on');

  onTestFinished(() => {
    stopping.abort();
  });

  ctx.spendGateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  startSpendWatcher({
    context: spend,
    limits: {
      day: { dollars: 60, tokens: 80_000_000 },
      month: { dollars: 600, tokens: 600_000_000 },
    },
    log: () => {},
    intervalMs: 20,
    signal: stopping.signal,
    isStartUnreachable: false,
  });

  // the first poll set what the next one compares to, so a poll that starts after the first has
  // ended reads the change
  await waitForCondition(() => ctx.spendGateway.readStatus.mock.calls.length >= 2);

  // no stop is written for 30 s of no answer, so only the watcher's own notice tells the stream
  ctx.spendGateway.readStatus.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  const changed = await changes.readChanged();

  expect(changed).toStrictEqual({ kind: 'changed', topics: ['spend'] });
});

test('it sends a changed event with the tasks and definitions topics when a task is created', async () => {
  const ctx = await setupTest();
  const changes = await ctx.follow();

  await createTask(ctx.context, 'Plan the beds.', 'k3x9m2p7qa');

  const changed = await changes.readChanged();

  expect(changed).toStrictEqual({
    kind: 'changed',
    topics: ['tasks', 'definitions'],
  });
});
