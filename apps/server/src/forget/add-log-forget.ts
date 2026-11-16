import type { Actions } from '../test/build-actions';
import type { LogForget } from './build-log-forget-tool';

export interface ActionsWithForget extends Actions {
  readonly forget: LogForget;
}

// The forget tool needs the API context, which the other actions' tests have no use for, so the
// part adds it after the queue is built.
export function addLogForget(actions: Actions, forget: LogForget): ActionsWithForget {
  return {
    ...actions,
    forget,
    connectors: new Map([...actions.connectors, [forget.tool.name, forget.connector]]),
  };
}
