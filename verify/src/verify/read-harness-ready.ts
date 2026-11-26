// The harness prints a `ready` line with each endpoint it serves, and nothing else counts as ready.
export function readHarnessReady(line: Record<string, unknown>): Record<string, string> | null {
  if (line['event'] !== 'ready') {
    return null;
  }

  return {
    web: String(line['web']),
    control: String(line['control']),
    config: String(line['config']),
    cli: String(line['cli']),
    db: String(line['db']),
  };
}
