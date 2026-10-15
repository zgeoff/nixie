import type { ActionConnector } from '@heynixie/actions';
import type { Logger } from '@heynixie/ops';
import type { ToolDefinition } from '@heynixie/tools';

// The log-only connector: one queued tool, and the connector the action runners run it with.
export interface LogConnector {
  readonly tool: ToolDefinition;
  readonly connector: ActionConnector;
}

const logConnectorTool = 'actions.log';
const actionsLogInput = { type: 'object', properties: {}, additionalProperties: false };

const actionsLogOutput = {
  type: 'object',
  properties: { logged: { type: 'boolean', const: true } },
  required: ['logged'],
  additionalProperties: false,
};

// Builds the log-only connector, which proves the action queue on every deploy. Its tool takes no
// input, and each attempt logs the action ID and the attempt alone. It declares write, the effect
// of the line it adds to the server log, because the registry queues only an outside effect.
export function buildLogConnector(log: Logger): LogConnector {
  return {
    tool: {
      name: logConnectorTool,
      description:
        "Writes one line to nixie's server log through the action queue, which shows the queue " +
        'runs an action end to end. It takes no input and returns logged: true once the line is ' +
        'written.',
      input: actionsLogInput,
      output: actionsLogOutput,
      declaration: {
        effects: ['write'],
        destinations: [],
        amount: null,
        content: [],
        results: { logged: 'owner_data' },
      },
      execution: 'queued',

      // the endpoint hands a queued tool's call to the action queue and never runs it
      run: () =>
        Promise.resolve({ status: 'error', message: `${logConnectorTool} runs only queued` }),
    },
    connector: {
      run: (call) => {
        log('action.logged', { actionID: call.actionID, attempt: call.attempt });

        return Promise.resolve({ kind: 'success', result: { logged: true } });
      },
    },
  };
}
