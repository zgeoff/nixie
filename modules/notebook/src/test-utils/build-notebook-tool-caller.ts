import type { JSONObject } from '@heynixie/log';
import type { ToolContext, ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { buildNotebookTools } from '../tool/build-notebook-tools';
import type { NotebookToolStore } from '../tool/notebook-tool-store';

export interface CallOptions {
  readonly thread?: string;
  readonly tools?: readonly string[];
  readonly model?: string;
}

// Calls a notebook tool as the conversation's turn does, or as a task run on another thread, and
// answers the tool's outcome.
export function buildNotebookToolCaller(readStore: () => NotebookToolStore) {
  const tools = buildNotebookTools(readStore);

  return (tool: string, input: JSONObject, options: CallOptions = {}): Promise<ToolOutcome> => {
    const thread = options.thread ?? 'conversation';

    const context: ToolContext = {
      callSequence: 1,
      run: {
        runID: 'run-1',
        thread,
        logThread: thread,
        tools: options.tools ?? [
          ...tools.map((definition) => definition.name),
          'log.read',
          'memory.recall',
        ],
        model: { model: options.model ?? 'model-a', profile: 'chat-direct' },
      },
    };

    return findTool(tools, tool).run(
      { callID: 'call-1', tool, input: structuredClone(input), toolUseID: null },
      context,
    );
  };
}

function findTool(tools: readonly ToolDefinition[], name: string): ToolDefinition {
  const found = tools.find((tool) => tool.name === name);

  if (found === undefined) {
    throw new Error(`no notebook tool is named ${name}`);
  }

  return found;
}
