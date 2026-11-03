import type { PromptOverrides } from '@heynixie/prompts';
import { renderPrompt } from '@heynixie/prompts';
import type { TaskMessaging } from '@heynixie/tasks';
import { match } from 'ts-pattern';
import type { SessionFrame } from './types';

export interface SessionPromptValues {
  readonly taskID: string;

  readonly persona: string;
  readonly skillCatalog: string | null;
  readonly ownerName: string | null;

  readonly messaging: Pick<TaskMessaging, 'directory'>;
  readonly prompts: PromptOverrides;
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
          task: { name: profile?.name ?? values.taskID, brief: profile?.brief ?? '' },
        },
        values.prompts,
      );
    })
    .exhaustive();
}
