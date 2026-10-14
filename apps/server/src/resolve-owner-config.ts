import type { OwnerConfig } from './owner-config-schema';

// Resolves an owner's name of deployment:<name> to the entry <name> under the secrets' settings,
// and keeps a plain name and the pronouns. It refuses a missing entry, so nixie stops at start
// rather than calling the owner by the reference.
export function resolveOwnerConfig(
  config: OwnerConfig,
  settings: Readonly<Record<string, string>>,
): OwnerConfig {
  if (config.name === null || !config.name.startsWith('deployment:')) {
    return config;
  }
  const key = config.name.slice('deployment:'.length);
  const name = Object.hasOwn(settings, key) ? settings[key] : undefined;

  if (name === undefined) {
    throw new Error(
      `the owner's name is ${config.name}, and the secrets file has no settings entry ${key}`,
    );
  }
  return { ...config, name };
}
