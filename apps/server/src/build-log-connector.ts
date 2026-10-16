import type { ActionConnector } from '@heynixie/connectors';
import type { Logger } from '@heynixie/logger';
import type { ToolDefinition } from '@heynixie/tools';

// The log-only connector: one queued tool, and the connector the action runners run it with.
export interface LogConnector {
  readonly tool: ToolDefinition;
  readonly connector: ActionConnector;
}

const logConnectorTool = 'actions.log';

// the sequence of the wake that started the check, which gives each start's action its own hash
const actionsLogInput = {
  type: 'object',
  properties: { wake: { type: 'integer', minimum: 1 } },
  required: ['wake'],
  additionalProperties: false,
};

const actionsLogOutput = {
  type: 'object',
  properties: { logged: { type: 'boolean', const: true } },
  required: ['logged'],
  additionalProperties: false,
};

// Builds the log-only connector, which proves the action queue on every deploy. Its tool takes the
// sequence of the check's wake, and each attempt logs the action ID and the attempt alone. It
// declares write, the effect of its log line, because the registry queues only an outside effect.
export function buildLogConnector(log: Logger): LogConnector {
  return {
    tool: {
      name: logConnectorTool,
      description:
        "Writes one line to nixie's server log through the action queue, which shows the queue " +
        'runs an action end to end. It takes the sequence of the wake that started the check and ' +
        'returns logged: true once the line is written.',
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
