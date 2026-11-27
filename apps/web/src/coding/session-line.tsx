import type { ReactNode } from 'react';
import { useIsHydrated } from '../conversation/use-is-hydrated';
import { isTaskShownPaused } from '../pause/is-task-shown-paused';
import { css } from '../styled-system/css';
import type { ListedTask } from '../task/use-live-task-list';
import { formatSessionEventTime } from './format-session-event-time';
import { formatSessionState } from './format-session-state';
import { useIsCodingOn } from './use-is-coding-on';

export interface SessionLineProps {
  readonly task: ListedTask;
}

const line = css({ color: 'textMuted', fontSize: 'sm' });

// What a supervised task shows of its session: that it is a coding session which runs outside
// nixie, its state and the time of its last event. Nothing shows while the coding feature is off.
export function SessionLine(props: SessionLineProps): ReactNode {
  const isCodingOn = useIsCodingOn();
  const isHydrated = useIsHydrated();
  const session = props.task.session;

  if (session?.origin !== 'started' || !isCodingOn) {
    return null;
  }

  return (
    <>
      <p className={line}>
        Coding session, outside nixie: started by nixie
        {' · '}
        <span aria-label="Session state">{formatSessionState(session.state)}</span>
        {isHydrated ? (
          <>
            {' · '}
            {formatSessionEventTime(session.lastEventAt)}
          </>
        ) : null}
      </p>
      {isTaskShownPaused(props.task) || props.task.state === 'paused' ? (
        <p className={line}>The session keeps running while the task is paused.</p>
      ) : null}
    </>
  );
}
