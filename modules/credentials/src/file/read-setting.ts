import invariant from 'tiny-invariant';
import type { SecretsFile } from '../types';
import { createResolver } from './create-resolver';
import { MissingCredentialError } from './missing-credential-error';

// A setting is a value the server needs in the clear, such as the owner's name and pronouns or the
// phone's number. A caller that passes the config key gets the error of a credential that the
// secrets file lacks, which names the key.
export function readSetting(
  secretsFile: SecretsFile,
  reference: string,
  configKey?: string,
): string {
  if (configKey !== undefined) {
    const ref = createResolver(secretsFile)({ class: 'setting', reference, configKey });

    invariant(ref !== null, 'the resolver stops at a missing setting entry');

    const value = secretsFile.settings[ref.name];

    invariant(value !== undefined, 'the resolver found the entry');

    return value;
  }

  const name = reference.slice('deployment:'.length);
  const value = Object.hasOwn(secretsFile.settings, name) ? secretsFile.settings[name] : undefined;

  if (value === undefined) {
    throw new MissingCredentialError(
      `${reference} names a setting, and the secrets file has no settings entry ${name}`,
    );
  }

  return value;
}
