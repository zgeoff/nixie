import type { ImpSection } from '@heynixie/sandbox-imp';
import invariant from 'tiny-invariant';
import type { DeploymentConfig } from './deployment-config-schema';

export type SandboxSettings =
  | { readonly adapter: 'imp'; readonly imp: ImpSection & { readonly token: string } }
  | { readonly adapter: 'test' };

export function resolveSandboxSettings(
  config: Pick<DeploymentConfig, 'sandbox' | 'imp'>,
  impdToken: string | null,
): SandboxSettings {
  if (config.sandbox.adapter === 'test') {
    return { adapter: 'test' };
  }

  invariant(config.imp, 'the imp sandbox adapter has no imp section');

  if (impdToken === null) {
    throw new Error('the secrets file holds no impd_token, and the imp sandbox adapter needs it');
  }

  return { adapter: 'imp', imp: { ...config.imp, token: impdToken } };
}
