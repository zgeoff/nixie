import invariant from 'tiny-invariant';
import { deriveFingerprintKey } from '../fingerprint/derive-fingerprint-key';
import { createOwnValueSet } from '../own-values/create-own-value-set';
import type { OwnValueSet } from '../own-values/create-own-value-set';
import type { FileCredentialRef, ResolveCredential, SecretsFile } from '../types';
import { createResolver } from './create-resolver';
import { readSetting } from './read-setting';
import { secretsSchema } from './secrets-schema';

export interface SecretsOptions {
  readonly path: string;

  readonly sopsArgv: readonly string[];
}

export interface Secrets {
  readonly deploymentKey: CryptoKey;
  readonly fingerprintKey: CryptoKey;

  readonly impdToken: string | null;

  readonly definitionsExportToken: string | null;
  readonly definitionsExportAppKey: string | null;

  // the service token of atc-gateway, set when the deployment runs the coding runner
  readonly atcToken: string | null;

  readonly resolveCredential: ResolveCredential;

  // a setting that the server needs in the clear: the owner's name and pronouns, which the prompt
  // needs, and the phone's number and Twilio IDs; the config key, when given, goes in the error of
  // a missing entry
  readonly readSetting: (reference: string, configKey?: string) => string;

  // the file backend's read, for the credential store alone
  readonly readFileValue: (ref: FileCredentialRef) => string;

  readonly ownValues: OwnValueSet;

  // how many model credentials the file holds, which the spend checks report
  readonly modelCredentialCount: number;
}

// The plaintext stays in this process's memory, never on a tmpfs, in an environment variable or in
// a Compose secret, and an error never quotes a secret value or the decryptor's output.
export async function loadSecrets(options: SecretsOptions): Promise<Secrets> {
  const child = Bun.spawn([...options.sopsArgv, 'decrypt', '--output-type', 'json', options.path], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'ignore',
  });

  const [stdout, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);

  if (code !== 0) {
    throw new Error(`sops could not decrypt ${options.path} and exited with code ${String(code)}`);
  }

  const result = secretsSchema.safeParse(parseJSON(stdout));

  if (!result.success) {
    const paths = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);

    throw new Error(`nixie refuses the secrets in ${options.path}:\n${paths.join('\n')}`);
  }

  const file = result.data;
  const keyBytes = Buffer.from(file.deployment_key, 'base64');

  return {
    deploymentKey: await crypto.subtle.importKey('raw', keyBytes, 'AES-KW', false, [
      'wrapKey',
      'unwrapKey',
    ]),
    fingerprintKey: await deriveFingerprintKey(keyBytes),
    impdToken: file.impd_token ?? null,
    definitionsExportToken: file.definitions_export_token ?? null,
    definitionsExportAppKey: file.definitions_export_app_key ?? null,
    atcToken: file.atc_token ?? null,
    resolveCredential: createResolver(file),
    readSetting: (reference, configKey) => readSetting(file, reference, configKey),
    readFileValue: (ref) => {
      const value = file[ref.group][ref.name];

      invariant(value !== undefined, 'the resolver found the entry');

      return value;
    },
    ownValues: createFileOwnValues(file),
    modelCredentialCount: Object.keys(file.model_credentials).length,
  };
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function createFileOwnValues(file: SecretsFile): OwnValueSet {
  const ownValues = createOwnValueSet();

  const topLevel = [
    ['deployment_key', file.deployment_key],
    ['impd_token', file.impd_token],
    ['definitions_export_token', file.definitions_export_token],
    ['definitions_export_app_key', file.definitions_export_app_key],
    ['atc_token', file.atc_token],
  ] as const;

  for (const [group, value] of topLevel) {
    if (value !== undefined) {
      ownValues.add({ group, name: group, value });
    }
  }

  for (const group of ['model_credentials', 'connector_credentials', 'settings'] as const) {
    for (const [name, value] of Object.entries(file[group])) {
      ownValues.add({ group, name, value });
    }
  }

  return ownValues;
}
