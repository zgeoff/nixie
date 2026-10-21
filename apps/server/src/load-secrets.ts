import type { ModelSecrets } from '@heynixie/models';
import { secretsSchema } from './secrets-schema';

export interface SecretsOptions {
  readonly path: string;

  readonly sopsArgv: readonly string[];
}

export interface Secrets {
  readonly deploymentKey: CryptoKey;

  readonly impdToken: string | null;

  readonly definitionsExportToken: string | null;
  readonly models: ModelSecrets;

  readonly settings: Readonly<Record<string, string>>;
}

// The plaintext stays in this process's memory, never on a tmpfs, in an environment variable or in
// a Compose secret, and an error never quotes a secret value.
export async function loadSecrets(options: SecretsOptions): Promise<Secrets> {
  const child = Bun.spawn([...options.sopsArgv, 'decrypt', '--output-type', 'json', options.path], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  if (code !== 0) {
    throw new Error(`sops could not decrypt ${options.path}: ${stderr.trim()}`);
  }

  const result = secretsSchema.safeParse(parseJSON(stdout));

  if (!result.success) {
    const paths = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);

    throw new Error(`nixie refuses the secrets in ${options.path}:\n${paths.join('\n')}`);
  }

  return {
    deploymentKey: await crypto.subtle.importKey(
      'raw',
      Buffer.from(result.data.deployment_key, 'base64'),
      'AES-KW',
      false,
      ['wrapKey', 'unwrapKey'],
    ),
    impdToken: result.data.impd_token ?? null,
    definitionsExportToken: result.data.definitions_export_token ?? null,
    models: { model_credentials: result.data.model_credentials },
    settings: result.data.settings,
  };
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
