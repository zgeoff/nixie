import type { CredentialQuery, FileGroup, ResolveCredential, SecretsFile } from '../types';
import { MissingCredentialError } from './missing-credential-error';

const groupOfClass = {
  model: 'model_credentials',
  connector: 'connector_credentials',
  setting: 'settings',
} as const satisfies Record<CredentialQuery['class'], FileGroup>;

// Binds the resolver to the loaded secrets file. A missing model entry resolves to null, because
// the sandbox host holds that credential; any other missing entry stops the start.
export function createResolver(secretsFile: SecretsFile): ResolveCredential {
  return (query) => {
    const group = groupOfClass[query.class];
    const name = query.reference.slice('deployment:'.length);

    if (Object.hasOwn(secretsFile[group], name)) {
      return { backend: 'file', group, name };
    }

    if (query.class === 'model') {
      return null;
    }

    const place = query.configKey === undefined ? '' : `${query.configKey} is `;

    throw new MissingCredentialError(
      `${place}${query.reference}, and the secrets file has no ${group} entry ${name}`,
    );
  };
}
