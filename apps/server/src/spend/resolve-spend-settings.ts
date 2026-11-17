import type { SpendStopConfig } from './spend-stop-schema';

export interface SpendSettings {
  readonly control: string;
  readonly token: string;
  readonly modelURL: string;
}

export function resolveSpendSettings(
  config: SpendStopConfig | undefined,
  settings: Readonly<Record<string, string>>,
): SpendSettings | null {
  if (config === undefined) {
    return null;
  }

  const key = config.token.slice('deployment:'.length);
  const token = Object.hasOwn(settings, key) ? settings[key] : undefined;

  if (token === undefined) {
    throw new Error(
      `spendStop.token is ${config.token}, and the secrets file has no settings entry ${key}`,
    );
  }

  return { control: config.control, token, modelURL: config.modelURL };
}
