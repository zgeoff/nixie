import type { Log } from '@heynixie/log';
import type { SandboxAdapter } from '@heynixie/sandbox';
import { getSandboxImage } from './get-sandbox-image';
import type { ServerPartsOptions } from './start-server';
import type { WebFetch } from './start-web-fetch';
import { startWebFetch } from './start-web-fetch';

export interface WebFetchPartInputs {
  readonly options: Pick<
    ServerPartsOptions,
    'sandbox' | 'images' | 'config' | 'cleanup' | 'harness'
  >;
  readonly adapter: SandboxAdapter;
  readonly log: Pick<Log, 'writer'>;
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
  });

  await options.cleanup.defer(() => webFetch.stop());

  return webFetch;
}
