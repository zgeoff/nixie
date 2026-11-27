import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { actionsProjection } from '@heynixie/actions';
import type { Definitions, Log, Writer } from '@heynixie/log';
import { logProjections, parseJSONObject, startWriter } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { tasksProjections } from '@heynixie/tasks';
import {
  buildTestDefinitionStore,
  buildTestRunSettings,
  buildTestTaskRunners,
} from '@heynixie/tasks/test-utils';
import type { ToolOutcome } from '@heynixie/tools';
import { buildMockToolCall, buildMockToolContext } from '@heynixie/tools/test-utils';
import type { TriggerCoreContext, TriggerSource } from '@heynixie/triggers';
import { startTriggerSources, textSources, triggersProjections } from '@heynixie/triggers';
import { buildTestTriggerCore } from '@heynixie/triggers/test-utils';
import type { FakeClock } from '@zgeoff/testing/clock';
import { createFakeClock } from '@zgeoff/testing/clock';
import { buildPhoneConnector } from '../connector/build-phone-connector';
import type { FakePhoneProvider } from '../fake/build-fake-phone-provider';
import { buildFakePhoneProvider } from '../fake/build-fake-phone-provider';
import { buildPhoneSource } from '../source/build-phone-source';
import { phoneSourceID } from '../source/phone-source-id';
import { phoneSendClaimsProjection } from '../store/phone-send-claims-projection';
import { phoneTextsProjection } from '../store/phone-texts-projection';
import { buildPhoneTools } from '../tool/build-phone-tools';
import type { PhoneContext } from '../types';

export interface TestPhone {
  readonly writer: Writer;
  readonly clock: FakeClock;
  readonly tasks: TasksContext;
  readonly core: TriggerCoreContext;
  readonly context: PhoneContext;
  readonly provider: FakePhoneProvider;
  readonly source: TriggerSource;

  // calls a phone tool as the conversation, or as the task whose ID the thread names
  readonly callTool: (tool: string, input: object, thread?: string) => Promise<ToolOutcome>;

  // the queue's connector of a send, which runs on the provider
  readonly connectors: ReturnType<typeof buildPhoneConnector>;

  // each event that nixie logged
  readonly logged: { readonly event: string; readonly fields: unknown }[];
}

export const testPhoneNumber = '+61411111111';

// A log that holds the log, tasks, actions, triggers and phone projections, the phone module over a
// fake provider, and the phone's source, which a test starts with `startTestPhoneSource`. The
// writer's clock is the test clock. The phone fills the core's list of text sources for the test.
export async function startTestPhone(): Promise<TestPhone> {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-phone-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const clock = createFakeClock({ startMs: Date.parse('2027-03-09T00:00:00Z') });

  const writer = await startWriter({ dataDir, clock });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const log: Log = {
    writer,
    deploymentKey,
    projections: [
      ...logProjections,
      ...tasksProjections,
      ...triggersProjections,
      actionsProjection,
      phoneTextsProjection,
      phoneSendClaimsProjection,
    ],
  };

  const definitionStore = buildTestDefinitionStore();

  const tasks: TasksContext = {
    log,
    clock,
    definitions: buildTestDefinitions,
    runSettings: buildTestRunSettings(),
    runners: buildTestTaskRunners(),
    readDefinitionVersion: definitionStore.readDefinitionVersion,
    readDefinitionRunPolicy: definitionStore.readDefinitionRunPolicy,
    readDefinitionNextFire: definitionStore.readDefinitionNextFire,
  };

  const logged: { event: string; fields: unknown }[] = [];

  const logEvent = (event: string, fields: unknown) => {
    logged.push({ event, fields });
  };

  const provider = buildFakePhoneProvider({ now: () => clock.now() });

  const context: PhoneContext = {
    log,
    clock,
    definitions: buildTestDefinitions,
    logEvent,
    provider,
    settings: {
      number: testPhoneNumber,
      pollIntervalMs: 20_000,
      wake: { window: 900_000, reply_expiry: 604_800_000 },
    },
  };

  textSources.set([phoneSourceID]);

  stack.defer(() => {
    textSources.set([]);
  });

  const toolsByName = new Map(buildPhoneTools(context).map((tool) => [tool.name, tool]));

  return {
    writer,
    clock,
    tasks,
    core: buildTestTriggerCore(tasks, logEvent),
    context,
    provider,
    source: buildPhoneSource(context),
    callTool: (name, input, thread = 'conversation') => {
      const tool = toolsByName.get(name);

      if (tool === undefined) {
        throw new Error(`the test holds no tool ${name}`);
      }

      const call = buildMockToolCall({ tool: name, input: parseJSONObject(JSON.stringify(input)) });

      return tool.run(
        call,
        buildMockToolContext({
          run: { thread, tools: [name], session: { key: 'test-session', invalidatedThrough: 0 } },
        }),
      );
    },
    connectors: buildPhoneConnector(context),
    logged,
  };
}

// Starts the phone's source on the trigger core, and stops it when the test ends.
export async function startTestPhoneSource(phone: TestPhone): Promise<void> {
  const sources = await startTriggerSources([phone.source], phone.core);

  onTestFinished(() => sources.stop());
}

function buildTestDefinitions(): Definitions {
  return { snapshotHash: 'sha256:test' };
}
