import type { CodingAdapter, CodingContext, CodingRunner } from '@heynixie/coding';
import { buildCodingRunner, buildCodingSettings, buildStartCursorStore } from '@heynixie/coding';
import { buildATCAdapter } from '@heynixie/coding-atc';
import type { Secrets } from '@heynixie/credentials';
import type { Logger } from '@heynixie/logger';
import type { TasksContext } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import type { DeploymentConfig } from '../deployment/deployment-config-schema';

export interface ServerCodingOptions {
  readonly config: Pick<DeploymentConfig, 'coding' | 'owner'>;
  readonly secrets: Pick<Secrets, 'atcToken'>;
  readonly log: Logger;

  // a test build's gateway, in place of the configured one
  readonly testGatewayURL: string | null;
}

type BoundTasks = Omit<TasksContext, 'runners'>;

export interface ServerCoding {
  readonly adapter: CodingAdapter;
  readonly context: CodingContext;
  readonly runner: CodingRunner;

  // Gives the context the tasks context. The registry that the tasks context holds names the
  // coding runner, and the runner reads that context, so the context comes after the runner.
  readonly bindTasks: (tasks: BoundTasks) => void;
}

// The coding runner and its adapter, or null when the config sets no `coding.atc` block, which
// starts nixie with no coding runner.
export function buildServerCoding(options: ServerCodingOptions): ServerCoding | null {
  const coding = options.config.coding;
  const atc = coding?.atc;

  if (coding === undefined || atc === undefined) {
    return null;
  }

  if (options.secrets.atcToken === null) {
    throw new Error(
      `coding.atc.token is ${atc.token}, and the secrets file has no atc_token entry`,
    );
  }

  const settings = buildCodingSettings(coding, atc);
  const bound: { tasks: BoundTasks | null } = { tasks: null };

  const context: CodingContext = {
    get tasks() {
      invariant(bound.tasks !== null, 'the coding runner ran before the server bound its context');

      return bound.tasks;
    },
    settings,
    logEvent: options.log,
    ownerName: options.config.owner.name ?? 'the user',
  };

  const adapter = buildATCAdapter({
    url: options.testGatewayURL ?? atc.url,
    token: options.secrets.atcToken,
    targets: settings.targets,
    log: options.log,
    cursors: buildStartCursorStore(context, 'atc', Date.now),

    // a gateway double changes a session's state at a journey's command, so the read comes soon
    ...(options.testGatewayURL === null ? {} : { stateReadMs: 1000 }),
  });

  options.log('coding.configured', { adapter: adapter.id, principal: atc.principal });

  return {
    adapter,
    context,
    runner: buildCodingRunner(context, adapter),
    bindTasks: (tasks) => {
      bound.tasks = tasks;
    },
  };
}
