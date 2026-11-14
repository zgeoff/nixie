export function findCLIPath(): string | undefined {
  return typeof NIXIE_CLI_PATH === 'undefined' ? undefined : NIXIE_CLI_PATH;
}
