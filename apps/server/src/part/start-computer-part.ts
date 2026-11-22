import { join } from 'node:path';
import type { ComputerTools } from '@heynixie/connectors';
import { buildComputerTools, startComputer } from '@heynixie/connectors';
import type { Log } from '@heynixie/log';
import { makeOwnerTypedCheck } from '@heynixie/memory';
import type { SandboxAdapter } from '@heynixie/sandbox';
import { isTestSandbox } from '@heynixie/sandbox';
import { makeSecretFinder } from '@heynixie/secret-scan';
import { getSandboxImage } from '../sandbox/get-sandbox-image';
import type { Secrets } from '../server/load-secrets';
import type { ServerPartsOptions } from '../server/start-server';

export interface ComputerPartInputs {
  readonly options: Pick<
    ServerPartsOptions,
    'sandbox' | 'images' | 'config' | 'cleanup' | 'log'
  > & {
    readonly secrets: Pick<Secrets, 'collectOwnValues'>;
  };
  readonly adapter: SandboxAdapter;
  readonly log: Pick<Log, 'deploymentKey' | 'writer'>;
}

const imageArgv = {
  browser: ['/usr/local/bin/bun', '/app/browser.js'],
  shell: ['/usr/local/bin/bun', '/app/shell.js'],
} as const;

const testArgv = {
  browser: [process.execPath, join(import.meta.dir, '../../../../guests/browser/src/test-main.ts')],
  shell: [process.execPath, join(import.meta.dir, '../../../../guests/shell/src/test-main.ts')],
} as const;

// The assistant's browser and shell: two long-lived sandboxes and the tools that drive them.
export async function startComputerPart(inputs: ComputerPartInputs): Promise<ComputerTools> {
  const options = inputs.options;
  const webFetch = options.config.web_fetch;
  const publicEgress = options.sandbox.adapter === 'imp' ? options.sandbox.imp.publicEgress : null;

  const computer = startComputer({
    adapter: inputs.adapter,
    images: {
      browser: getSandboxImage(options.images, 'browser').name,
      shell: getSandboxImage(options.images, 'shell').name,
    },
    argv: isTestSandbox(inputs.adapter) ? testArgv : imageArgv,
    deniedRanges: [...(publicEgress?.hostAddresses ?? []), ...(publicEgress?.egressDeny ?? [])],
    timeZone: options.config.time.default_zone,
    logger: options.log,
  });

  await options.cleanup.defer(() => computer.stop());

  return buildComputerTools({
    computer,
    log: inputs.log,
    findSecret: makeSecretFinder(
      options.secrets.collectOwnValues({
        entries: webFetch.secretOwnValues,
        minChars: webFetch.secretOwnValueMinChars,
      }),
    ),
    isOwnerTyped: makeOwnerTypedCheck(inputs.log),
    logger: options.log,
    deniedRanges: [...(publicEgress?.hostAddresses ?? []), ...(publicEgress?.egressDeny ?? [])],
    fetch: webFetch,
  });
}
