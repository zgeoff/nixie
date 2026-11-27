import type { TasksContext } from '@heynixie/tasks';
import { readCallTask } from '@heynixie/tasks';
import type { ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { markHangUp } from '../hang-up/mark-hang-up';
import type { CallsContext } from '../types';

export const hangUpToolName = 'call.hang_up';

// The tool that ends a call, once the speech layer has the turn's last line. Only a call's thread
// holds it: the run's thread is the call's task.
export function buildHangUpTool(
  readCalls: () => CallsContext | undefined,
  tasks: Pick<TasksContext, 'log'>,
): ToolDefinition {
  return {
    name: hangUpToolName,
    description:
      'Ends the call after this turn. The user hears what you write in this turn first, so say ' +
      'goodbye in it. Use it when the user says they are done, or asks you to hang up.',
    input: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      type: 'object',
      properties: { note: { type: 'string' } },
      required: ['note'],
      additionalProperties: false,
    },
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: [],
      results: { note: 'owner_data' },
    },
    execution: 'direct',
    run: async (_call, tool): Promise<ToolOutcome> => {
      const calls = readCalls();

      const call = await readCallTask(tasks, tool.run.thread);

      if (calls === undefined || call === null) {
        return { status: 'error', message: 'only a call can hang up' };
      }

      markHangUp(calls, call.callID);

      return {
        status: 'ok',
        result: { note: 'The call ends once the user hears this turn.' },
      };
    },
  };
}
