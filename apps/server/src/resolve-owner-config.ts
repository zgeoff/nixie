import type { OwnerConfig } from './owner-config-schema';

// Resolves each of the owner's name and pronouns that is a deployment:<name> reference to the entry
// <name> under the secrets' settings, and keeps each plain value. It refuses a missing entry, so
// nixie stops at start rather than showing the model the reference.
export function resolveOwnerConfig(
  config: OwnerConfig,
  settings: Readonly<Record<string, string>>,
): OwnerConfig {
  return {
    name:
      config.name === null ? null : resolveOwnerValue(config.name, "the owner's name", settings),
    pronouns: {
      they: resolveOwnerValue(config.pronouns.they, "the owner's pronoun they", settings),
      their: resolveOwnerValue(config.pronouns.their, "the owner's pronoun their", settings),
    },
  };
}

function resolveOwnerValue(
  value: string,
  label: string,
  settings: Readonly<Record<string, string>>,
): string {
  if (!value.startsWith('deployment:')) {
    return value;
  }
  const key = value.slice('deployment:'.length);
  const resolved = Object.hasOwn(settings, key) ? settings[key] : undefined;

  if (resolved === undefined) {
    throw new Error(`${label} is ${value}, and the secrets file has no settings entry ${key}`);
  }
  return resolved;
}
