import type { ConsolidationConfig, MemoryConsolidator, StartedMemoryStore } from '@heynixie/memory';
import {
  buildConsolidatorTools,
  createConsolidationStaging,
  memoryConsolidatorTaskID,
  startMemoryConsolidator,
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

export interface MemoryConsolidatorRunnerOptions {
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
  readonly config: ConsolidationConfig;

  // the persona in force, read at each run
  readonly getPersona: () => string;

  // your name, which the consolidator's rules call you by, or null to call you "the owner"
  readonly ownerName: string | null;
  readonly onError: (error: unknown) => void;

  // the action queue the server's tool endpoints share, which none of the consolidator's tools reaches,
  // since each runs direct
  readonly queue: ActionQueue;
}

export interface MemoryConsolidatorRunner extends MemoryConsolidator {
  readonly stop: () => Promise<void>;
}

// Starts the memory consolidator on the memory-consolidator role's profile, in its own long-lived
// sandbox on the conversation image. Its tool endpoint serves only recall and consolidate, on the
// run socket the sandbox adapter resolves for the consolidator's task.
export async function startMemoryConsolidatorRunner(
  options: MemoryConsolidatorRunnerOptions,
): Promise<MemoryConsolidatorRunner> {
  const started = new AsyncDisposableStack();

  try {
    const consolidator = await startConsolidatorParts(options, (stop) => {
      started.defer(stop);
    });

    const stack = started.move();

    return { ...consolidator, stop: () => stack.disposeAsync() };
  } catch (error) {
    // the server retries a failed start, and each retry opens the run socket again
    await started.disposeAsync();

    throw error;
  }
}

// the endpoint and the session runner, each deferred to stop in reverse order, then the task
async function startConsolidatorParts(
  options: MemoryConsolidatorRunnerOptions,
  defer: (stop: () => Promise<void>) => void,
): Promise<MemoryConsolidator> {
  const staging = createConsolidationStaging();
  const tools = buildConsolidatorTools(options.store, staging, options.config.topItems);

  const endpoint = await startConsolidatorEndpoint(options, tools);

  defer(() => endpoint.stop());

  const runner = await startSessionRunner({
    context: options.context,
    profile: resolveConsolidatorProfile(options),
    sandboxes: options.sandboxes,
    tools: endpoint,
    toolNames: tools.map((tool) => tool.name),
    taskID: memoryConsolidatorTaskID,
    image: options.image,
    limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 4096 },
    command: buildGuestCommand(options.sandboxes),
  });

  defer(() => runner.stop());

  return startMemoryConsolidator({
    context: options.context,
    store: options.store,
    staging,
    model: {
      model: runner.model.model,
      profile: runner.model.profile,
      runSession: runner.runSession,
    },
    config: options.config,
    getPersona: options.getPersona,
    ownerName: options.ownerName,
    onError: options.onError,
  });
}

function resolveConsolidatorProfile(options: MemoryConsolidatorRunnerOptions): ResolvedProfile {
  const credentials = resolveModelCredentials(options.models, options.secrets);
  const profile = resolveRoleProfile(options.models, 'memory-consolidator');
  const resolved = credentials[profile.id];

  // the credentials resolve for every profile, or resolveModelCredentials throws first
  invariant(resolved, `the memory consolidator profile ${profile.id} has no credential`);

  return resolved;
}

// the consolidator's own tool endpoint, on the run socket the sandbox adapter resolves for its task
function startConsolidatorEndpoint(
  options: MemoryConsolidatorRunnerOptions,
  tools: ReturnType<typeof buildConsolidatorTools>,
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
    queue: options.queue,
  });
}
