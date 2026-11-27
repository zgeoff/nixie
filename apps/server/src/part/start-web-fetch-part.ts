import type { Secrets } from '@heynixie/credentials';
import type { Log } from '@heynixie/log';
import { makeOwnerTypedCheck } from '@heynixie/memory';
import type { SandboxAdapter } from '@heynixie/sandbox';
import { makeSecretFinder } from '@heynixie/secret-scan';
import { getSandboxImage } from '../sandbox/get-sandbox-image';
import type { ServerPartsOptions } from '../server/start-server';
import type { WebFetch } from './start-web-fetch';
import { startWebFetch } from './start-web-fetch';

export interface WebFetchPartInputs {
  readonly options: Pick<
    ServerPartsOptions,
    'sandbox' | 'images' | 'config' | 'cleanup' | 'harness' | 'log'
  > & { readonly secrets: Pick<Secrets, 'ownValues'> };
  readonly adapter: SandboxAdapter;
  readonly log: Pick<Log, 'deploymentKey' | 'writer'>;
}

export async function startWebFetchPart(inputs: WebFetchPartInputs): Promise<WebFetch> {
  const options = inputs.options;
  const sandbox = options.sandbox;
  const publicEgress = sandbox.adapter === 'imp' ? sandbox.imp.publicEgress : null;
  const testFetchArgv = NIXIE_TEST_BUILD ? (options.harness?.fetchArgv ?? null) : null;

  const webFetch = startWebFetch({
    adapter: inputs.adapter,
    image: getSandboxImage(options.images, 'fetch').name,
    ...(testFetchArgv === null ? {} : { argv: testFetchArgv }),
    deniedRanges: [...(publicEgress?.hostAddresses ?? []), ...(publicEgress?.egressDeny ?? [])],
    config: options.config.web_fetch,
    log: inputs.log,
    findSecret: makeSecretFinder(() =>
      options.secrets.ownValues.read({
        entries: options.config.web_fetch.secretOwnValues,
        minChars: options.config.web_fetch.secretOwnValueMinChars,
      }),
    ),
    isOwnerTyped: makeOwnerTypedCheck(inputs.log),
    isDeviceFetchOn: options.config.devices !== undefined,
    logger: options.log,
    ...(options.harness === undefined ? {} : { clock: options.harness.link.clock }),
  });

  await options.cleanup.defer(() => webFetch.stop());

  return webFetch;
}
