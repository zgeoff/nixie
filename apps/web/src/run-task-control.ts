import type { ContractClient, ContractOutputs } from '@heynixie/contract';
import type { TaskControl } from '@heynixie/task-control';
import { match } from 'ts-pattern';

export interface TaskControlRequest {
  readonly clientActionID: string;
  readonly control: TaskControl;
  readonly taskID: string;
}

type ControlledTask = ContractOutputs['tasks']['pause'];

export function runTaskControl(
  client: ContractClient,
  request: TaskControlRequest,
): Promise<ControlledTask> {
  const input = { clientActionID: request.clientActionID, taskID: request.taskID };

  return match(request.control)
    .with('pause', () => client.tasks.pause(input))
    .with('resume', () => client.tasks.resume(input))
    .with('stop', () => client.tasks.stop(input))
    .with('restart', () => client.tasks.restart(input))
    .with('close', () => client.tasks.close(input))
    .with('interrupt', () => client.tasks.interrupt(input))
    .exhaustive();
}
