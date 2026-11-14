export const secretsEntryNames = [
  'deployment_key',
  'impd_token',
  'definitions_export_token',
  'model_credentials',
  'connector_credentials',
  'settings',
] as const;

export type SecretsEntryName = (typeof secretsEntryNames)[number];
