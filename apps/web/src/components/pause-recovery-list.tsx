import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import { buildTaskHref } from '../task/build-task-href';
import { formatTaskState } from '../task/format-task-state';
import { useNixieClient } from '../utils/use-nixie-client';

const list = css({ display: 'flex', flexDirection: 'column', gap: '1', paddingInlineStart: '4' });
const link = css({ color: 'link', textDecoration: 'underline' });

export function PauseRecoveryList(): ReactNode {
  const nixie = useNixieClient();
  const read = useQuery(nixie.queryUtils.recovery.read.queryOptions());
  const toCheck = read.data?.recovery?.toCheck ?? [];

  if (toCheck.length === 0) {
    return null;
  }

  return (
    <div>
      <p>The restore left these tasks to check:</p>
      <ul aria-label="Tasks to check" className={list}>
        {toCheck.map((task) => (
          <li key={task.taskID}>
            <a className={link} href={buildTaskHref(task.taskID)}>
              {task.name}
            </a>
            {` was ${formatTaskState(task.stateAtBackup).toLowerCase()} at the backup`}
            {task.wasRunning ? ', and a step was running' : ''}
            {task.pendingActions === 0
              ? ''
              : `, with ${String(task.pendingActions)} ${task.pendingActions === 1 ? 'action' : 'actions'} waiting for an outcome`}
          </li>
        ))}
      </ul>
    </div>
  );
}
