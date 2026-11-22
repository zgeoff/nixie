import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import type { ActionConnector, ProviderResponse } from '../types';
import { buildBrowserActTools, runBrowserAct } from './build-browser-act-tools';
import { buildBrowserReadTools } from './build-browser-read-tools';
import { buildShellTools, runShellCommand } from './build-shell-tools';
import { buildComputerState } from './computer-state';
import type { ComputerToolOptions } from './computer-tool-options';

export interface ComputerTools {
  readonly tools: readonly ToolDefinition[];

  // runs the queued tools: fill, click and run
  readonly connector: ActionConnector;
}

const refusedSchema = z.object({ code: z.string(), message: z.string() });

export function buildComputerTools(options: ComputerToolOptions): ComputerTools {
  const state = buildComputerState();

  return {
    tools: [
      ...buildBrowserReadTools(options, state),
      ...buildBrowserActTools(options, state),
      ...buildShellTools(options, state),
    ],
    connector: {
      reconcile: { kind: 'none' },
      run: async (attempt) => {
        const result =
          attempt.tool === 'computer.run'
            ? await runShellCommand(options, state, { arguments: attempt.arguments })
            : await runBrowserAct(options, state, attempt);

        const refused = refusedSchema.safeParse(result.result['refused']);

        return refused.success
          ? toRefusal(refused.data)
          : { kind: 'success', result: result.result };
      },
    },
  };
}

function toRefusal(refused: z.infer<typeof refusedSchema>): ProviderResponse {
  return refused.code === 'BUSY'
    ? { kind: 'refused_retryable', reason: refused.message }
    : { kind: 'refused', reason: refused.message };
}

export const computerToolNames = [
  'computer.open',
  'computer.read',
  'computer.screenshot',
  'computer.close',
  'computer.download',
  'computer.fill',
  'computer.click',
  'computer.run',
  'computer.read_file',
  'computer.write_file',
  'computer.export_file',
] as const;
