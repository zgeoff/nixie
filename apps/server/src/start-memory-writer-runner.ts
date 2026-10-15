import type { MemoryWriter, StartedMemoryStore, WriterConfig, WriterGate } from '@heynixie/memory';
import {
  buildWriterTools,
  createWriterStaging,
  memoryWriterTaskID,
  startMemoryWriter,
} from '@heynixie/memory';
import type { ModelSecrets, ModelsConfig, ResolvedProfile } from '@heynixie/models';
import { resolveModelCredentials, resolveRoleProfile, startSessionRunner } from '@heynixie/models';
import { makeDecisionPoint } from '@heynixie/policy';
import type { SandboxAdapter } from '@heynixie/sandbox';
import type { TasksContext } from '@heynixie/tasks';
import type { ActionQueue } from '@heynixie/tools';
import { buildToolRegistry, startToolEndpoint } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { buildGuestCommand } from './build-guest-command';

export interface MemoryWriterRunnerOptions {
  readonly context: TasksContext;
  readonly models: ModelsConfig;
  readonly secrets: ModelSecrets;
  readonly sandboxes: SandboxAdapter;

  // the directory of the tool endpoint's run sockets, which the sandbox adapter's tool route
  // resolves each sandbox's owner in
  readonly socketDir: string;

  // the conversation image's name in impd, from the sandbox manifest
  readonly image: string;
  readonly store: StartedMemoryStore;
  readonly gate: WriterGate;
  readonly config: WriterConfig;

  // the persona in force, read at each batch
  readonly getPersona: () => string;

  // your configured name, which the writer's memories use, or null for "the owner"
  readonly ownerName: string | null;
  readonly onError: (error: unknown) => void;
}

export interface MemoryWriterRunner extends MemoryWriter {
  readonly stop: () => Promise<void>;
}

// Starts the memory writer on the memory-writer role's profile, in its own long-lived sandbox on
// the conversation image, never the conversation's. Its tool endpoint serves only the writer's 3
// staging tools, on the run socket the sandbox adapter resolves for the writer's task.
export async function startMemoryWriterRunner(
  options: MemoryWriterRunnerOptions,
): Promise<MemoryWriterRunner> {
  const started = new AsyncDisposableStack();

  try {
    const writer = await startWriterParts(options, (stop) => {
      started.defer(stop);
    });

    const stack = started.move();

    return { ...writer, stop: () => stack.disposeAsync() };
  } catch (error) {
    // the server retries a failed start, and each retry opens the run socket again
    await started.disposeAsync();

    throw error;
  }
}

// the endpoint, the session runner and the writer, each deferred to stop in reverse order
async function startWriterParts(
  options: MemoryWriterRunnerOptions,
  defer: (stop: () => Promise<void>) => void,
): Promise<MemoryWriter> {
  const staging = createWriterStaging();
  const tools = buildWriterTools(options.store, staging, options.config.topItems);

  const endpoint = await startWriterEndpoint(options, tools);

  defer(() => endpoint.stop());

  const runner = await startSessionRunner({
    context: options.context,
    profile: resolveWriterProfile(options),
    sandboxes: options.sandboxes,
    tools: endpoint,
    toolNames: tools.map((tool) => tool.name),
    taskID: memoryWriterTaskID,
    image: options.image,
    limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 4096 },
    command: buildGuestCommand(),
  });

  defer(() => runner.stop());

  const writer = await startMemoryWriter({
    context: options.context,
    store: options.store,
    publish: options.store.writeBatch,
    staging,
    model: {
      model: runner.model.model,
      profile: runner.model.profile,
      runSession: runner.runSession,
    },
    gate: options.gate,
    config: options.config,
    getPersona: options.getPersona,
    ownerName: options.ownerName,
    onError: options.onError,
  });

  defer(() => writer.stop());

  return writer;
}

function resolveWriterProfile(options: MemoryWriterRunnerOptions): ResolvedProfile {
  const credentials = resolveModelCredentials(options.models, options.secrets);
  const profile = resolveRoleProfile(options.models, 'memory-writer');
  const resolved = credentials[profile.id];

  // the credentials resolve for every profile, or resolveModelCredentials throws first
  invariant(resolved, `the memory writer profile ${profile.id} has no credential`);

  return resolved;
}

// The writer's tools stage changes and run direct, so none reaches a queue.
const refusingQueue: ActionQueue = {
  enqueue: () => Promise.reject(new Error('no memory writer tool runs queued')),
  waitForOutcome: () => Promise.resolve(null),
};

// the writer's own tool endpoint, on the run socket the sandbox adapter resolves for its task
function startWriterEndpoint(
  options: MemoryWriterRunnerOptions,
  tools: ReturnType<typeof buildWriterTools>,
): ReturnType<typeof startToolEndpoint> {
  const registry = buildToolRegistry(tools);

  return startToolEndpoint({
    socketDir: options.socketDir,
    registry,
    decide: makeDecisionPoint({
      findDeclaration: (name) => registry.findTool(name)?.definition.declaration ?? null,
    }),
    log: options.context.log,
    definitions: options.context.definitions,
    queue: refusingQueue,
  });
}
