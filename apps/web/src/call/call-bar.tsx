import { Link, useLocation } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useNow } from '../device/use-now';
import { css } from '../styled-system/css';
import { useCall } from './call-context';
import { CallControls } from './call-controls';
import { formatCallStatus } from './format-call-status';
import { formatCallTime } from './format-call-time';

const bar = css({
  alignItems: 'center',
  backgroundColor: 'canvas',
  borderBottomWidth: '1px',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '3',
  paddingBlock: '2',
  paddingInline: '4',
  position: 'sticky',
  top: '0',
  zIndex: '20',
});

const link = css({ color: 'link', fontSize: 'sm', textDecoration: 'underline' });

// A small bar on every route while a call is live, with the time, mute, hang up and the way back to
// the call screen. The call screen shows the same controls itself, so the bar leaves it out.
export function CallBar(): ReactNode {
  const call = useCall();
  const pathname = useLocation({ select: (location) => location.pathname });
  const nowMs = useNow();
  const phase = call.snapshot.phase;
  const isShown = phase === 'connecting' || phase === 'live' || phase === 'reconnecting';

  if (!isShown || pathname === '/call') {
    return null;
  }

  const startedAtMs = call.snapshot.startedAtMs;

  return (
    <div aria-label="Call in progress" className={bar} role="region">
      <strong>On a call</strong>
      <span>{formatCallStatus(call.snapshot)}</span>
      {startedAtMs === null ? null : <span>{formatCallTime(nowMs - startedAtMs)}</span>}
      <Link className={link} to="/call">
        Back to the call
      </Link>
      <CallControls />
    </div>
  );
}
