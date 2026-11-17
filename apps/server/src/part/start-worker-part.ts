import type { Definitions, Log } from '@heynixie/log';
import type { SandboxAdapter } from '@heynixie/sandbox';
import type { WorkerTool } from '@heynixie/sessions';
import { startWorkerTool } from '@heynixie/sessions';
import type { SpendContext } from '@heynixie/spend';
import type { ToolEndpoint } from '@heynixie/tools';
import { toImageNames } from '../sandbox/to-image-names';
import type { ServerPartsOptions } from '../server/start-server';

export interface WorkerPartInputs {
  readonly options: Pick<
    ServerPartsOptions,
    'cleanup' | 'config' | 'harness' | 'images' | 'log' | 'secrets' | 'spend'
  >;
  readonly adapter: SandboxAdapter;
  readonly log: Log;
  readonly definitions: () => Definitions;
  readonly readTools: () => Pick<ToolEndpoint, 'startRun'> | null;
  readonly spend: SpendContext | undefined;
}

// A deployment with no worker role gets no worker tool, so the model never sees a tool that every
// call would refuse.
export async function startWorkerPart(inputs: WorkerPartInputs): Promise<WorkerTool | null> {
  const config = inputs.options.config;

  if (config.models.roles.worker === undefined) {
    return null;
  }

  const clock =
    inputs.options.harness === undefined
      ? inputs.log.writer.clock
      : inputs.options.harness.link.clock;

  const worker = await startWorkerTool({
    models: config.models,
    secrets: inputs.options.secrets.models,
    sandboxes: inputs.adapter,
    images: toImageNames(inputs.options.images),
    log: inputs.log,
    definitions: inputs.definitions,
    clock,
    logger: inputs.options.log,
    readTools: inputs.readTools,
    ...(inputs.options.spend === null ? {} : { gateway: inputs.options.spend.gateway }),
    ...(inputs.spend === undefined ? {} : { spend: inputs.spend }),
    ...(config.tasks.workerRuns === undefined ? {} : { workerRuns: config.tasks.workerRuns }),
  });

  await inputs.options.cleanup.defer(() => worker.stop());

  return { buildTool: worker.buildTool };
}
