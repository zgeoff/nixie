// the variables a contract probe passes on from its own environment when they are set: a sandbox's
// proxy and certificate settings, where a broker adds the model credential on the way out
const passedVariables = [
  'HTTPS_PROXY',
  'https_proxy',
  'NO_PROXY',
  'no_proxy',
  'NODE_USE_ENV_PROXY',
  'SSL_CERT_FILE',
  'NODE_EXTRA_CA_CERTS',
] as const;

// the variables the CLI reads its credential from, one for each auth header, as in the guest; in a
// sandbox with a model grant the variable holds the grant's placeholder
const credentialVariables = ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY'] as const;

// Builds the CLI's whole environment for a contract probe: the credential variable, the probe's own
// config directory as its home, and nothing else of the caller's session. A run with no credential
// stops here, so the probe fails rather than the CLI falling back to a login the run never chose.
export function buildContractEnv(
  source: Readonly<Record<string, string | undefined>>,
  configDir: string,
): Record<string, string> {
  const credentials = pickSetVariables(source, credentialVariables);

  if (Object.keys(credentials).length === 0) {
    throw new Error('the SDK contract suite needs ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY');
  }

  return {
    ...pickSetVariables(source, passedVariables),
    PATH: source['PATH'] ?? '',
    HOME: configDir,
    CLAUDE_CONFIG_DIR: configDir,
    ...credentials,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    DISABLE_AUTOUPDATER: '1',
  };
}

function pickSetVariables(
  source: Readonly<Record<string, string | undefined>>,
  names: readonly string[],
): Record<string, string> {
  return Object.fromEntries(
    names.flatMap((name) => {
      const value = source[name];

      return value === undefined || value === '' ? [] : [[name, value]];
    }),
  );
}
