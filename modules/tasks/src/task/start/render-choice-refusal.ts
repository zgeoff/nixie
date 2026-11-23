import { toSDKToolName } from '@heynixie/tools';
import { match } from 'ts-pattern';
import { renderShapeFault } from '../../report/render-shape-fault';
import type { TaskStartChoiceRefusal } from './plan-task-start';

export function renderChoiceRefusal(refusal: TaskStartChoiceRefusal): string {
  return match(refusal)
    .with(
      { reason: 'unknown_model' },
      (unknown) => `${unknown.model} is not a model a task can run on, so nixie started nothing`,
    )
    .with(
      { reason: 'harness_misfit' },
      (misfit) =>
        `${misfit.model} runs on a harness that lacks ${misfit.missing.join(', ')}, which a task needs, so nixie started nothing`,
    )
    .with(
      { reason: 'stranger_with_memory' },
      () => 'a task with persona none cannot read memory, so nixie started nothing',
    )
    .with(
      { reason: 'wider_memory' },
      () => 'you do not read memory, so a task you start cannot either, and nixie started nothing',
    )
    .with(
      { reason: 'self_notes_start' },
      () =>
        'only a task definition grants self-note writes, so define the task with task.define and nixie started nothing',
    )
    .with(
      { reason: 'wider_log' },
      () =>
        "You can give a task the conversation's log only when you hold it yourself, and you do not.",
    )
    .with(
      { reason: 'wider_persona' },
      () =>
        'you run with no persona, so a task you start cannot have one, and nixie started nothing',
    )
    .with(
      { reason: 'over_limit' },
      (over) =>
        `a task's ${over.limit} limit is at most ${String(over.max)}, so nixie started nothing`,
    )
    .with({ reason: 'report_shape' }, (shape) => renderShapeFault(shape.fault))
    .with(
      { reason: 'wider_tools' },
      (wider) =>
        `a task gets only tools you hold, and you do not hold ${wider.tools.join(', ')}, so nixie started nothing. ${renderAcceptedTools(wider.accepted)}`,
    )
    .with(
      { reason: 'memory_tools' },
      (memory) =>
        `a task gets ${memory.tools.join(', ')} only with memory set to read, so nixie started nothing. ${renderAcceptedTools(memory.accepted)}`,
    )
    .with(
      { reason: 'conversation_tools' },
      (conversation) =>
        `only the conversation can use ${conversation.tools.join(', ')}, so nixie started nothing. ${renderAcceptedTools(conversation.accepted)}`,
    )
    .exhaustive();
}

function renderAcceptedTools(accepted: readonly string[]): string {
  if (accepted.length === 0) {
    return 'You hold no tool that this task can get.';
  }

  const names = accepted.map((tool) => `${tool} or ${toSDKToolName(tool)}`);

  return `This task can get ${names.join(', ')}.`;
}
