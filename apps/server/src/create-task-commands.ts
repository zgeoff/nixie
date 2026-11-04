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
  return [
    ...taskControls.map((control): readonly [string, Command] => [
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
    ]),
    [
      'task-raise',
      (flags, io) => {
        invariant(flags.taskID !== undefined, 'the CLI parser requires a task ID');

        return runTaskRaise(host, {
          configPath: flags.config,
          io,
          taskID: flags.taskID,
          turns: flags.turns,
          dollars: flags.dollars,
        });
      },
    ],
  ];
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

interface TaskRaiseCall {
  readonly configPath: string;
  readonly io: CLIIO;
  readonly taskID: string;
  readonly turns: number | undefined;
  readonly dollars: number | undefined;
}

async function runTaskRaise(host: HostTransport, call: TaskRaiseCall): Promise<number> {
  const socketPath = await host.resolveSocketPath(call.configPath);

  const raised = await host.sendHostRequest(socketPath, 'task raise', (client) =>
    client.tasks.raise({
      taskID: call.taskID,
      ...(call.turns === undefined ? {} : { turns: call.turns }),
      ...(call.dollars === undefined ? {} : { dollars: call.dollars }),
    }),
  );

  call.io.print(JSON.stringify(raised));

  return 0;
}
