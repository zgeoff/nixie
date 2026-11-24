import type { OwnerConfig } from '../utils/owner-config-schema';

// A value that holds a deployment: reference is a setting of the secrets file, which readSetting
// returns, so the prompt never shows the model a reference in place of a name or a pronoun.
export function readOwnerConfig(
  config: OwnerConfig,
  readSetting: (reference: string) => string,
): OwnerConfig {
  return {
    name: config.name === null ? null : readOwnerValue(config.name, readSetting),
    pronouns: {
      they: readOwnerValue(config.pronouns.they, readSetting),
      their: readOwnerValue(config.pronouns.their, readSetting),
    },
  };
}

function readOwnerValue(value: string, readSetting: (reference: string) => string): string {
  return value.startsWith('deployment:') ? readSetting(value) : value;
}
