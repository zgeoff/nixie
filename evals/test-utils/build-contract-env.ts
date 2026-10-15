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

// Builds the CLI's whole environment for a contract probe: the subscription token, the probe's own
// config directory as its home, and nothing of the caller's session. A run with no token stops
// here, so the gate fails rather than the CLI falling back to a login the run never chose.
export function buildContractEnv(
  source: Readonly<Record<string, string | undefined>>,
  configDir: string,
): Record<string, string> {
  const token = source['CLAUDE_CODE_OAUTH_TOKEN'];

  if (token === undefined || token === '') {
    throw new Error('the SDK contract suite needs CLAUDE_CODE_OAUTH_TOKEN');
  }

  const passed = Object.fromEntries(
    passedVariables.flatMap((name) => {
      const value = source[name];

      return value === undefined ? [] : [[name, value]];
    }),
  );

  return {
    ...passed,
    PATH: source['PATH'] ?? '',
    HOME: configDir,
    CLAUDE_CONFIG_DIR: configDir,
    CLAUDE_CODE_OAUTH_TOKEN: token,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    DISABLE_AUTOUPDATER: '1',
  };
}
