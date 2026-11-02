const passedVariables = [
  'HTTPS_PROXY',
  'https_proxy',
  'NO_PROXY',
  'no_proxy',
  'NODE_USE_ENV_PROXY',
  'SSL_CERT_FILE',
  'NODE_EXTRA_CA_CERTS',
] as const;

const credentialVariables = ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY'] as const;

// The CLI falls back to a local login when it finds no credential, so a run with no credential
// throws here and never calls the model on a login it did not choose.
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
