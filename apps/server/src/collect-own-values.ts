import type { z } from 'zod';
import type { secretsSchema } from './secrets-schema';

type SecretsFile = z.infer<typeof secretsSchema>;

type SecretsEntryName = keyof SecretsFile;

export interface OwnValueSettings {
  readonly entries: readonly SecretsEntryName[];
  readonly minChars: number;
}

const defaultSettings: OwnValueSettings = {
  entries: [
    'deployment_key',
    'impd_token',
    'definitions_export_token',
    'model_credentials',
    'connector_credentials',
  ],
  minChars: 8,
};

// Reads each string of the listed entries and the values of a map entry, never its keys. A value
// shorter than minChars matches ordinary text by chance, so it is left out.
export function collectOwnValues(
  secrets: SecretsFile,
  settings: OwnValueSettings = defaultSettings,
): readonly string[] {
  const values = settings.entries.flatMap((name) => {
    const entry = secrets[name];

    if (entry === undefined) {
      return [];
    }

    return typeof entry === 'string' ? [entry] : Object.values(entry);
  });

  return [...new Set(values.filter((value) => value.length >= settings.minChars))];
}
