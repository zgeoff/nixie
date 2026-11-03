export function buildStubContractEnv(
  source: Readonly<Record<string, string | undefined>>,
  modelURL: string,
  configDir: string,
): Readonly<Record<string, string>> {
  return {
    PATH: source['PATH'] ?? '',
    HOME: configDir,
    CLAUDE_CONFIG_DIR: configDir,
    ANTHROPIC_BASE_URL: modelURL,
    ANTHROPIC_API_KEY: 'stub-placeholder',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    DISABLE_AUTOUPDATER: '1',
  };
}
