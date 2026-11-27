import { expect } from 'bun:test';
import { parseJSONObject } from '@heynixie/log';
import type { TaskRunnerDefinition, TasksContext } from '@heynixie/tasks';
import { buildStepRunID } from '@heynixie/tasks';
import { buildMockTaskStartBounds, createTestConversationClaim } from '@heynixie/tasks/test-utils';
import { buildMockToolCall, buildMockToolContext } from '@heynixie/tools/test-utils';
import type { TriggerContext } from '@heynixie/triggers';
import { deliverTriggerBatch } from '@heynixie/triggers';
import { buildTestTriggerCore } from '@heynixie/triggers/test-utils';
import { waitFor } from '@zgeoff/testing';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { buildCodingRunner } from '../runner/build-coding-runner';
import { buildCodingSource } from '../source/build-coding-source';
import { buildCodingStartTool } from '../tool/build-coding-start-tool';
import { buildCodingTools } from '../tool/build-coding-tools';
import type { CodingContext, CodingSettings } from '../types';
import type { FakeCodingAdapter } from './build-fake-coding-adapter';
import { buildFakeCodingAdapter } from './build-fake-coding-adapter';

export const testCodingSettings: CodingSettings = {
  wake: {
    started: ['waiting', 'idle', 'blocked', 'decision', 'ended', 'gone'],
    joined: ['waiting', 'ended', 'gone'],
  },
  targets: [
    { daemon: 'laptop', target: 'local' },
    { daemon: 'cloud', target: 'cloud' },
  ],
  defaultTarget: { daemon: 'cloud', target: 'cloud' },
  toolWaitMs: 0,
};

export interface WiredTestCoding {
  readonly adapter: FakeCodingAdapter;
  readonly definition: TaskRunnerDefinition;
  readonly coding: CodingContext;
}

// A coding runner on a fake adapter, for a harness that builds the tasks context itself: the harness
// puts the definition in its registry.
export function wireTestCoding(base: CodingContext['tasks']): WiredTestCoding {
  const adapter = buildFakeCodingAdapter();

  const coding: CodingContext = {
    tasks: base,
    settings: testCodingSettings,
    ownerName: 'the user',
    logEvent: () => {},
  };

  return { adapter, definition: buildCodingRunner(coding, adapter).definition, coding };
}

export interface JoinedSessionSeed {
  // the fake's session ID
  readonly id: string;
  readonly name: string;
  readonly state: 'running' | 'waiting' | 'idle';
}

// Adds a session that runs outside nixie, then joins it from a conversation step, as the model does
// with coding.sessions and coding.start. Returns the ID of the coding task.
export async function seedJoinedSession(
  wired: WiredTestCoding,
  context: TasksContext,
  seed: JoinedSessionSeed,
): Promise<string> {
  wired.adapter.addSession({ id: seed.id, name: seed.name, state: seed.state });

  const claim = await createTestConversationClaim(context, 'Join my session.');

  const toolContext = { ...wired.coding, tasks: context };

  const tools = new Map(
    [
      ...buildCodingTools(toolContext, wired.adapter),
      buildCodingStartTool(toolContext, wired.adapter, {
        messaging: { hopLimit: context.runSettings.hopLimit, ownerName: null },
        bounds: buildMockTaskStartBounds(),
      }),
    ].map((tool) => [tool.name, tool]),
  );

  const callTool = (name: string, input: object) => {
    const tool = tools.get(name);

    invariant(tool, `the test holds the tool ${name}`);

    const call = buildMockToolCall({ tool: name, input: parseJSONObject(JSON.stringify(input)) });
    const stepRunID = buildStepRunID(claim);

    return tool.run(
      call,
      buildMockToolContext({ run: { thread: claim.lease.workID, stepRunID, tools: [name] } }),
    );
  };

  const listed = await callTool('coding.sessions', {});

  const shortID = /"id":"(?<id>[^"]+)"/u.exec(JSON.stringify(listed))?.groups?.['id'];

  invariant(shortID !== undefined && shortID !== '', 'coding.sessions lists the session');

  const started = await callTool('coding.start', {
    name: seed.name,
    brief: 'Watch this session.',
    session: shortID,
  });

  invariant(started.status === 'ok', 'the join succeeds');

  return z.object({ taskID: z.string() }).parse(started.result).taskID;
}

// Starts the coding source on the context's log, which lands each event of a bound session on its
// task's thread, once it has read its first cursor. Returns the function that stops it.
export async function startTestCodingSource(
  wired: WiredTestCoding,
  context: TasksContext,
): Promise<() => Promise<void>> {
  const source = buildCodingSource({ ...wired.coding, tasks: context }, wired.adapter);
  const core = buildTestTriggerCore(context);

  const controller = new AbortController();

  const trigger: TriggerContext = {
    cursor: null,
    deliver: (batch) => deliverTriggerBatch(core, source.id, batch),
    reportHealth: () => {},
    signal: controller.signal,
  };

  await source.start(trigger);

  // an event that reaches the trail before the source waits for the next page is one it may skip
  await waitFor(() => {
    expect(wired.adapter.isWaitingForEvents()).toBeTrue();
  });

  return async () => {
    controller.abort();

    await source.stop();
  };
}
