import { Server } from '@modelcontextprotocol/server';
import { z } from 'zod';

export interface ToolCall {
  readonly count: number;
  readonly name: string;
  readonly input: WaitInput;
}

export interface ToolServerHooks {
  readonly onCall: (call: ToolCall) => Promise<void>;
  readonly onEvent: (event: string, fields: Record<string, unknown>) => void;
}

// The counters live outside the factory, because the MCP handler builds a new server per request.
const counters = { calls: 0, inFlight: 0 };

// nixie's run server is a low-level Server with no tool annotations, so this one is too. The second
// tool adds readOnlyHint, the one annotation that could change how the CLI schedules a call.
// oxlint-disable-next-line typescript/no-deprecated -- the run server in modules/tools uses Server for the same tools/call shape
export function createToolServer(hooks: ToolServerHooks): Server {
  // oxlint-disable-next-line typescript/no-deprecated -- as above
  const server = new Server(
    { name: 'nixie', version: '0.0.0' },
    { capabilities: { tools: { listChanged: true } } },
  );

  server.setRequestHandler('tools/list', () => ({ tools: waitTools }));

  server.setRequestHandler('tools/call', async (request) => {
    const input = WAIT_INPUT_SCHEMA.parse(request.params.arguments ?? {});
    const call = { count: (counters.calls += 1), name: request.params.name, input };
    // oxlint-disable-next-line no-underscore-dangle -- _meta is the MCP field's name
    const toolUseID = request.params._meta?.['claudecode/toolUseId'];

    counters.inFlight += 1;
    hooks.onEvent('call_start', { ...call, toolUseID, inFlight: counters.inFlight });
    const outcome = { failed: true };
    try {
      await hooks.onCall(call);
      await Bun.sleep(input.seconds * 1000);
      outcome.failed = false;
    } finally {
      counters.inFlight -= 1;
      hooks.onEvent('call_end', {
        count: call.count,
        toolUseID,
        inFlight: counters.inFlight,
        failed: outcome.failed,
      });
    }

    return { content: [{ type: 'text' as const, text: `waited ${input.seconds} s for ${formatLabel(input)}` }] };
  });

  return server;
}

function formatLabel(input: WaitInput): string {
  return input.label ?? `step ${String(input.step ?? '?')}`;
}

const WAIT_INPUT_SCHEMA = z.object({
  seconds: z.number().min(0).max(30),
  step: z.number().int().optional(),
  label: z.string().optional(),
});

type WaitInput = z.infer<typeof WAIT_INPUT_SCHEMA>;

const waitInputSchema = {
  type: 'object' as const,
  properties: {
    seconds: { type: 'number', description: 'How long to wait, in seconds, at most 30' },
    step: { type: 'integer', description: 'The step number, when the task counts steps' },
    label: { type: 'string', description: 'A label for this call, when the task names one' },
  },
  required: ['seconds'],
};

const waitTools = [
  {
    name: 'wait',
    description: 'Wait for the given number of seconds, then return which call finished.',
    inputSchema: waitInputSchema,
  },
  {
    name: 'wait_read_only',
    description: 'Wait for the given number of seconds, then return which call finished. It changes nothing.',
    inputSchema: waitInputSchema,
    annotations: { readOnlyHint: true },
  },
];
