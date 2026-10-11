interface NixieEnv {
  readonly dataDir: string;
  readonly deploymentKey: string;
  readonly modelURL: string;
  readonly providerURL: string;
}

// Reads the paths and the endpoints that the crash harness passes the test build of nixie.
export function readNixieEnv(env: Readonly<Record<string, string | undefined>>): NixieEnv {
  return {
    dataDir: requireValue(env, 'NIXIE_DATA_DIR'),
    deploymentKey: requireValue(env, 'NIXIE_TEST_DEPLOYMENT_KEY'),
    modelURL: requireValue(env, 'NIXIE_TEST_MODEL_URL'),
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
