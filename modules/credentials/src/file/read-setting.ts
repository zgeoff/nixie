import type { SecretsFile } from '../types';
import { MissingCredentialError } from './missing-credential-error';

// The owner's name and pronouns are settings the prompt needs, so they come back as the value.
export function readSetting(secretsFile: SecretsFile, reference: string): string {
  const name = reference.slice('deployment:'.length);
  const value = Object.hasOwn(secretsFile.settings, name) ? secretsFile.settings[name] : undefined;

  if (value === undefined) {
    throw new MissingCredentialError(
      `${reference} names a setting, and the secrets file has no settings entry ${name}`,
    );
  }

  return value;
}
