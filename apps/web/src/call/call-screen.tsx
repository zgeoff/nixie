import type { ReactNode } from 'react';
import { ApprovalCard } from '../approval/approval-card';
import { useIsHydrated } from '../conversation/use-is-hydrated';
import { useNow } from '../device/use-now';
import { css } from '../styled-system/css';
import { useCall } from './call-context';
import { CallControls } from './call-controls';
import { formatCallEnd } from './format-call-end';
import { formatCallRefusal } from './format-call-refusal';
import { formatCallStatus } from './format-call-status';
import { formatCallTime } from './format-call-time';
import { useCallApprovals } from './use-call-approvals';

const layout = css({
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingBlock: '4',
  paddingInline: '4',
});

const heading = css({ fontSize: 'xl', fontWeight: 'bold' });
const status = css({ fontSize: 'lg', marginBlock: '3' });

const primary = css({
  borderColor: 'borderStrong',
  borderRadius: 'md',
  borderWidth: '1px',
  cursor: 'pointer',
  paddingBlock: '2',
  paddingInline: '4',
  _disabled: { cursor: 'default', opacity: 0.5 },
});

// The call screen: start a call, see its connection state and time, mute, hang up, and approve the
// proposals that the call made. The call itself lives above the router, so leaving this page keeps
// it live.
export function CallScreen(): ReactNode {
  const call = useCall();
  const phase = call.snapshot.phase;
  const isHydrated = useIsHydrated();

  return (
    <main className={layout}>
      <h1 className={heading}>Call</h1>
      <p aria-live="polite" className={status} role="status">
        {formatCallStatus(call.snapshot)}
      </p>
      {phase === 'idle' ? (
        <button
          className={primary}
          disabled={!isHydrated}
          name="start-call"
          onClick={() => {
            void call.session.start();
          }}
          type="button"
        >
          Start a call
        </button>
      ) : null}
      {phase === 'refused' && call.snapshot.refusal !== null ? (
        <>
          <p role="alert">{formatCallRefusal(call.snapshot.refusal)}</p>
          <button className={primary} name="try-again" onClick={call.session.dismiss} type="button">
            Try again
          </button>
        </>
      ) : null}
      {phase === 'ended' ? (
        <>
          <p>{formatCallEnd(call.snapshot.endedBy)}</p>
          <button className={primary} name="new-call" onClick={call.session.dismiss} type="button">
            Start another call
          </button>
        </>
      ) : null}
      {phase === 'connecting' || phase === 'live' || phase === 'reconnecting' ? <LiveCall /> : null}
    </main>
  );
}

function LiveCall(): ReactNode {
  const call = useCall();
  const nowMs = useNow();
  const startedAtMs = call.snapshot.startedAtMs;

  return (
    <>
      {startedAtMs === null ? null : (
        <p aria-label="Call time">{formatCallTime(nowMs - startedAtMs)}</p>
      )}
      <CallControls />
      <CallCards />
    </>
  );
}

// The cards of the proposals made during the call. They show here, on the carrying device's call
// screen, and the card never holds the call.
function CallCards(): ReactNode {
  const call = useCall();
  const approvals = useCallApprovals(call.snapshot.thread);

  if (approvals.items.length === 0) {
    return null;
  }

  return (
    <section aria-label="Proposals from this call">
      <h2 className={css({ fontSize: 'lg', fontWeight: 'bold', marginTop: '4' })}>
        Waiting for you
      </h2>
      <ul>
        {approvals.items.map((item) => (
          <li key={item.proposal.proposalID}>
            <ApprovalCard defer={approvals.defer} item={item} onRefresh={approvals.refresh} />
          </li>
        ))}
      </ul>
    </section>
  );
}
