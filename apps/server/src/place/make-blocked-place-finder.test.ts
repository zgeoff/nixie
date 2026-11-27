import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPathSource } from '@heynixie/definitions';
import { buildTestTaskSeed } from '@heynixie/definitions/test-utils';
import { writeRecords } from '@heynixie/log';
import { writePlaceAdded, writePlaceRemoved } from '@heynixie/policy';
import { buildPolicyCall } from '@heynixie/policy/test-utils';
import { buildTestRunSettings, buildTestTaskRunners } from '@heynixie/tasks/test-utils';
import { toolCalledCodec } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { runDefinitionsSeed } from '../definition/run-definitions-seed';
import { runQueuedInForceSeed } from '../seed/run-queued-in-force-seed';
import type { SeedParts } from '../seed/run-queued-seed';
import { createServerContext } from '../server/create-server-context';
import { startTestLog } from '../test-utils/start-test-log';
import { buildStartState } from '../utils/build-start-state';
import { makeServerDecisions } from '../utils/make-server-decisions';
import { makeBlockedPlaceFinder } from './make-blocked-place-finder';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-blocked-places-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const started = await startTestLog(dataDir);

  stack.defer(() => started.writer.stop());

  const root = join(dataDir, 'definitions');

  await mkdir(root);
  await writeFile(join(root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(root, 'persona.md'), '# Persona\n');

  const context = await createServerContext(started.writer, started.deploymentKey, () => null, {
    runSettings: buildTestRunSettings(),
    taskRunLimits: { turns: 25, dollars: 2 },
    defaultZone: 'Europe/Lisbon',
    features: [],
    runners: buildTestTaskRunners(),
  });

  const parts: SeedParts = {
    context: context.apiContext,
    source: createPathSource({ directory: root }),
    tasks: buildTestTaskSeed(),
    buildPolicy: () => ({ rules: [], tools: [] }),
    inForce: context.inForce,
    state: buildStartState({ isReady: true, reason: null }),
    log: () => {},
  };

  await runDefinitionsSeed(parts);

  const log = context.apiContext.log;

  const places = {
    log,
    definitions: context.apiContext.definitions,
    publishSnapshot: async () => {
      await runQueuedInForceSeed(parts);
    },
  };

  const decide = makeServerDecisions({
    log,
    linkMaxAgeMs: 1000,
    readCheck: () => null,
    readOwnerDestinations: () => Promise.resolve([]),
  })(() => ({
    effects: ['fetch'],
    destinations: ['url'],
    amount: null,
    content: [],
    results: {},
  }));

  return {
    decideFetch: (url: string) =>
      decide(
        buildPolicyCall({
          tool: 'web_fetch',
          args: { url },
          destinations: [{ value: url, replyTarget: false }],
          snapshot: context.apiContext.definitions().snapshotHash,
        }),
      ),
    startFinder: makeBlockedPlaceFinder(log),
    addBlock: async (domain: string) => {
      const added = await writePlaceAdded(places, {
        key: { kind: 'site', domain, subdomains: true },
        trust: 'blocked',
        name: null,
        addedBy: 'you',
      });

      invariant(added.status === 'added');

      return added;
    },
    removePlace: (placeID: string) => writePlaceRemoved(places, placeID),
    recordCall: async () => {
      const [called] = await writeRecords(log, [
        {
          kind: toolCalledCodec.kind,
          definitions: context.apiContext.definitions(),
          thread: 'conversation',
          payload: toolCalledCodec.encode({
            callID: 'call-1',
            runID: 'run-1',
            toolUseID: 'toolu_1',
            tool: 'web_fetch',
            model: 'claude-test-1',
            profile: 'chat-direct',
          }),
        },
      ]);

      invariant(called);

      return called.sequence;
    },
  };
}

test('it finds the short ID of a site that the call snapshot blocks, for a subdomain of it', async () => {
  const ctx = await setupTest();
  const added = await ctx.addBlock('tracker.example.org');
  const callSequence = await ctx.recordCall();
  const found = await ctx.startFinder(callSequence)('https://cdn.tracker.example.org/page?q=1');

  expect(found).toBe(added.shortID);
});

test('it finds nothing for a site that is no place, and nothing for a URL that is no address', async () => {
  const ctx = await setupTest();

  await ctx.addBlock('tracker.example.org');

  const sequence = await ctx.recordCall();

  const find = ctx.startFinder(sequence);

  const found = await Promise.all([find('https://library.example.org/'), find('not a url')]);

  expect(found).toStrictEqual([null, null]);
});

test('it finds nothing for a block that came after the call snapshot', async () => {
  const ctx = await setupTest();
  const callSequence = await ctx.recordCall();

  await ctx.addBlock('tracker.example.org');

  const found = await ctx.startFinder(callSequence)('https://tracker.example.org/');

  expect(found).toBeNull();
});

test('it still finds a block that was removed between the call snapshot and a hop', async () => {
  const ctx = await setupTest();
  const added = await ctx.addBlock('tracker.example.org');
  const callSequence = await ctx.recordCall();

  const find = ctx.startFinder(callSequence);

  await ctx.removePlace(added.placeID);

  const blocked = await find('https://tracker.example.org/');

  expect(blocked).toBe(added.shortID);
});

test('it denies the next call to a site that a block added through the writer covers', async () => {
  const ctx = await setupTest();

  await ctx.addBlock('tracker.example.org');

  const policy = await ctx.decideFetch('https://cdn.tracker.example.org/page');

  expect(policy.decision.outcome).toBe('deny');
});
