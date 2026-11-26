import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { use, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLiveConnection } from '../live/use-live-connection';
import type { StartTimer } from '../utils/start-platform-timer';
import { startPlatformTimer } from '../utils/start-platform-timer';
import { useNixieClient } from '../utils/use-nixie-client';
import { CallBar } from './call-bar';
import { CallContext } from './call-context';
import { CallEnvironmentContext } from './call-environment';
import { createCallSession } from './create-call-session';

export interface CallProviderProps {
  readonly children: ReactNode;
  readonly startTimer?: StartTimer;
}

// Holds the call's peer connection, microphone and live reads above the router, so a route change
// never ends the call, and shows the call bar on every route while a call is live.
export function CallProvider(props: CallProviderProps): ReactNode {
  const nixie = useNixieClient();
  const environment = use(CallEnvironmentContext);
  const startTimer = props.startTimer ?? startPlatformTimer;

  const [session] = useState(() =>
    createCallSession({ calls: nixie.client.calls, environment, startTimer, now: Date.now }),
  );

  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );

  const isFollowing =
    snapshot.callID !== null &&
    (snapshot.phase === 'connecting' ||
      snapshot.phase === 'live' ||
      snapshot.phase === 'reconnecting');

  const view = useQuery({
    ...nixie.queryUtils.calls.get.queryOptions({ input: { callID: snapshot.callID ?? '' } }),
    enabled: isFollowing,
    retry: true,
    retryDelay: 1000,
  });

  const viewData = view.data;
  const phase = snapshot.phase;

  useEffect(() => {
    if (viewData !== undefined && isFollowing) {
      session.observe(viewData);
    }
  }, [session, viewData, isFollowing, phase]);

  return (
    <CallContext value={{ session, snapshot }}>
      {isFollowing ? <FollowedCall /> : null}
      <Speaker stream={snapshot.remoteStream} />
      <CallBar />
      {props.children}
    </CallContext>
  );
}

// Keeps the live stream open while a call runs, so the server's word on the call reaches the
// device on any page.
function FollowedCall(): ReactNode {
  useLiveConnection();

  return null;
}

interface SpeakerProps {
  readonly stream: MediaStream | null;
}

function Speaker(props: SpeakerProps): ReactNode {
  const element = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (element.current !== null) {
      element.current.srcObject = props.stream;
    }
  }, [props.stream]);

  return <audio autoPlay ref={element} />;
}
