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
import type { DestinationResolution, ToolOutcome, ToolRun } from '@heynixie/tools';
import { buildMockToolCall, buildMockToolContext } from '@heynixie/tools/test-utils';
import type { TriggerCoreContext, TriggerSource } from '@heynixie/triggers';
import { startTriggerSources, triggersProjections } from '@heynixie/triggers';
import { buildTestTriggerCore } from '@heynixie/triggers/test-utils';
import type { FakeClock } from '@zgeoff/testing/clock';
import { createFakeClock } from '@zgeoff/testing/clock';
import { buildMailConnectors } from '../connector/build-mail-connectors';
import { buildMailSource } from '../source/build-mail-source';
import { mailMessagesProjection } from '../store/mail-messages-projection';
import { buildMailTools } from '../tool/build-mail-tools';
import type { MailHTMLReader, MailPorts, MailToolContext } from '../types';
import type { MemoryMailHost } from './build-memory-mail-host';
import { buildMemoryMailHost } from './build-memory-mail-host';
import type { TestHTMLReader } from './build-test-html-reader';
import { buildTestHTMLReader } from './build-test-html-reader';
import type { TestMailPorts } from './build-test-mail-ports';
import { buildTestMailPorts } from './build-test-mail-ports';

export interface TestMail {
  readonly writer: Writer;
  readonly clock: FakeClock;
  readonly tasks: TasksContext;
  readonly core: TriggerCoreContext;
  readonly context: MailToolContext;
  readonly host: MemoryMailHost;

  // the reader of a mail's HTML, which a test tells what each HTML reads as
  readonly html: TestHTMLReader;

  // the files and the links that the mail tools use, in memory unless the test wired its own
  readonly files: TestMailPorts;
  readonly source: TriggerSource;

  // calls a mail tool as the conversation, or as the task whose ID the thread names, in one session
  // for the whole test
  readonly callTool: (tool: string, input: object, thread?: string) => Promise<ToolOutcome>;

  // the destinations that a mail tool names for a call, as the decision point reads them
  readonly resolveDestinations: (
    tool: string,
    input: object,
    run?: Pick<ToolRun, 'session'>,
  ) => Promise<DestinationResolution>;

  // the queue's connector of a send or a reply, which runs on the host
  readonly connectors: ReturnType<typeof buildMailConnectors>;

  // each event that nixie logged
  readonly logged: { readonly event: string; readonly fields: unknown }[];
}

export const testMailAddress = 'assistant@nixie.example.org';

export interface StartTestMailOptions {
  // the ports of the tools, built over the test's log, in place of the ones in memory
  readonly buildPorts?: (log: Log) => MailPorts;

  // the reader of a mail's HTML, in place of the one that a test answers by hand
  readonly reader?: MailHTMLReader;
}

// A log that holds the log, tasks, actions, triggers and mail projections, the mail module over an
// in-memory host, and the mailbox source, which a test starts with `startTestMailSource`. The writer's
// clock is the test clock.
export async function startTestMail(options: StartTestMailOptions = {}): Promise<TestMail> {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-mail-'));

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
      mailMessagesProjection,
    ],
  };

  const definitionStore = buildTestDefinitionStore();
  const definitions = buildTestDefinitions;

  const tasks: TasksContext = {
    log,
    clock,
    definitions,
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

  const host = buildMemoryMailHost({ address: testMailAddress, now: () => clock.now() });
  const files = buildTestMailPorts();

  const context: MailToolContext = {
    log,
    clock,
    definitions,
    logEvent,
    tasks,
    ports: options.buildPorts?.(log) ?? files,
    settings: {
      address: testMailAddress,
      hostPollIntervalMs: 30_000,
      wake: { window: 900_000, reply_expiry: 604_800_000 },
      linkPathChars: 24,
    },
  };

  const html = buildTestHTMLReader();

  const toolsByName = new Map(
    buildMailTools(context, options.reader ?? html).map((tool) => [tool.name, tool]),
  );

  return {
    writer,
    clock,
    tasks,
    core: buildTestTriggerCore(tasks, logEvent),
    context,
    host,
    html,
    files,
    source: buildMailSource(context, host),
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
    resolveDestinations: (name, input, run) => {
      const tool = toolsByName.get(name);

      if (tool?.resolveDestinations === undefined) {
        throw new Error(`the test holds no tool ${name} that resolves destinations`);
      }

      return tool.resolveDestinations(
        parseJSONObject(JSON.stringify(input)),
        buildMockToolContext({ run: { tools: [name], ...run } }),
      );
    },
    connectors: buildMailConnectors(context, host),
    logged,
  };
}

// Starts the mailbox source on the trigger core, and stops it when the test ends.
export async function startTestMailSource(mail: TestMail): Promise<void> {
  const sources = await startTriggerSources([mail.source], mail.core);

  onTestFinished(() => sources.stop());
}

function buildTestDefinitions(): Definitions {
  return { snapshotHash: 'sha256:test' };
}
