import type { DirectResult, ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import type { ActionConnector, ProviderResponse } from '../types';
import { buildBrowserActTools, runBrowserAct } from './build-browser-act-tools';
import { buildBrowserReadTools } from './build-browser-read-tools';
import { buildShellTools, runShellCommand } from './build-shell-tools';
import type { ComputerState } from './computer-state';
import { buildComputerState } from './computer-state';
import type { ComputerToolOptions } from './computer-tool-options';
import { refuseComputer, refuseUntilMoved } from './run-computer-call';
import type { ComputerAttempt } from './types';

export interface ComputerTools {
  readonly tools: readonly ToolDefinition[];

  // runs the queued tools: browser_fill, browser_click and run, and settles an old name
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
    ].map((tool) => withMoveGate(options, tool)),
    connector: {
      reconcile: { kind: 'none' },
      run: async (attempt) => {
        const moving = await refuseUntilMoved(options);
        const result = await (moving ?? runQueued(options, state, attempt));

        const refused = refusedSchema.safeParse(result.result['refused']);

        return refused.success
          ? toRefusal(refused.data)
          : { kind: 'success', result: result.result };
      },
    },
  };
}

// Every tool answers COMPUTER_MOVING until the disks of an earlier release are copied, whatever
// else it would have checked first.
function withMoveGate(options: ComputerToolOptions, tool: ToolDefinition): ToolDefinition {
  const gated: ToolDefinition = {
    ...tool,
    run: async (call, context) => {
      const moving = await refuseUntilMoved(options);

      return moving === null ? tool.run(call, context) : { status: 'ok', ...moving };
    },
  };

  if (tool.prepare === undefined) {
    return gated;
  }

  const prepare = tool.prepare;

  return {
    ...gated,
    prepare: async (input, context) => {
      const moving = await refuseUntilMoved(options);

      return moving ?? prepare(input, context);
    },
  };
}

// The queued tools under the names they had before the browser_ prefix. No tool carries them, but
// an action queued under one may still wait, and it settles as TAB_GONE.
export const legacyComputerToolNames = ['computer.fill', 'computer.click'] as const;

function runQueued(
  options: ComputerToolOptions,
  state: ComputerState,
  attempt: ComputerAttempt,
): Promise<DirectResult> {
  if (attempt.tool === 'computer.run') {
    return runShellCommand(options, state, { arguments: attempt.arguments });
  }

  if (legacyComputerToolNames.some((name) => name === attempt.tool)) {
    return Promise.resolve(
      refuseComputer(
        'TAB_GONE',
        'the browser was replaced since the call was queued, so its tab is gone; open the page again',
      ),
    );
  }

  return runBrowserAct(options, state, attempt);
}

function toRefusal(refused: z.infer<typeof refusedSchema>): ProviderResponse {
  return refused.code === 'BUSY' || refused.code === 'COMPUTER_MOVING'
    ? { kind: 'refused_retryable', reason: refused.message }
    : { kind: 'refused', reason: refused.message };
}

export const computerToolNames = [
  'computer.browser_open',
  'computer.browser_read',
  'computer.browser_screenshot',
  'computer.browser_scroll',
  'computer.browser_close',
  'computer.browser_download',
  'computer.browser_fill',
  'computer.browser_click',
  'computer.run',
  'computer.read_file',
  'computer.write_file',
  'computer.export_file',
] as const;
