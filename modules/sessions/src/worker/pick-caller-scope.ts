import type { ToolRun } from '@heynixie/tools';

interface CallerScope {
  readonly taskRun?: ToolRun['taskRun'];
  readonly connectionPins?: ToolRun['connectionPins'];
}

// The parts of a caller's tool run that a worker's tool run inherits, with a key left out when the
// caller has none.
export function pickCallerScope(caller: CallerScope): CallerScope {
  return {
    ...(caller.taskRun === undefined ? {} : { taskRun: caller.taskRun }),
    ...(caller.connectionPins === undefined ? {} : { connectionPins: caller.connectionPins }),
  };
}
