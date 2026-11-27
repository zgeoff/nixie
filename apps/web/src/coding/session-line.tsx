import type { ReactNode } from 'react';
import { useIsHydrated } from '../conversation/use-is-hydrated';
import { isFeatureOn } from '../features/is-feature-on';
import { useFeatures } from '../features/use-features';
import { isTaskShownPaused } from '../pause/is-task-shown-paused';
import { css } from '../styled-system/css';
import type { ListedTask } from '../task/use-live-task-list';
import { formatSessionState } from './format-session-state';

export interface SessionLineProps {
  readonly task: ListedTask;
}

const line = css({ color: 'textMuted', fontSize: 'sm' });

const timeFormat: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  month: 'short',
  second: '2-digit',
};

// What a supervised task shows of its session: that it is a coding session which runs outside
// nixie, its state and the time of its last event. Nothing shows while the coding feature is off.
export function SessionLine(props: SessionLineProps): ReactNode {
  const features = useFeatures();
  const isHydrated = useIsHydrated();
  const session = props.task.session;

  if (session === undefined || !isFeatureOn(features, 'coding')) {
    return null;
  }

  return (
    <>
      <p className={line}>
        Coding session, outside nixie: {session.origin === 'started' ? 'started' : 'joined'} by
        nixie
        {' · '}
        <span aria-label="Session state">{formatSessionState(session.state)}</span>
        {isHydrated ? (
          <>
            {' · '}
            {session.lastEventAt === null
              ? 'No event yet'
              : `Last event ${session.lastEventAt.toLocaleString(undefined, timeFormat)}`}
          </>
        ) : null}
      </p>
      {isTaskShownPaused(props.task) || props.task.state === 'paused' ? (
        <p className={line}>The session keeps running while the task is paused.</p>
      ) : null}
    </>
  );
}
