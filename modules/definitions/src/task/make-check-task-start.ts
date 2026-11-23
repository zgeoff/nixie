import type { SandboxStartInput, TaskStartBounds } from '@heynixie/tasks';
import { sandboxRunner } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import type { CheckTaskStart } from './types';

export interface CheckTaskStartOptions {
  readonly bounds: TaskStartBounds;

  // every registered tool, which the starter of a file definition holds
  readonly toolNames: readonly string[];

  // the tools the conversation holds, which the starter of a definition from chat holds
  readonly conversationTools: readonly string[];
}

// The one check of a start: the sandbox runner plans the input for the starter, with the bounds
// that the conversation's task.start passes.
export function makeCheckTaskStart(options: CheckTaskStartOptions): CheckTaskStart {
  const start = sandboxRunner.start;

  invariant(start, 'the sandbox runner has a start');

  return (input: SandboxStartInput, starter) => {
    const tools = starter === 'file' ? options.toolNames : options.conversationTools;

    // The sandbox runner refuses the grant from a start, because only a definition holds it. A
    // definition may hold it, and it holds every tool that `read` does, so the plan checks it as read.
    const planned = input.memory === 'self_notes' ? { ...input, memory: 'read' as const } : input;

    const plan = start.plan(
      planned,
      { tools, memory: 'read', persona: 'default', log: 'conversation' },
      options.bounds,
    );

    return plan.status === 'refused'
      ? { status: 'refused', reasons: [plan.sentence] }
      : { status: 'planned' };
  };
}
