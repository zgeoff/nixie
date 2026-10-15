interface NixieEnv {
  readonly dataDir: string;
  readonly deploymentKey: string;
  readonly modelURL: string;

  // the memory writer's own scripted model, or null when the crash test runs no writer
  readonly writerModelURL: string | null;
  readonly providerURL: string;
}

// Reads the paths and the endpoints that the crash harness passes the test build of nixie.
export function readNixieEnv(env: Readonly<Record<string, string | undefined>>): NixieEnv {
  return {
    dataDir: requireValue(env, 'NIXIE_DATA_DIR'),
    deploymentKey: requireValue(env, 'NIXIE_TEST_DEPLOYMENT_KEY'),
    modelURL: requireValue(env, 'NIXIE_TEST_MODEL_URL'),
    writerModelURL: env['NIXIE_TEST_WRITER_MODEL_URL'] ?? null,
    providerURL: requireValue(env, 'NIXIE_TEST_PROVIDER_URL'),
  };
}

function requireValue(env: Readonly<Record<string, string | undefined>>, name: string): string {
  const value = env[name];

  if (value === undefined || value === '') {
    throw new Error(`the test build of nixie needs ${name}`);
  }

  return value;
}
