import type { TaskControl } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
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
    (flags, io) => {
      invariant(flags.taskID !== undefined, 'the CLI parser requires a task ID');

      return runTaskControl(host, {
        control,
        configPath: flags.config,
        io,
        taskID: flags.taskID,
      });
    },
  ]);
}

interface TaskControlCall {
  readonly control: TaskControl;
  readonly configPath: string;
  readonly io: CLIIO;
  readonly taskID: string;
}

async function runTaskControl(host: HostTransport, call: TaskControlCall): Promise<number> {
  const socketPath = await host.resolveSocketPath(call.configPath);

  const controlled = await host.sendHostRequest(socketPath, `task ${call.control}`, (client) =>
    client.tasks[call.control]({ taskID: call.taskID }),
  );

  call.io.print(JSON.stringify(controlled));

  return 0;
}
