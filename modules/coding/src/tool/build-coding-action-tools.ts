import type { ToolDefinition } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { codingActionDeclarations } from '../connector/coding-declarations';
import { codingToolNames } from '../connector/coding-tool-names';

// The actions that the runner queues and no model calls: `coding.start` and `coding.stop`. The
// tool registry declares them, so the snapshot's rules and effects cover them. `coding.steer` and
// `coding.message` are model tools that queue an action under their own name.
export function buildCodingActionTools(): ToolDefinition[] {
  return [codingToolNames.start, codingToolNames.stop].map((name) => {
    const declaration = codingActionDeclarations.get(name);

    invariant(declaration, `${name} has a declaration`);

    return {
      name,
      description: `The coding runner queues ${name} on a coding task's thread, and no model calls it.`,
      input: { type: 'object' },
      output: { type: 'object' },
      declaration,
      execution: 'queued',
      run: () => Promise.resolve({ status: 'error', message: `${name} runs only queued` }),
    };
  });
}
