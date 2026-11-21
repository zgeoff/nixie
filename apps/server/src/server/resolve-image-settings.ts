import type { ImagesConfig } from '@heynixie/connectors';

export interface ImageSettings {
  readonly config: ImagesConfig;

  // the API key of each profile, by the profile's key
  readonly apiKeys: Readonly<Record<string, string>>;
}

export function resolveImageSettings(
  config: ImagesConfig | null,
  credentials: Readonly<Record<string, string>>,
): ImageSettings | null {
  if (config === null) {
    return null;
  }

  const apiKeys: Record<string, string> = {};

  for (const [key, profile] of Object.entries(config.profiles)) {
    const name = profile.credential.slice('deployment:'.length);
    const apiKey = Object.hasOwn(credentials, name) ? credentials[name] : undefined;

    if (apiKey === undefined) {
      throw new Error(
        `images.profiles.${key}.credential is ${profile.credential}, and the secrets file has ` +
          `no connector_credentials entry ${name}`,
      );
    }

    apiKeys[key] = apiKey;
  }

  return { config, apiKeys };
}
