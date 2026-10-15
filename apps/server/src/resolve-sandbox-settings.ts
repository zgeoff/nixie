import type { ImpSection } from '@heynixie/sandbox-imp';
import invariant from 'tiny-invariant';
import type { DeploymentConfig } from './deployment-config-schema';

// What the server builds its sandbox adapter from: impd's section and token for imp, or nothing
// for the test sandbox, which never calls impd.
export type SandboxSettings =
  | { readonly adapter: 'imp'; readonly imp: ImpSection & { readonly token: string } }
  | { readonly adapter: 'test' };

// Resolves the sandbox adapter the configuration selects, with what it needs from the
// configuration and the secrets. The imp adapter needs impd's token, so a secrets file without one
// stops nixie before it opens anything.
export function resolveSandboxSettings(
  config: Pick<DeploymentConfig, 'sandbox' | 'imp'>,
  impdToken: string | null,
): SandboxSettings {
  if (config.sandbox.adapter === 'test') {
    return { adapter: 'test' };
  }

  // the configuration's schema refuses the imp adapter without its section
  invariant(config.imp, 'the imp sandbox adapter has no imp section');

  if (impdToken === null) {
    throw new Error('the secrets file holds no impd_token, and the imp sandbox adapter needs it');
  }

  return { adapter: 'imp', imp: { ...config.imp, token: impdToken } };
}
