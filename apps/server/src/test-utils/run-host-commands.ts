import type { HostCommandRun } from './run-host-command';
import { runHostCommand } from './run-host-command';

export function runHostCommands(
  configPath: string,
  commands: readonly (readonly string[])[],
): Promise<readonly HostCommandRun[]> {
  return commands.reduce<Promise<readonly HostCommandRun[]>>(async (earlier, args) => {
    const runs = await earlier;

    return [...runs, await runHostCommand(configPath, args)];
  }, Promise.resolve([]));
}
