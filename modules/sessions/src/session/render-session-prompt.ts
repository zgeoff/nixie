import type { PromptOverrides } from '@heynixie/prompts';
import { renderPrompt } from '@heynixie/prompts';
import type { TaskMessaging, TaskRunOpened } from '@heynixie/tasks';
import { match } from 'ts-pattern';
import type { SessionFrame } from '../types';
import { pickEnvelopeLabel } from './pick-envelope-label';

export interface SessionPromptValues {
  readonly taskID: string;

  readonly persona: string;
  readonly skillCatalog: string | null;
  readonly ownerName: string | null;

  readonly messaging: Pick<TaskMessaging, 'agentName' | 'directory' | 'ownerName' | 'unlisted'>;
  readonly prompts: PromptOverrides;

  // the report of the step's open task run, or null for a step with none
  readonly report: TaskRunOpened['report'] | null;
}

export function renderSessionPrompt(frame: SessionFrame, values: SessionPromptValues): string {
  const owner = { name: values.ownerName };

  return match(frame)
    .with({ kind: 'conversation' }, () =>
      renderPrompt(
        'session',
        { persona: values.persona, skillCatalog: values.skillCatalog, owner },
        values.prompts,
      ),
    )
    .with({ kind: 'task' }, () => {
      const profile = values.messaging.directory.find((entry) => entry.taskID === values.taskID);

      return renderPrompt(
        'task',
        {
          persona: values.persona,
          owner,
          task: {
            name: profile?.name ?? values.taskID,
            brief: profile?.brief ?? '',
            reportTargetSentence: formatReportTargetSentence(values),
          },
        },
        values.prompts,
      );
    })
    .exhaustive();
}

// The sentence that names where the report of the task run goes: empty under the mode none, for a
// report with no target and for a step with no open task run.
function formatReportTargetSentence(values: SessionPromptValues): string {
  const report = values.report;

  if (report === null || report.mode === 'none' || report.target === null) {
    return '';
  }

  return ` Your report goes to ${pickEnvelopeLabel(values.messaging, report.target)}.`;
}
