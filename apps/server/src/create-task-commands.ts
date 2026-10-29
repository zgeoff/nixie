import type { TaskControl } from '@heynixie/tasks';
import type { CLIIO, Command, HostTransport } from './types';

const taskControls: readonly TaskControl[] = [
  'pause',
  'resume',
  'stop',
  'restart',
  'close',
  'interrupt',
];

export function createTaskCommands(host: HostTransport): readonly (readonly [string, Command])[] {
  return taskControls.map((control) => [
    `task-${control}`,
    (flags, io, args) => runTaskControl(host, { control, configPath: flags.config, io, args }),
  ]);
}

interface TaskControlCall {
  readonly control: TaskControl;
  readonly configPath: string;
  readonly io: CLIIO;
  readonly args: readonly string[];
}

async function runTaskControl(host: HostTransport, call: TaskControlCall): Promise<number> {
  const [taskID, ...rest] = call.args;

  if (taskID === undefined || rest.length > 0) {
    call.io.print(`nixie task-${call.control} takes one task ID`);

    return 2;
  }

  const socketPath = await host.resolveSocketPath(call.configPath);

  const controlled = await host.sendHostRequest(socketPath, `task ${call.control}`, (client) =>
    client.tasks[call.control]({ taskID }),
  );

  call.io.print(JSON.stringify(controlled));

  return 0;
}
